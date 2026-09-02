import { describe, it, expect, beforeEach } from 'vitest';
import type { Query } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { EmbeddedRagChunk } from '@/shared/rag/domain/rag-types';
import { isAnsweredRag } from '@/shared/rag/domain/rag-types';
import type { LLMProvider } from '@/shared/rag/ports/llm-provider.port';
import { FakeEmbeddingProvider } from '@/modules/documents/infrastructure/embedding/fake-embedding.provider';
import { InMemoryVectorStore } from '@/modules/documents/infrastructure/vector-store/in-memory-vector.store';
import { RetrievalService } from './retrieval.service';
import { RagService } from './rag.service';
import { NO_EVIDENCE_MESSAGE } from './rag-prompt';

const embedding = new FakeEmbeddingProvider();

/** Persistência in-memory de Query + Citations aninhadas (sem `any`). */
interface CitationCreate {
  readonly documentChunkId: string;
  readonly rank: number;
  readonly score: number;
  readonly snippet: string;
}
interface QueryCreateData {
  readonly userId: string;
  readonly question: string;
  readonly answer?: string | null;
  readonly hadSufficientEvidence?: boolean;
  readonly modelId?: string | null;
  readonly latencyMs?: number | null;
  readonly citations?: { readonly create: readonly CitationCreate[] };
}

class FakePrisma {
  readonly queries = new Map<string, Query>();
  readonly persistedCitations: CitationCreate[] = [];
  /** Chunks conhecidos: chave `${documentId}:${chunkIndex}` -> id. */
  readonly chunkIds = new Map<string, string>();
  private seq = 0;

  readonly query = {
    create: ({ data }: { data: QueryCreateData }): Promise<Query> => {
      this.seq += 1;
      const id = `q-${this.seq}`;
      const row: Query = {
        id,
        userId: data.userId,
        question: data.question,
        answer: data.answer ?? null,
        hadSufficientEvidence: data.hadSufficientEvidence ?? false,
        modelId: data.modelId ?? null,
        latencyMs: data.latencyMs ?? null,
        createdAt: new Date(),
      };
      this.queries.set(id, row);
      if (data.citations) {
        this.persistedCitations.push(...data.citations.create);
      }
      return Promise.resolve(row);
    },
  };

  readonly documentChunk = {
    findMany: ({
      where,
    }: {
      where: { documentId: { in: string[] } };
    }): Promise<
      { id: string; documentId: string; chunkIndex: number }[]
    > => {
      const rows: { id: string; documentId: string; chunkIndex: number }[] = [];
      for (const [key, id] of this.chunkIds.entries()) {
        const [documentId, chunkIndexRaw] = key.split(':');
        if (documentId && where.documentId.in.includes(documentId)) {
          rows.push({
            id,
            documentId,
            chunkIndex: Number.parseInt(chunkIndexRaw ?? '0', 10),
          });
        }
      }
      return Promise.resolve(rows);
    },
  };

  asPrismaService(): PrismaService {
    return this as unknown as PrismaService;
  }
}

/** ConfigService fake: só HF_MODEL é lido pelo RagService. */
function fakeConfig(): ConfigService<Env, true> {
  return {
    get: (key: string): string => (key === 'HF_MODEL' ? 'fake-model' : ''),
  } as unknown as ConfigService<Env, true>;
}

/** LLM fake com resposta configurável. */
class ConfigurableLLM implements LLMProvider {
  constructor(private readonly response: string) {}
  generate(): Promise<string> {
    return Promise.resolve(this.response);
  }
  async *generateStream(): AsyncIterable<string> {
    yield await this.generate();
  }
}

async function embeddedChunk(
  documentId: string,
  chunkIndex: number,
  content: string,
): Promise<EmbeddedRagChunk> {
  const [vector] = await embedding.embed([content]);
  return {
    documentId,
    chunkIndex,
    content,
    startOffset: 0,
    endOffset: content.length,
    tokenCount: Math.ceil(content.length / 4),
    metadata: {},
    embedding: vector ?? [],
  };
}

function buildRag(prisma: FakePrisma, vectorStore: InMemoryVectorStore, llm: LLMProvider): RagService {
  const retrieval = new RetrievalService(embedding, vectorStore);
  return new RagService(prisma.asPrismaService(), retrieval, llm, fakeConfig());
}

