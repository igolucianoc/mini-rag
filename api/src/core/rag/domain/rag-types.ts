/**
 * Tipos de domínio do pipeline RAG.
 *
 * Estes tipos são transversais aos slices (ingestion e query) e não dependem
 * de nenhum SDK de provider. Ficam em `src/core/rag/` porque parser, chunker,
 * embedding, vector store e LLM são contratos usados por mais de um slice; deixá-los
 * em um único slice criaria acoplamento entre slices (query importando de ingestion).
 */

/**
 * Chunk de documento pronto para indexação/recuperação.
 * `embedding` é opcional porque o chunk existe antes de ser embedado
 * (fluxo: parse -> chunk -> embed -> upsert).
 */
export interface RagChunk {
  /** Id do documento de origem. */
  readonly documentId: string;
  /** Índice ordinal do chunk dentro do documento (0-based). */
  readonly chunkIndex: number;
  /** Texto normalizado do chunk. */
  readonly content: string;
  /** Offset inicial (inclusive) no texto normalizado do documento. */
  readonly startOffset: number;
  /** Offset final (exclusivo) no texto normalizado do documento. */
  readonly endOffset: number;
  /** Contagem aproximada de tokens do chunk. */
  readonly tokenCount: number;
  /** Metadados livres do chunk (título de seção, página etc.). */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Chunk com embedding já calculado, pronto para `VectorStore.upsert`. */
export interface EmbeddedRagChunk extends RagChunk {
  /** Vetor de embedding (dimensão definida pelo EmbeddingProvider). */
  readonly embedding: readonly number[];
}

/** Chunk recuperado por similaridade, com pontuação. */
export interface ScoredChunk {
  readonly chunk: RagChunk;
  /** Similaridade de cosseno normalizada em [0, 1] (1 = idêntico). */
  readonly score: number;
}

/**
 * Fonte citável: aponta para o chunk que embasou um trecho da resposta.
 * `Citation` é o mesmo conceito com o ranking usado na resposta.
 */
export interface Source {
  readonly documentId: string;
  readonly chunkIndex: number;
  /** Trecho literal usado como evidência. */
  readonly snippet: string;
  readonly score: number;
}

/** Citação = fonte com posição (rank) na lista de evidências da resposta. */
export interface Citation extends Source {
  /** Posição da citação na resposta (1-based). */
  readonly rank: number;
}

/**
 * Resultado da recuperação (retrieval), modelado como discriminated union:
 * ou há evidência suficiente (chunks acima do limiar), ou não há.
 */
export type RetrievalResult =
  | {
      readonly kind: 'sufficient';
      readonly chunks: readonly ScoredChunk[];
    }
  | {
      readonly kind: 'insufficient';
      /** Chunks recuperados (podem existir, mas abaixo do limiar de confiança). */
      readonly chunks: readonly ScoredChunk[];
      /** Motivo legível do porquê a evidência foi considerada insuficiente. */
      readonly reason: string;
    };

/**
 * Resposta final do RAG, modelada como discriminated union:
 * ou foi respondida com fontes, ou foi recusada por falta de evidência.
 */
export type RagAnswer =
  | {
      readonly kind: 'answered';
      readonly text: string;
      readonly citations: readonly Citation[];
    }
  | {
      readonly kind: 'no_evidence';
      /** Mensagem padrão informando ausência de base para responder. */
      readonly text: string;
    };

/** Type guard: recuperação com evidência suficiente. */
export function isSufficientRetrieval(
  result: RetrievalResult,
): result is Extract<RetrievalResult, { kind: 'sufficient' }> {
  return result.kind === 'sufficient';
}

/** Type guard: resposta que foi de fato gerada com fontes. */
export function isAnsweredRag(
  answer: RagAnswer,
): answer is Extract<RagAnswer, { kind: 'answered' }> {
  return answer.kind === 'answered';
}
