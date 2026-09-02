import type { EmbeddedRagChunk, ScoredChunk } from '@/shared/rag/domain/rag-types';
import type { SimilarityFilters, VectorStore } from '@/shared/rag/ports/vector-store.port';

/**
 * VectorStore em memória — para testes do fluxo de ingestão sem banco.
 * Guarda `EmbeddedRagChunk` em um Map chaveado por `documentId:chunkIndex`
 * (mesma regra de unicidade do schema Prisma) e calcula similaridade de cosseno
 * em JS puro.
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly store = new Map<string, EmbeddedRagChunk>();

  /** Chave composta idêntica à unique constraint do banco. */
  private key(documentId: string, chunkIndex: number): string {
    return `${documentId}:${chunkIndex}`;
  }

  upsert(chunks: readonly EmbeddedRagChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.store.set(this.key(chunk.documentId, chunk.chunkIndex), chunk);
    }
    return Promise.resolve();
  }

  similaritySearch(
    queryEmbedding: readonly number[],
    topK: number,
    filters?: SimilarityFilters,
  ): Promise<ScoredChunk[]> {
    const candidates: ScoredChunk[] = [];

    for (const chunk of this.store.values()) {
      if (filters?.documentIds && !filters.documentIds.includes(chunk.documentId)) {
        continue;
      }
      // userId filter: o InMemoryVectorStore não possui relação com Document.userId
      // diretamente. Nos testes a filtragem por userId pode ser omitida (PgVectorStore
      // resolve via JOIN). Se passada aqui, ignora-se graciosamente (documentIds é
      // o filtro relevante para testes unitários).

      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      candidates.push({
        chunk: {
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          tokenCount: chunk.tokenCount,
          metadata: chunk.metadata,
        },
        score,
      });
    }

    const ranked = candidates.sort((a, b) => b.score - a.score).slice(0, topK);
    return Promise.resolve(ranked);
  }

  /** Getter para testes: quantidade de chunks armazenados. */
  get size(): number {
    return this.store.size;
  }

  /** Limpa o store (útil em beforeEach de teste). */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Similaridade de cosseno entre dois vetores. Assume mesma dimensão.
 * Retorna 0 quando algum vetor tem norma 0 (fallback seguro).
 */
function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
