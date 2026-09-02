/**
 * Porta: VectorStore.
 *
 * Abstrai a persistência e busca vetorial. O adapter concreto é pgvector
 * (ver ADR 0001) e é implementado em `infrastructure` na Etapa 06, via
 * `$executeRaw`/`$queryRaw` porque a coluna `vector` é `Unsupported` no Prisma.
 *
 * Similaridade: cosseno (ADR 0003). `topK` default = 5. Filtros permitem
 * escopar a busca por documento e por usuário (isolamento multi-tenant simples).
 */
import type { EmbeddedRagChunk, ScoredChunk } from '../domain/rag-types';

/** topK padrão de recuperação quando o chamador não especifica. */
export const DEFAULT_TOP_K = 5;

export interface SimilarityFilters {
  /** Restringe a busca a um usuário (dono dos documentos). */
  readonly userId?: string;
  /** Restringe a busca a documentos específicos. */
  readonly documentIds?: readonly string[];
}

export interface VectorStore {
  /** Insere/atualiza chunks com embedding (idempotente por (documentId, chunkIndex)). */
  upsert(chunks: readonly EmbeddedRagChunk[]): Promise<void>;
  /** Busca os `topK` chunks mais similares ao embedding da query. */
  similaritySearch(
    queryEmbedding: readonly number[],
    topK: number,
    filters?: SimilarityFilters,
  ): Promise<ScoredChunk[]>;
}

export const VECTOR_STORE = Symbol('VectorStore');
