/**
 * Porta: EmbeddingProvider.
 *
 * O domínio só vê o contrato. O adapter concreto (Hugging Face,
 * all-MiniLM-L6-v2 => 384 dims) é implementado em `infrastructure` na Etapa 05.
 */
export interface EmbeddingProvider {
  /** Dimensão dos vetores produzidos (ex.: 384). */
  readonly dimensions: number;
  /** Embeda um lote de textos, preservando a ordem de entrada. */
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_PROVIDER = Symbol('EmbeddingProvider');
