/**
 * Cliente HTTP tipado da aplicação. Concentra:
 *  - base URL /api (passa pelo proxy do Vite -> backend NestJS);
 *  - injeção do header Authorization: Bearer <accessToken> (token em memória);
 *  - `credentials: 'include'` para o cookie HttpOnly de refresh viajar;
 *  - fluxo de refresh em 401: tenta 1x POST /api/auth/refresh e refaz a request;
 *    se falhar, sinaliza sessão expirada (a store de auth trata o redirect).
 *
 * Para não acoplar a camada de serviço à store Pinia (direção de dependências),
 * o token e as ações de refresh/expiração são injetados via `configureAuthBridge`,
 * chamado pela store de auth na sua criação.
 */

/** Ponte entre o cliente e a store de auth (injetada pela store). */
export interface AuthBridge {
  /** Lê o access token atual em memória (null se deslogado). */
  readonly getAccessToken: () => string | null;
  /** Executa o refresh via cookie; retorna o novo token ou null se falhar. */
  readonly refresh: () => Promise<string | null>;
  /** Chamada quando o refresh falha: sessão expirada (limpa estado/redireciona). */
  readonly onSessionExpired: () => void;
}

let authBridge: AuthBridge | null = null;

/** Registra a ponte de auth. Idempotente; a store chama uma vez na criação. */
export function configureAuthBridge(bridge: AuthBridge): void {
  authBridge = bridge;
}

/** Lê o access token atual via ponte de auth (para consumidores fora do apiRequest). */
export function currentAccessToken(): string | null {
  return authBridge?.getAccessToken() ?? null;
}

/** Dispara o fluxo de refresh via ponte de auth; null se indisponível/falho. */
export async function tryRefreshToken(): Promise<string | null> {
  if (authBridge === null) {
    return null;
  }
  return authBridge.refresh();
}

/** Sinaliza sessão expirada via ponte de auth. */
export function notifySessionExpired(): void {
  authBridge?.onSessionExpired();
}

/** Erro de API com status e mensagem já normalizada para exibição. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Opções de uma requisição tipada. */
export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  /** Corpo JSON (serializado automaticamente). Ignorado se `formData` presente. */
  readonly body?: unknown;
  /** Corpo multipart (upload); não define Content-Type manualmente. */
  readonly formData?: FormData;
  /** Se true, não tenta refresh em 401 (usado pelas próprias rotas de auth). */
  readonly skipAuth?: boolean;
  readonly signal?: AbortSignal;
}

const API_BASE = '/api';

/**
 * Executa uma requisição JSON tipada. `T` é o tipo esperado do corpo de
 * resposta; para respostas sem corpo (204) use `void`.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await sendWithAuth(path, options);

  if (!response.ok) {
    throw await toApiError(response);
  }

  // 204 No Content ou corpo vazio: retorna undefined tipado como T (void).
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('Resposta da API em formato inesperado', response.status);
  }
}

/**
 * Envia a request com o header Authorization e, em 401 (fora das rotas de auth),
 * tenta um único refresh antes de refazer. Retorna a `Response` (ok ou não).
 */
async function sendWithAuth(path: string, options: RequestOptions): Promise<Response> {
  const first = await rawFetch(path, options);
  if (first.status !== 401 || options.skipAuth || authBridge === null) {
    return first;
  }

  const newToken = await authBridge.refresh();
  if (newToken === null) {
    authBridge.onSessionExpired();
    return first;
  }
  // Refaz a request uma única vez com o token renovado.
  const retry = await rawFetch(path, options);
  if (retry.status === 401) {
    authBridge.onSessionExpired();
  }
  return retry;
}

/** Monta e dispara o fetch com headers apropriados. */
function rawFetch(path: string, options: RequestOptions): Promise<Response> {
  const headers = new Headers();
  const token = authBridge?.getAccessToken() ?? null;
  if (token !== null && options.skipAuth !== true) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let body: BodyInit | undefined;
  if (options.formData !== undefined) {
    body = options.formData; // o browser define o boundary do multipart
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'include',
    signal: options.signal,
  });
}

/** Normaliza uma resposta de erro em ApiError com mensagem legível. */
async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `Falha na requisição (HTTP ${response.status})`;
  try {
    const data: unknown = await response.json();
    const message = extractErrorMessage(data);
    return new ApiError(message ?? fallback, response.status);
  } catch {
    return new ApiError(fallback, response.status);
  }
}

/** Extrai a mensagem de erro do corpo padrão do Nest ({ message: ... }). */
function extractErrorMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const message = (data as Record<string, unknown>).message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    const parts = message.filter((item): item is string => typeof item === 'string');
    return parts.length > 0 ? parts.join('; ') : null;
  }
  return null;
}

export { API_BASE };
