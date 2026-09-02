import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { apiRequest } from '@/services/client';

/** Cria um Response JSON simulado com o status desejado. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('guarda o token em memória ao logar com sucesso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, { accessToken: 'tkn-123' }))),
    );

    const store = useAuthStore();
    const ok = await store.login({ email: 'a@b.com', password: 'secret123' });

    expect(ok).toBe(true);
    expect(store.accessToken).toBe('tkn-123');
    expect(store.isAuthenticated).toBe(true);
    expect(store.error).toBeNull();
  });

  it('define mensagem de erro e não autentica quando o login falha (401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(401, { message: 'unauthorized' }))),
    );

    const store = useAuthStore();
    const ok = await store.login({ email: 'a@b.com', password: 'wrong' });

    expect(ok).toBe(false);
    expect(store.accessToken).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(store.error).toBe('E-mail ou senha inválidos.');
  });

  it('em 401 numa rota protegida, faz refresh via cookie e refaz a request', async () => {
    const store = useAuthStore();
    store.accessToken = 'expired';

    const fetchMock = vi
      .fn<typeof fetch>()
      // 1) request protegida -> 401
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      // 2) POST /auth/refresh -> novo token
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: 'fresh-token' }))
      // 3) retry da request protegida -> sucesso
      .mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest<{ data: string }>('/documents');

    expect(result).toEqual({ data: 'ok' });
    expect(store.accessToken).toBe('fresh-token');
    // 3 chamadas: original 401, refresh, retry.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('marca sessão expirada quando o refresh falha após 401', async () => {
    const store = useAuthStore();
    store.accessToken = 'expired';

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'no cookie' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/documents')).rejects.toThrow();
    expect(store.accessToken).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });
});