describe('RagService', () => {
  let prisma: FakePrisma;
  let vectorStore: InMemoryVectorStore;

  beforeEach(() => {
    prisma = new FakePrisma();
    vectorStore = new InMemoryVectorStore();
  });

  it('answered: LLM retorna JSON válido -> citações reais persistidas', async () => {
    const question = 'Qual é a capital?';
    await vectorStore.upsert([await embeddedChunk('doc-a', 0, question)]);
    prisma.chunkIds.set('doc-a:0', 'chunk-real-1');

    const llm = new ConfigurableLLM(
      JSON.stringify({
        answer: 'A resposta com base em [1].',
        citations: [{ sourceIndex: 1 }],
      }),
    );
    const service = buildRag(prisma, vectorStore, llm);

    const result = await service.ask({ userId: 'u1', question });

    expect(isAnsweredRag(result.answer)).toBe(true);
    expect(result.hadSufficientEvidence).toBe(true);
    expect(result.modelId).toBe('fake-model');
    if (isAnsweredRag(result.answer)) {
      expect(result.answer.citations).toHaveLength(1);
      expect(result.answer.citations[0]).toMatchObject({
        documentId: 'doc-a',
        chunkIndex: 0,
        rank: 1,
      });
    }
    // Citation persistida aponta para o id REAL do chunk.
    expect(prisma.persistedCitations).toHaveLength(1);
    expect(prisma.persistedCitations[0]?.documentChunkId).toBe('chunk-real-1');
    expect(prisma.queries.get(result.queryId)?.hadSufficientEvidence).toBe(true);
  });

  it('no_evidence: retrieval insuficiente -> mensagem padrão, sem citações', async () => {
    // vector store vazio -> insufficient
    const llm = new ConfigurableLLM('não deveria ser chamado');
    const service = buildRag(prisma, vectorStore, llm);

    const result = await service.ask({ userId: 'u1', question: 'nada indexado' });

    expect(result.answer.kind).toBe('no_evidence');
    expect(result.answer.text).toBe(NO_EVIDENCE_MESSAGE);
    expect(result.hadSufficientEvidence).toBe(false);
    expect(prisma.persistedCitations).toHaveLength(0);
    expect(prisma.queries.get(result.queryId)?.hadSufficientEvidence).toBe(false);
  });

  it('JSON malformado do LLM: fallback não quebra e não inventa fonte', async () => {
    const question = 'pergunta válida';
    await vectorStore.upsert([await embeddedChunk('doc-a', 0, question)]);
    prisma.chunkIds.set('doc-a:0', 'chunk-real-1');

    // Texto livre citando [1] (existe) e [9] (não existe) — sem JSON válido.
    const llm = new ConfigurableLLM('Resposta livre baseada em [1] e também [9].');
    const service = buildRag(prisma, vectorStore, llm);

    const result = await service.ask({ userId: 'u1', question });

    expect(isAnsweredRag(result.answer)).toBe(true);
    if (isAnsweredRag(result.answer)) {
      // [1] mantida (existe), [9] descartada (inventada).
      expect(result.answer.citations).toHaveLength(1);
      expect(result.answer.citations[0]?.documentId).toBe('doc-a');
      expect(result.answer.text).toContain('[1]');
    }
    expect(prisma.persistedCitations).toHaveLength(1);
    expect(prisma.persistedCitations[0]?.documentChunkId).toBe('chunk-real-1');
  });

  it('descarta índices de citação estruturados que não existem no contexto', async () => {
    const question = 'outra pergunta';
    await vectorStore.upsert([await embeddedChunk('doc-a', 0, question)]);
    prisma.chunkIds.set('doc-a:0', 'chunk-real-1');

    const llm = new ConfigurableLLM(
      JSON.stringify({
        answer: 'cita fontes inexistentes',
        citations: [{ sourceIndex: 5 }, { sourceIndex: 42 }],
      }),
    );
    const service = buildRag(prisma, vectorStore, llm);

    const result = await service.ask({ userId: 'u1', question });

    if (isAnsweredRag(result.answer)) {
      expect(result.answer.citations).toHaveLength(0);
    }
    expect(prisma.persistedCitations).toHaveLength(0);
  });
});
