import type { ScoredChunk } from '@/core/rag/domain/rag-types';

/** Limite padrão do contexto (caracteres). Aprox. — não é contagem exata de tokens. */
export const DEFAULT_MAX_CONTEXT_CHARS = 6000;

/** Uma fonte numerada do contexto, ligada de volta ao chunk que a originou. */
export interface NumberedSource {
  /** Número exibido no contexto e citado pelo modelo (1-based). */
  readonly index: number;
  readonly chunk: ScoredChunk;
}

/** Resultado da montagem de contexto: texto para o prompt + mapa índice->chunk. */
export interface BuiltContext {
  /** Texto pronto para inserir no prompt, com fontes numeradas [1], [2], ... */
  readonly text: string;
  /** Fontes efetivamente incluídas (respeitando o limite), na ordem numerada. */
  readonly sources: readonly NumberedSource[];
}

/** Opções da montagem de contexto. */
export interface BuildContextOptions {
  /** Limite aproximado de tamanho do contexto, em caracteres. */
  readonly maxChars?: number;
}

/**
 * Monta o texto de contexto a partir dos chunks recuperados, numerando as fontes
 * ([1], [2], ...) e respeitando um limite de tamanho aproximado (em caracteres).
 *
 * Função PURA e determinística (sem I/O), fácil de testar:
 *  - preserva a ordem de entrada (o retrieval já ordena por relevância);
 *  - inclui fontes até estourar o limite; a primeira fonte é sempre incluída
 *    (mesmo que sozinha exceda o limite) para nunca produzir contexto vazio
 *    quando há evidência;
 *  - devolve o mapeamento índice->chunk, que a `rag.service` usa para converter
 *    as citações do modelo em citações reais.
 */
export function buildContext(
  chunks: readonly ScoredChunk[],
  options: BuildContextOptions = {},
): BuiltContext {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CONTEXT_CHARS;
  const sources: NumberedSource[] = [];
  const blocks: string[] = [];
  let usedChars = 0;

  for (const chunk of chunks) {
    const index = sources.length + 1;
    const block = formatBlock(index, chunk.chunk.content);
    const isFirst = sources.length === 0;

    if (!isFirst && usedChars + block.length > maxChars) {
      break;
    }

    sources.push({ index, chunk });
    blocks.push(block);
    usedChars += block.length;
  }

  return { text: blocks.join('\n\n'), sources };
}

/** Formata um bloco de fonte numerado. */
function formatBlock(index: number, content: string): string {
  return `[${index}] ${content.trim()}`;
}
