import { describe, it, expect, beforeEach } from 'vitest';
import type { EmbeddedRagChunk } from '@/core/rag/domain/rag-types';
import { isSufficientRetrieval } from '@/core/rag/domain/rag-types';
import { FakeEmbeddingProvider } from '@/infra/rag/embedding/fake-embedding.provider';
import { InMemoryVectorStore } from '@/infra/rag/vector-store/in-memory-vector.store';
import type { SimilarityFilters, VectorStore } from '@/core/rag/ports/vector-store.port';
import type { ScoredChunk } from '@/core/rag/domain/rag-types';
import { RetrievalService } from './retrieval.service';

const embedding = new FakeEmbeddingProvider();

/** Cria um EmbeddedRagChunk cujo embedding é o do próprio conteúdo (determinístico). */
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

describe('RetrievalService', () => {
  let vectorStore: InMemoryVectorStore;
  let service: RetrievalService;

  beforeEach(() => {
    vectorStore = new InMemoryVectorStore();
    service = new RetrievalService(embedding, vectorStore);
  });

  it('sufficient: chunk idêntico à pergunta (score ~1) acima do limiar', async () => {
    const question = 'O que é RAG?';
    await vectorStore.upsert([await embeddedChunk('doc-a', 0, question)]);

    const result = await service.retrieve({ userId: 'u1', question });

    expect(isSufficientRetrieval(result)).toBe(true);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]?.score).toBeGreaterThan(0.99);
  });

  it('insufficient: nenhum chunk atinge o limiar -> reason presente', async () => {
    await vectorStore.upsert([
      await embeddedChunk('doc-a', 0, 'assunto totalmente diferente'),
    ]);

    const result = await service.retrieve({
      userId: 'u1',
      question: 'pergunta sem relação nenhuma aqui',
      similarityThreshold: 0.99, // força insuficiência
    });

    expect(result.kind).toBe('insufficient');
    if (result.kind === 'insufficient') {
      expect(result.reason).toMatch(/limiar/);
    }
  });

  it('insufficient com reason específico quando não há nada indexado', async () => {
    const result = await service.retrieve({ userId: 'u1', question: 'qualquer' });
    expect(result.kind).toBe('insufficient');
    if (result.kind === 'insufficient') {
      expect(result.reason).toMatch(/Nenhum documento indexado/);
    }
  });

  it('repassa os filtros (userId, documentIds, topK) ao vector store', async () => {
    const captured: {
      topK?: number;
      filters?: SimilarityFilters;
    } = {};
    const spyStore: VectorStore = {
      upsert: () => Promise.resolve(),
      similaritySearch: (
        _embedding: readonly number[],
        topK: number,
        filters?: SimilarityFilters,
      ): Promise<ScoredChunk[]> => {
        captured.topK = topK;
        captured.filters = filters;
        return Promise.resolve([]);
      },
    };
    const spyService = new RetrievalService(embedding, spyStore);

    await spyService.retrieve({
      userId: 'u1',
      question: 'q',
      topK: 3,
      documentIds: ['doc-a', 'doc-b'],
    });

    expect(captured.topK).toBe(3);
    expect(captured.filters?.userId).toBe('u1');
    expect(captured.filters?.documentIds).toEqual(['doc-a', 'doc-b']);
  });
});
