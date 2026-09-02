/**
 * Porta/contrato: Chunker.
 *
 * Estratégia de chunking com tamanho + overlap configuráveis. A implementação de
 * referência é uma função pura (`chunkText`, em ../chunking/chunk-text.ts), mas a
 * porta permite trocar a estratégia sem tocar nos consumidores.
 *
 * Estratégia escolhida (ver ADR 0002): janela deslizante por caracteres com
 * `chunkSize` e `overlap` fixos. Simples, determinística e independente de
 * tokenizer externo — suficiente para textos técnicos MD/TXT/PDF. A contagem de
 * tokens é aproximada (heurística de ~4 chars/token), refinável na Etapa 05.
 */

export interface ChunkResult {
  readonly chunkIndex: number;
  readonly content: string;
  /** Offset inicial (inclusive) no texto de entrada. */
  readonly startOffset: number;
  /** Offset final (exclusivo) no texto de entrada. */
  readonly endOffset: number;
  /** Contagem aproximada de tokens. */
  readonly tokenCount: number;
}

export interface ChunkOptions {
  /** Tamanho máximo do chunk em caracteres. */
  readonly chunkSize: number;
  /** Sobreposição (em caracteres) entre chunks consecutivos. */
  readonly overlap: number;
}

export interface Chunker {
  chunk(text: string, options: ChunkOptions): readonly ChunkResult[];
}

export const CHUNKER = Symbol('Chunker');
