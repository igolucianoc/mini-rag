/**
 * Eventos SSE do streaming de resposta RAG (Etapa 07).
 *
 * Modelados como discriminated union por `type`, com payload tipado por evento,
 * para o frontend (Etapa 08) consumir com segurança: cada `data` de MessageEvent
 * é um `RagStreamEvent` serializado em JSON pelo Nest.
 *
 * Ordem no fluxo feliz (com evidência):
 *   started -> retrieving -> context_ready -> token* -> source* -> completed
 * Fluxo sem evidência (também é SUCESSO, não erro):
 *   started -> retrieving -> completed (hadSufficientEvidence=false, sem token/source)
 * Fluxo de erro (encerra o stream):
 *   ... -> failed
 *
 * DECISÃO sobre `queryId`: a persistência (Query + Citation) acontece só no FIM,
 * porque o texto da resposta e as citações reais só existem depois de consumir
 * todo o stream do LLM. Logo, o `queryId` NÃO existe em `started` — ele aparece
 * apenas em `completed`. `started` fica sem payload de id.
 */

/** Fonte numerada do contexto (candidata), emitida em `context_ready`. */
export interface RagStreamContextSource {
  /** Número exibido no contexto e citado pelo modelo (1-based). */
  readonly index: number;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly title?: string;
  readonly score: number;
  readonly snippet: string;
}

/** Citação efetivamente usada, emitida em `source` (uma por citação resolvida). */
export interface RagStreamCitation {
  /** Posição da citação na resposta (1-based). */
  readonly rank: number;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly score: number;
  readonly snippet: string;
}

/** Payload final agregado, emitido em `completed`. */
export interface RagStreamCompleted {
  readonly queryId: string;
  readonly answer: string;
  readonly hadSufficientEvidence: boolean;
  readonly modelId: string | null;
  readonly latencyMs: number;
  readonly citations: readonly RagStreamCitation[];
}

/**
 * União discriminada dos eventos do stream. Cada variante carrega apenas o
 * payload relevante ao seu momento no fluxo.
 */
export type RagStreamEvent =
  | { readonly type: 'started' }
  | { readonly type: 'retrieving' }
  | {
      readonly type: 'context_ready';
      readonly sources: readonly RagStreamContextSource[];
    }
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'source'; readonly source: RagStreamCitation }
  | { readonly type: 'completed'; readonly result: RagStreamCompleted }
  | { readonly type: 'failed'; readonly message: string };
