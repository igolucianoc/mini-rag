import { describe, it, expect, beforeEach } from 'vitest';
import type { Document, IngestionRun } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { FakeEmbeddingProvider } from '../../../infra/rag/embedding/fake-embedding.provider';
import { InMemoryVectorStore } from '../../../infra/rag/vector-store/in-memory-vector.store';
import {
  MarkdownParser,
} from '../persistence/parsers/markdown.parser';
import { TxtParser } from '../persistence/parsers/txt.parser';
import { PdfParser } from '../persistence/parsers/pdf.parser';
import { ParserRegistry } from '../persistence/parsers/parser-registry';
import type { PdfTextExtractor } from '../persistence/parsers/pdf-text-extractor';
import { IngestionService } from './ingestion.service';

/**
 * Fake do PrismaService só com o necessário para a ingestão: create/update de
 * Document e IngestionRun em memória + $transaction que apenas aguarda os ops.
 * Não usa `any`: modela as linhas com os tipos gerados do Prisma.
 */
class FakePrisma {
  readonly documents = new Map<string, Document>();
  readonly runs = new Map<string, IngestionRun>();
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  readonly document = {
    create: ({ data }: { data: Partial<Document> }): Promise<Document> => {
      const id = this.nextId('doc');
      const now = new Date();
      const row: Document = {
        id,
        userId: data.userId ?? '',
        title: data.title ?? '',
        sourceType: data.sourceType ?? 'TXT',
        originalFilename: data.originalFilename ?? '',
        mimeType: data.mimeType ?? '',
        sizeBytes: data.sizeBytes ?? 0,
        status: data.status ?? 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      this.documents.set(id, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Document>;
    }): Promise<Document> => {
      const row = this.documents.get(where.id);
      if (!row) {
        throw new Error(`Document ${where.id} não existe`);
      }
      const updated: Document = { ...row, ...data, updatedAt: new Date() };
      this.documents.set(where.id, updated);
      return Promise.resolve(updated);
    },
  };

  readonly ingestionRun = {
    create: ({
      data,
    }: {
      data: Partial<IngestionRun>;
    }): Promise<IngestionRun> => {
      const id = this.nextId('run');
      const row: IngestionRun = {
        id,
        documentId: data.documentId ?? '',
        status: data.status ?? 'PENDING',
        startedAt: new Date(),
        finishedAt: null,
        error: null,
        chunkCount: 0,
        stats: {},
      };
      this.runs.set(id, row);
      return Promise.resolve(row);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<IngestionRun>;
    }): Promise<IngestionRun> => {
      const row = this.runs.get(where.id);
      if (!row) {
        throw new Error(`IngestionRun ${where.id} não existe`);
      }
      const updated: IngestionRun = { ...row, ...data };
      this.runs.set(where.id, updated);
      return Promise.resolve(updated);
    },
  };

  $transaction<T>(ops: readonly Promise<T>[]): Promise<T[]> {
    return Promise.all(ops);
  }

  /** Expõe a instância como PrismaService para o construtor do service. */
  asPrismaService(): PrismaService {
    return this as unknown as PrismaService;
  }
}

const buf = (s: string): Buffer => Buffer.from(s, 'utf-8');

function buildService(
  prisma: FakePrisma,
  vectorStore: InMemoryVectorStore,
): IngestionService {
  const pdfExtractor: PdfTextExtractor = () =>
    Promise.resolve({ text: 'pdf text', pageCount: 1 });
  const registry = new ParserRegistry([
    new MarkdownParser(),
    new TxtParser(),
    new PdfParser(pdfExtractor),
  ]);
  return new IngestionService(
    prisma.asPrismaService(),
    registry,
    new FakeEmbeddingProvider(),
    vectorStore,
  );
}

describe('IngestionService', () => {
  let prisma: FakePrisma;
  let vectorStore: InMemoryVectorStore;
  let service: IngestionService;

  beforeEach(() => {
    prisma = new FakePrisma();
    vectorStore = new InMemoryVectorStore();
    service = buildService(prisma, vectorStore);
  });

  it('fluxo feliz: cria documento READY, run COMPLETED e chunks com contagem correta', async () => {
    const text = 'A'.repeat(2500); // gera múltiplos chunks (chunkSize 1000, overlap 200)
    const result = await service.ingest({
      userId: 'u1',
      file: {
        buffer: buf(text),
        originalFilename: 'big.txt',
        mimeType: 'text/plain',
        sizeBytes: text.length,
      },
    });

    expect(result.status).toBe('READY');
    expect(result.chunkCount).toBeGreaterThan(1);

    const doc = prisma.documents.get(result.documentId);
    const run = prisma.runs.get(result.ingestionRunId);
    expect(doc?.status).toBe('READY');
    expect(run?.status).toBe('COMPLETED');
    expect(run?.chunkCount).toBe(result.chunkCount);
    expect(run?.finishedAt).toBeInstanceOf(Date);
    // chunks foram persistidos no vector store
    expect(vectorStore.size).toBe(result.chunkCount);
  });

  it('mimetype inválido: lança antes de criar qualquer registro', async () => {
    await expect(
      service.ingest({
        userId: 'u1',
        file: {
          buffer: buf('x'),
          originalFilename: 'a.png',
          mimeType: 'image/png',
          sizeBytes: 1,
        },
      }),
    ).rejects.toThrow(/não suportado/);
    expect(prisma.documents.size).toBe(0);
    expect(prisma.runs.size).toBe(0);
  });

  it('texto vazio após normalização: FAILED, sem chunks', async () => {
    const result = await service.ingest({
      userId: 'u1',
      file: {
        buffer: buf('   \n\n\n   '),
        originalFilename: 'empty.txt',
        mimeType: 'text/plain',
        sizeBytes: 8,
      },
    });

    expect(result.status).toBe('FAILED');
    expect(result.chunkCount).toBe(0);
    expect(result.error).toBeDefined();

    const doc = prisma.documents.get(result.documentId);
    const run = prisma.runs.get(result.ingestionRunId);
    expect(doc?.status).toBe('FAILED');
    expect(run?.status).toBe('FAILED');
    expect(vectorStore.size).toBe(0);
  });

  it('erro no parse: documento FAILED e nenhum chunk', async () => {
    // extrator de PDF que lança simula parse inválido
    const failingExtractor: PdfTextExtractor = () =>
      Promise.reject(new Error('PDF corrompido'));
    const registry = new ParserRegistry([
      new MarkdownParser(),
      new TxtParser(),
      new PdfParser(failingExtractor),
    ]);
    service = new IngestionService(
      prisma.asPrismaService(),
      registry,
      new FakeEmbeddingProvider(),
      vectorStore,
    );

    const result = await service.ingest({
      userId: 'u1',
      file: {
        buffer: buf('%PDF-1.4'),
        originalFilename: 'bad.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 8,
      },
    });

    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('PDF corrompido');
    expect(vectorStore.size).toBe(0);
    expect(prisma.documents.get(result.documentId)?.status).toBe('FAILED');
  });
});
