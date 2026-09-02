/**
 * Implementação de referência do chunking: função pura de janela deslizante.
 *
 * Estratégia (ADR 0002): percorre o texto em janelas de `chunkSize` caracteres,
 * avançando `chunkSize - overlap` a cada passo, de forma que chunks consecutivos
 * compartilhem `overlap` caracteres. É determinística e não depende de tokenizer.
 *
 * Edge cases tratados:
 * - texto vazio / só espaços => nenhum chunk.
 * - texto menor que `chunkSize` => um único chunk.
 * - texto múltiplo exato de `chunkSize` (com overlap 0) => chunks sem sobra.
 */
import type { ChunkOptions, ChunkResult } from '../ports/chunker.port';

/** Heurística simples de tokens: ~4 caracteres por token (refinável na Etapa 05). */
const CHARS_PER_TOKEN = 4;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkText(
  text: string,
  options: ChunkOptions,
): readonly ChunkResult[] {
  const { chunkSize, overlap } = options;

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize deve ser um inteiro positivo');
  }
  if (!Number.isInteger(overlap) || overlap < 0) {
    throw new Error('overlap deve ser um inteiro >= 0');
  }
  if (overlap >= chunkSize) {
    throw new Error('overlap deve ser menor que chunkSize');
  }

  // Texto sem conteúdo útil não gera chunks.
  if (text.trim().length === 0) {
    return [];
  }

  const step = chunkSize - overlap;
  const chunks: ChunkResult[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end);

    chunks.push({
      chunkIndex,
      content,
      startOffset: start,
      endOffset: end,
      tokenCount: estimateTokenCount(content),
    });

    chunkIndex += 1;

    // Chegou ao fim do texto: encerra (evita chunk final duplicado por overlap).
    if (end >= text.length) {
      break;
    }
    start += step;
  }

  return chunks;
}
