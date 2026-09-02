/**
 * Serviço de autenticação. Todas as chamadas usam `credentials: 'include'`
 * (via apiRequest) para o cookie HttpOnly de refresh. As rotas de auth usam
 * `skipAuth` para não entrar no loop de refresh do cliente.
 */
import { apiRequest } from '@/api/client';
import type { AuthCredentials, AuthResponse } from '@/types/api';

export function register(credentials: AuthCredentials): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: credentials,
    skipAuth: true,
  });
}

export function login(credentials: AuthCredentials): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
    skipAuth: true,
  });
}

export function refresh(): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
  });
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST', skipAuth: true });
}
