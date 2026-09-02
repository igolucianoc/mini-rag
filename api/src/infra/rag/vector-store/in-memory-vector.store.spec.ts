import { describe, it, expect, beforeEach } from 'vitest';
import type { EmbeddedRagChunk } from '@/core/rag/domain/rag-types';
import { InMemoryVectorStore } from './in-memory-vector.store';

function makeChunk(
  documentId: string,
  chunkIndex: number,
  embedding: number[],
): EmbeddedRagChunk {
  return {
    documentId,
    chunkIndex,
    content: `chunk ${documentId}-${chunkIndex}`,
    startOffset: 0,
    endOffset: 10,
    tokenCount: 3,
    metadata: {},
    embedding,
  };
}

describe('InMemoryVectorStore', () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it('upsert é idempotente por (documentId, chunkIndex)', async () => {
    await store.upsert([makeChunk('d1', 0, [1, 0, 0])]);
    await store.upsert([makeChunk('d1', 0, [0, 1, 0])]);
    expect(store.size).toBe(1);
  });

  it('similaritySearch retorna topK ordenado por cosseno decrescente', async () => {
    await store.upsert([
      makeChunk('d1', 0, [1, 0, 0]), // idêntico à query
      makeChunk('d1', 1, [0.9, 0.1, 0]), // próximo
      makeChunk('d1', 2, [0, 1, 0]), // ortogonal
    ]);

    const results = await store.similaritySearch([1, 0, 0], 2);

    expect(results).toHaveLength(2);
    expect(results[0]?.chunk.chunkIndex).toBe(0);
    expect(results[1]?.chunk.chunkIndex).toBe(1);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 1);
    // cosseno do vetor idêntico ~ 1
    expect(results[0]?.score).toBeCloseTo(1, 5);
  });

  it('respeita o filtro documentIds', async () => {
    await store.upsert([
      makeChunk('d1', 0, [1, 0, 0]),
      makeChunk('d2', 0, [1, 0, 0]),
    ]);

    const results = await store.similaritySearch([1, 0, 0], 5, {
      documentIds: ['d2'],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.documentId).toBe('d2');
  });

  it('limita ao topK', async () => {
    await store.upsert([
      makeChunk('d1', 0, [1, 0, 0]),
      makeChunk('d1', 1, [0.8, 0.2, 0]),
      makeChunk('d1', 2, [0.6, 0.4, 0]),
    ]);
    const results = await store.similaritySearch([1, 0, 0], 1);
    expect(results).toHaveLength(1);
  });
});
