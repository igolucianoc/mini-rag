/**
 * Tipos de API centralizados (DTOs). Espelham os contratos do backend NestJS
 * (prefixo global /api). Ficam na camada de dados; componentes não os inventam.
 */

/* ------------------------------- Auth ---------------------------------- */

export interface AuthUser {
  readonly id: string;
  readonly email: string;
}

/** Resposta de register/login/refresh: access token no corpo (fica em memória). */
export interface AuthResponse {
  readonly accessToken: string;
  readonly user?: AuthUser;
}

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

/* ----------------------------- Documents -------------------------------- */

/** Status de ingestão do documento (espelha DocumentStatus do Prisma). */
export type DocumentStatus = 'PROCESSING' | 'READY' | 'FAILED';

/** Tipo de fonte do documento (espelha DocumentSourceType do Prisma). */
export type DocumentSourceType = 'MARKDOWN' | 'TXT' | 'PDF';

export interface DocumentListItem {
  readonly id: string;
  readonly title: string;
  readonly status: DocumentStatus;
  readonly sourceType: DocumentSourceType;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly chunkCount: number;
  readonly createdAt: string;
}

/** Resposta do upload (POST /api/documents). */
export interface UploadResponse {
  readonly documentId: string;
  readonly status: 'READY' | 'FAILED';
  readonly chunkCount: number;
  readonly error?: string;
}

/* ------------------------------- Queries -------------------------------- */

/** Citação = fonte com posição (rank) na resposta. */
export interface Citation {
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly snippet: string;
  readonly score: number;
  readonly rank: number;
}

/** Resposta RAG: união discriminada (respondida x sem evidência). */
export type RagAnswer =
  | {
      readonly kind: 'answered';
      readonly text: string;
      readonly citations: readonly Citation[];
    }
  | {
      readonly kind: 'no_evidence';
      readonly text: string;
    };

/** Resposta do POST /api/queries. */
export interface AskResponse {
  readonly queryId: string;
  readonly answer: RagAnswer;
  readonly hadSufficientEvidence: boolean;
  readonly modelId: string | null;
  readonly latencyMs: number;
}

export interface AskRequest {
  readonly question: string;
  readonly topK?: number;
  readonly documentIds?: readonly string[];
}

/** Item do histórico (GET /api/queries). */
export interface QueryListItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string | null;
  readonly hadSufficientEvidence: boolean;
  readonly modelId: string | null;
  readonly latencyMs: number | null;
  readonly createdAt: string;
}

/** Citação no detalhe do histórico. */
export interface QueryCitationDetail {
  readonly rank: number;
  readonly score: number;
  readonly snippet: string;
  readonly documentId: string;
  readonly chunkIndex: number;
}

/** Detalhe do histórico (GET /api/queries/:id). */
export interface QueryDetail extends QueryListItem {
  readonly citations: readonly QueryCitationDetail[];
}

/* --------------------------- SSE stream events -------------------------- */

/** Fonte numerada do contexto, emitida em `context_ready`. */
export interface RagStreamContextSource {
  readonly index: number;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly title?: string;
  readonly score: number;
  readonly snippet: string;
}

/** Citação efetivamente usada, emitida em `source`. */
export interface RagStreamCitation {
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

/** União discriminada por `type` dos eventos do stream RAG. */
export type RagStreamEvent =
  | { readonly type: 'started' }
  | { readonly type: 'retrieving' }
  | { readonly type: 'context_ready'; readonly sources: readonly RagStreamContextSource[] }
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'source'; readonly source: RagStreamCitation }
  | { readonly type: 'completed'; readonly result: RagStreamCompleted }
  | { readonly type: 'failed'; readonly message: string };
