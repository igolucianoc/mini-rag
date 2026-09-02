import { randomBytes, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';

/** Claims do access token. `sub` é o id do usuário (convenção JWT). */
export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
}

/** Par de token bruto + seu hash, para o refresh entregue ao cliente. */
export interface RefreshTokenPair {
  /** Token opaco entregue ao cliente (cookie). Nunca persistido em claro. */
  readonly token: string;
  /** SHA-256 do token, persistido no banco para lookup e comparação. */
  readonly tokenHash: string;
}

/**
 * Emite/verifica tokens (Etapa 04).
 * - Access: JWT assinado (HS256) com TTL curto vindo de ACCESS_TOKEN_TTL.
 * - Refresh: token opaco aleatório cripto-seguro (não é JWT). Guardamos apenas
 *   o SHA-256 no banco — sha-256 basta porque o token tem 256 bits de entropia,
 *   dispensando um KDF lento.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { email: claims.email },
      {
        subject: claims.sub,
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('ACCESS_TOKEN_TTL', { infer: true }),
      },
    );
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
      secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== 'string' || typeof email !== 'string') {
      throw new Error('Claims do access token inválidas');
    }
    return { sub, email };
  }

  /** Gera um refresh token opaco (32 bytes) e seu hash. */
  generateRefreshToken(): RefreshTokenPair {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  /** SHA-256 hex de um refresh token bruto (para lookup/comparação no banco). */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Instante de expiração do refresh, a partir de REFRESH_TOKEN_TTL_DAYS. */
  refreshTokenExpiry(from: Date = new Date()): Date {
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
