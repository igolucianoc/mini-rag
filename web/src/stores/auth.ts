/**
 * Store de autenticação. O access token fica APENAS em memória (ref), nunca em
 * localStorage — protege contra roubo por XSS. O refresh token vive num cookie
 * HttpOnly gerenciado pelo backend. Ao dar F5, a sessão é reidratada tentando
 * um refresh via cookie (`bootstrap`).
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authApi from '@/services/auth';
import { ApiError, configureAuthBridge } from '@/services/client';
import type { AuthCredentials, AuthUser } from '@/types/api';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** true até a primeira tentativa de reidratação (bootstrap) concluir. */
  const initializing = ref(true);

  const isAuthenticated = computed(() => accessToken.value !== null);

  function setSession(token: string, sessionUser?: AuthUser): void {
    accessToken.value = token;
    if (sessionUser !== undefined) {
      user.value = sessionUser;
    }
  }

  function clearSession(): void {
    accessToken.value = null;
    user.value = null;
  }

  async function login(credentials: AuthCredentials): Promise<boolean> {
    return runAuth(() => authApi.login(credentials));
  }

  async function register(credentials: AuthCredentials): Promise<boolean> {
    return runAuth(() => authApi.register(credentials));
  }

  /** Executa login/register tratando loading/erro; retorna true em sucesso. */
  async function runAuth(action: () => Promise<{ accessToken: string; user?: AuthUser }>): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const response = await action();
      setSession(response.accessToken, response.user);
      return true;
    } catch (err) {
      error.value = toMessage(err);
      clearSession();
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** Refresh silencioso via cookie. Retorna o novo token ou null. */
  async function refresh(): Promise<string | null> {
    try {
      const response = await authApi.refresh();
      setSession(response.accessToken, response.user);
      return response.accessToken;
    } catch {
      clearSession();
      return null;
    }
  }

  /** Reidratação no boot/F5: tenta refresh via cookie antes de decidir a rota. */
  async function bootstrap(): Promise<void> {
    if (!initializing.value) {
      return;
    }
    await refresh();
    initializing.value = false;
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // Logout é best-effort: mesmo se a chamada falhar, limpamos local.
    } finally {
      clearSession();
    }
  }

  /** Chamado pelo cliente HTTP quando um refresh em 401 falha. */
  function onSessionExpired(): void {
    clearSession();
  }

  // Registra a ponte com o cliente HTTP (token + refresh + expiração). Sempre
  // aponta para a store ativa — importante em testes com Pinia recriado.
  configureAuthBridge({
    getAccessToken: () => accessToken.value,
    refresh,
    onSessionExpired,
  });

  return {
    accessToken,
    user,
    loading,
    error,
    initializing,
    isAuthenticated,
    login,
    register,
    refresh,
    bootstrap,
    logout,
  };
});

/** Normaliza erros de auth para mensagens amigáveis. */
function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return 'E-mail ou senha inválidos.';
    }
    if (err.status === 409) {
      return 'Este e-mail já está cadastrado.';
    }
    if (err.status === 429) {
      return 'Muitas tentativas. Aguarde um instante e tente novamente.';
    }
    return err.message;
  }
  return 'Não foi possível concluir. Verifique sua conexão e tente novamente.';
}
