import { z } from 'zod';

/**
 * Schema da resposta ESTRUTURADA esperada do LLM. Instruímos o modelo a
 * responder EXCLUSIVAMENTE em JSON com esta forma. `citations[].sourceIndex`
 * referencia o número da fonte no contexto ([1], [2], ...).
 */
export const llmStructuredOutputSchema = z.object({
  answer: z.string(),
  citations: z
    .array(
      z.object({
        sourceIndex: z.number().int().positive(),
        snippet: z.string().optional(),
      }),
    )
    .default([]),
});

export type LlmStructuredOutput = z.infer<typeof llmStructuredOutputSchema>;

/** Resultado do parsing tolerante da saída do LLM. */
export type ParsedLlmOutput =
  | { readonly kind: 'structured'; readonly value: LlmStructuredOutput }
  | {
      readonly kind: 'fallback';
      /** Texto tratado como resposta livre. */
      readonly answer: string;
      /** Índices `[n]` referenciados no texto (derivados sem inventar fontes). */
      readonly referencedIndexes: readonly number[];
    };

/**
 * Faz o parsing tolerante da saída do LLM.
 *
 * ESTRATÉGIA / FALLBACK (a app nunca deve quebrar por JSON malformado):
 *  1. Tenta extrair um objeto JSON do texto (o modelo às vezes embrulha o JSON
 *     em prosa/markdown) e validá-lo com Zod -> `structured`.
 *  2. Se não houver JSON válido no formato esperado, cai no modo `fallback`:
 *     trata a saída inteira como texto e deriva as citações apenas dos
 *     marcadores `[n]` de fato presentes no texto. Assim continuamos sem
 *     inventar fontes — a validação final contra o contexto real acontece na
 *     `rag.service`.
 */
export function parseLlmOutput(raw: string): ParsedLlmOutput {
  const json = extractJsonObject(raw);
  if (json !== undefined) {
    const parsed = llmStructuredOutputSchema.safeParse(json);
    if (parsed.success) {
      return { kind: 'structured', value: parsed.data };
    }
  }

  return {
    kind: 'fallback',
    answer: raw.trim(),
    referencedIndexes: extractReferencedIndexes(raw),
  };
}

/**
 * Extrai o primeiro objeto JSON plausível do texto (do primeiro `{` ao último
 * `}`), retornando `unknown` para validação posterior, ou `undefined` se não
 * houver JSON parseável.
 */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return undefined;
  }
}

/** Índices `[n]` referenciados no texto, únicos e em ordem de aparição. */
function extractReferencedIndexes(text: string): number[] {
  const found = new Set<number>();
  const regex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match !== null) {
    const value = Number.parseInt(match[1] ?? '', 10);
    if (Number.isInteger(value) && value > 0) {
      found.add(value);
    }
    match = regex.exec(text);
  }
  return [...found];
}
