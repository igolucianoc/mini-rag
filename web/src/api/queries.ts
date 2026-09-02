/**
 * Serviço de perguntas (RAG): histórico REST + streaming SSE via fetch.
 */
import {
  API_BASE,
  apiRequest,
  currentAccessToken,
  notifySessionExpired,
  tryRefreshToken,
} from '@/api/client';
import { parseSseBuffer } from '@/api/sse';
import type {
  AskRequest,
  AskResponse,
  QueryDetail,
  QueryListItem,
  RagStreamEvent,
} from '@/types/api';

export function ask(request: AskRequest): Promise<AskResponse> {
  return apiRequest<AskResponse>('/queries', { method: 'POST', body: request });
}

export function listQueries(signal?: AbortSignal): Promise<QueryListItem[]> {
  return apiRequest<QueryListItem[]>('/queries', { signal });
}

export function getQuery(id: string): Promise<QueryDetail> {
  return apiRequest<QueryDetail>(`/queries/${id}`);
}

/** Apaga todo o histórico de perguntas do usuário (DELETE /api/queries). */
export function deleteAllQueries(): Promise<void> {
  return apiRequest<void>('/queries', { method: 'DELETE' });
}

/** Monta a query string do endpoint de streaming a partir do request. */
export function buildStreamQuery(request: AskRequest): string {
  const params = new URLSearchParams();
  params.set('question', request.question);
  if (request.topK !== undefined) {
    params.set('topK', String(request.topK));
  }
  for (const id of request.documentIds ?? []) {
    params.append('documentIds', id);
  }
  return params.toString();
}

/** Erro de transporte do stream (rede/HTTP), distinto do evento `failed`. */
export class StreamTransportError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'StreamTransportError';
  }
}

/**
 * Consome GET /api/queries/stream via fetch streaming, enviando o header
 * Authorization Bearer (EventSource nativo não serve, pois não manda header).
 * Para cada RagStreamEvent parseado, chama `onEvent`. Em 401, tenta 1x refresh
 * e refaz a conexão. Lança StreamTransportError se a conexão/stream cair.
 */
export async function streamQuery(
  request: AskRequest,
  onEvent: (event: RagStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const query = buildStreamQuery(request);
  let response = await openStream(query, signal);

  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed === null) {
      notifySessionExpired();
      throw new StreamTransportError('Sessão expirada', 401);
    }
    response = await openStream(query, signal);
  }

  if (!response.ok) {
    throw new StreamTransportError(
      `Falha ao abrir o streaming (HTTP ${response.status})`,
      response.status,
    );
  }
  if (response.body === null) {
    throw new StreamTransportError('Streaming sem corpo de resposta');
  }

  await consumeStream(response.body, onEvent);
}

/** Abre a conexão de streaming com o header de auth. */
function openStream(query: string, signal?: AbortSignal): Promise<Response> {
  const headers = new Headers({ Accept: 'text/event-stream' });
  const token = currentAccessToken();
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(`${API_BASE}/queries/stream?${query}`, {
    method: 'GET',
    headers,
    credentials: 'include',
    signal,
  });
}

/** Lê o ReadableStream, decodifica e emite os eventos SSE parseados. */
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: RagStreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseBuffer(buffer);
      buffer = rest;
      for (const event of events) {
        onEvent(event);
      }
    }
    // Drena qualquer evento remanescente no buffer final.
    const tail = parseSseBuffer(`${buffer}\n\n`);
    for (const event of tail.events) {
      onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}
