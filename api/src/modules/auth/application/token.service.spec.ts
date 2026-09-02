import { describe, it, expect } from 'vitest';
import { createTokenService } from '../test/factories/auth-token.factory';

describe('TokenService', () => {
  it('assina e verifica um access token, recuperando as claims', async () => {
    const service = createTokenService();
    const token = await service.signAccessToken({ sub: 'user-1', email: 'a@b.co' });
    const claims = await service.verifyAccessToken(token);
    expect(claims).toEqual({ sub: 'user-1', email: 'a@b.co' });
  });

  it('recusa um access token expirado', async () => {
    // TTL de 1ms garante expiração antes da verificação.
    const service = createTokenService({ ACCESS_TOKEN_TTL: '1ms' });
    const token = await service.signAccessToken({ sub: 'user-1', email: 'a@b.co' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(service.verifyAccessToken(token)).rejects.toThrow();
  });

  it('recusa um access token assinado com outro secret', async () => {
    const signer = createTokenService({ JWT_ACCESS_SECRET: 'secret-a' });
    const verifier = createTokenService({ JWT_ACCESS_SECRET: 'secret-b' });
    const token = await signer.signAccessToken({ sub: 'u', email: 'a@b.co' });
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow();
  });

  it('gera refresh tokens únicos e o hash é determinístico', () => {
    const service = createTokenService();
    const a = service.generateRefreshToken();
    const b = service.generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
    expect(service.hashRefreshToken(a.token)).toBe(a.tokenHash);
    // O hash não deve vazar o token bruto.
    expect(a.tokenHash).not.toContain(a.token);
  });

  it('calcula a expiração do refresh a partir de REFRESH_TOKEN_TTL_DAYS', () => {
    const service = createTokenService({ REFRESH_TOKEN_TTL_DAYS: 2 });
    const from = new Date('2025-01-01T00:00:00.000Z');
    const expiry = service.refreshTokenExpiry(from);
    expect(expiry.toISOString()).toBe('2025-01-03T00:00:00.000Z');
  });
});
