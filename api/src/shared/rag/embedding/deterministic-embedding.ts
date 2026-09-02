/**
 * Embedding DETERMINÍSTICO E FAKE — SOMENTE PARA SEED/DEMO.
 *
 * ATENÇÃO: estes vetores NÃO são embeddings semânticos reais. São gerados por um
 * PRNG semeado pelo hash do texto, apenas para popular a coluna `vector(384)` e
 * permitir demonstrar a busca por similaridade sem chamar nenhum provider externo
 * (regra: seed não pode chamar LLM/embedding). O embedding real (Hugging Face,
 * all-MiniLM-L6-v2) entra nas Etapas 05/06.
 *
 * Propriedades garantidas (cobertas por teste):
 * - dimensão fixa (default 384);
 * - determinismo: mesmo texto => mesmo vetor;
 * - normalização L2: ||v|| == 1 (compatível com similaridade de cosseno).
 */

/** Dimensão coerente com all-MiniLM-L6-v2 (HF_EMBEDDING_MODEL default). */
export const FAKE_EMBEDDING_DIMENSIONS = 384;

/** Hash FNV-1a de 32 bits (determinístico, sem dependência externa). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // multiplicação FNV mantida em 32 bits sem estourar precisão.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** PRNG mulberry32: determinístico a partir de uma seed de 32 bits. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Gera um vetor fake determinístico normalizado (L2) para o texto.
 * @param text texto de origem
 * @param dimensions dimensão do vetor (default 384)
 */
export function fakeDeterministicEmbedding(
  text: string,
  dimensions: number = FAKE_EMBEDDING_DIMENSIONS,
): number[] {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error('dimensions deve ser um inteiro positivo');
  }

  const rand = mulberry32(fnv1a(text));
  const raw: number[] = new Array<number>(dimensions);

  // Valores em [-1, 1) para dar sinal aos componentes.
  for (let i = 0; i < dimensions; i += 1) {
    raw[i] = rand() * 2 - 1;
  }

  // Normalização L2.
  let sumSquares = 0;
  for (const value of raw) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);

  // Fallback improvável (norma ~0): vetor unitário no primeiro eixo.
  if (norm === 0) {
    const fallback = new Array<number>(dimensions).fill(0);
    fallback[0] = 1;
    return fallback;
  }

  return raw.map((value) => value / norm);
}

/** Serializa um vetor no literal aceito pelo cast `::vector` do pgvector. */
export function toPgVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}
