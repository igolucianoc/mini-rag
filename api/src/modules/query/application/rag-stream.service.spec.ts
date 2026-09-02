import { describe, it, expect, beforeEach } from 'vitest';
import type { Query } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/core/config/env.schema';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { EmbeddedRagChunk } from '@/core/rag/domain/rag-types';
import type { LLMProvider } from '@/core/rag/ports/llm-provider.port';
import { FakeEmbeddingProvider } from '@/infra/rag/embedding/fake-embedding.provider';
import { InMemoryVectorStore } from '@/infra/rag/vector-store/in-memory-vector.store';
import { RetrievalService } from './retrieval.service';
import { RagAnswerService } from './rag-answer.service';
import { RagStreamService } from './rag-stream.service';
import { NO_EVIDENCE_MESSAGE } from '../domain/rag-prompt';
import type { RagStreamEvent } from '../domain/rag-stream.events';

const embedding = new FakeEmbeddingProvider();

/** Segredo que NUNCA pode aparecer numa mensagem `failed` sanitizada. */
const HF_TOKEN = 'hf_supersecrettoken_should_never_leak';

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
    }): Promise<{ id: string; documentId: string; chunkIndex: number }[]> => {
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

/** ConfigService fake: só HF_MODEL é lido. */
function fakeConfig(): ConfigService<Env, true> {
  return {
    get: (key: string): string => (key === 'HF_MODEL' ? 'fake-model' : ''),
  } as unknown as ConfigService<Env, true>;
}

/** LLM que emite vários tokens no stream a partir de uma resposta configurável. */
class StreamingLLM implements LLMProvider {
  constructor(private readonly response: string) {}
  generate(): Promise<string> {
    return Promise.resolve(this.response);
  }
  async *generateStream(): AsyncIterable<string> {
    const full = await this.generate();
    // Emite em fragmentos de 8 chars para exercitar múltiplos `token`.
    for (let i = 0; i < full.length; i += 8) {
      yield full.slice(i, i + 8);
    }
  }
}

/** LLM cujo generateStream lança um erro contendo o HF_TOKEN. */
class FailingLLM implements LLMProvider {
  generate(): Promise<string> {
    return Promise.reject(new Error(`boom com ${HF_TOKEN}`));
  }
  async *generateStream(): AsyncIterable<string> {
    await Promise.resolve();
    // yield inalcançável apenas para tipar o gerador como AsyncIterable<string>.
    if (Date.now() < 0) {
      yield '';
    }
    throw new Error(`falha interna vazando ${HF_TOKEN}`);
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

function buildStream(
  prisma: FakePrisma,
  vectorStore: InMemoryVectorStore,
  llm: LLMProvider,
): RagStreamService {
  const retrieval = new RetrievalService(embedding, vectorStore);
  const answerService = new RagAnswerService(
    prisma.asPrismaService(),
    llm,
    fakeConfig(),
  );
  return new RagStreamService(retrieval, answerService);
}

/** Coleta todos os eventos do async generator num array. */
async function collect(
  events: AsyncIterable<RagStreamEvent>,
): Promise<RagStreamEvent[]> {
  const out: RagStreamEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

const types = (events: readonly RagStreamEvent[]): string[] =>
  events.map((e) => e.type);

describe('RagStreamService', () => {
  let prisma: FakePrisma;
  let vectorStore: InMemoryVectorStore;

  beforeEach(() => {
    prisma = new FakePrisma();
    vectorStore = new InMemoryVectorStore();
  });

  it('fluxo feliz: started -> retrieving -> context_ready -> token(vários) -> source(>=1) -> completed', async () => {
    const question = 'Qual é a capital?';
    await vectorStore.upsert([await embeddedChunk('doc-a', 0, question)]);
    prisma.chunkIds.set('doc-a:0', 'chunk-real-1');

    const llm = new StreamingLLM(
      JSON.stringify({
        answer: 'A resposta longa o suficiente para gerar vários fragmentos [1].',
        citations: [{ sourceIndex: 1 }],
      }),
    );
    const service = buildStream(prisma, vectorStore, llm);

    const events = await collect(service.askStream({ userId: 'u1', question }));
    const order = types(events);

    expect(order[0]).toBe('started');
    expect(order[1]).toBe('retrieving');
    expect(order[2]).toBe('context_ready');
    expect(order.at(-1)).toBe('completed');
    expect(order).not.toContain('failed');

    const tokenCount = events.filter((e) => e.type === 'token').length;
    expect(tokenCount).toBeGreaterThan(1);

    const sourceEvents = events.filter((e) => e.type === 'source');
    expect(sourceEvents.length).toBeGreaterThanOrEqual(1);

    // context_ready traz as fontes numeradas.
    const contextReady = events.find((e) => e.type === 'context_ready');
    expect(contextReady?.type === 'context_ready' && contextReady.sources[0]).toMatchObject({
      index: 1,
      documentId: 'doc-a',
      chunkIndex: 0,
    });

    const completed = events.at(-1);
    expect(completed?.type).toBe('completed');
    if (completed?.type === 'completed') {
      expect(completed.result.hadSufficientEvidence).toBe(true);
      expect(completed.result.modelId).toBe('fake-model');
      expect(completed.result.answer).toContain('[1]');
      expect(completed.result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(completed.result.citations).toHaveLength(1);
      expect(completed.result.citations[0]).toMatchObject({
        documentId: 'doc-a',
        chunkIndex: 0,
        rank: 1,
      });
      expect(completed.result.queryId).toBe('q-1');
    }

    // Citação persistida aponta para o id REAL do chunk.
    expect(prisma.persistedCitations).toHaveLength(1);
    expect(prisma.persistedCitations[0]?.documentChunkId).toBe('chunk-real-1');
  });

  it('sem evidência: started -> retrieving -> completed (sem token/source, sem failed)', async () => {
    const llm = new StreamingLLM('não deveria ser chamado');
    const service = buildStream(prisma, vectorStore, llm);

    const events = await collect(
      service.askStream({ userId: 'u1', question: 'nada indexado' }),
    );

    expect(types(events)).toEqual(['started', 'retrieving', 'completed']);

    const completed = events.at(-1);
    if (completed?.type === 'completed') {
      expect(completed.result.hadSufficientEvidence).toBe(false);
      expect(completed.result.answer).toBe(NO_EVIDENCE_MESSAGE);
      expect(completed.result.citations).toHaveLength(0);
      expect(completed.result.modelId).toBeNull();
    }
    expect(prisma.persistedCitations).toHaveLength(0);
    expect(prisma.queries.get('q-1')?.hadSufficientEvidence).toBe(false);
  });

  it('erro no LLM: started -> retrieving -> context_ready -> failed (sanitizado), e encerra', async () => {
    const question = 'pergunta com evidência';
    await vectorStore.upsert([await embeddedChunk('doc-a', 0, question)]);
    prisma.chunkIds.set('doc-a:0', 'chunk-real-1');

    const service = buildStream(prisma, vectorStore, new FailingLLM());

    const events = await collect(service.askStream({ userId: 'u1', question }));
    const order = types(events);

    expect(order[0]).toBe('started');
    expect(order[1]).toBe('retrieving');
    expect(order[2]).toBe('context_ready');
    expect(order.at(-1)).toBe('failed');
    // Encerra após failed: nenhum evento depois dele.
    expect(order.filter((t) => t === 'failed')).toHaveLength(1);
    expect(order).not.toContain('completed');
  });

  it('failed não vaza HF_TOKEN nem detalhes do erro', async () => {
    const question = 'pergunta com evidência';
    await vectorStore.upsert([await embeddedChunk('doc-a', 0, question)]);
    prisma.chunkIds.set('doc-a:0', 'chunk-real-1');

    const service = buildStream(prisma, vectorStore, new FailingLLM());

    const events = await collect(service.askStream({ userId: 'u1', question }));
    const failed = events.at(-1);

    expect(failed?.type).toBe('failed');
    if (failed?.type === 'failed') {
      expect(failed.message).not.toContain(HF_TOKEN);
      expect(failed.message).not.toContain('falha interna');
      expect(failed.message.length).toBeGreaterThan(0);
    }
  });
});
