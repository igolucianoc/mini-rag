import type { RefreshToken } from '@prisma/client';

/** Dados para persistir um novo refresh token. */
export interface CreateRefreshTokenData {
  readonly userId: string;
  readonly tokenHash: string;
  readonly family: string;
  readonly expiresAt: Date;
  readonly userAgent?: string;
  readonly ip?: string;
}

/**
 * Porta de persistência dos refresh tokens. O AuthService depende desta
 * abstração; a implementação Prisma vive em `infrastructure/`.
 */
export interface RefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<RefreshToken>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  /** Revoga um token e o liga ao sucessor (rotação). */
  markReplaced(id: string, replacedById: string): Promise<void>;
  /** Revoga um único token (logout). */
  revoke(id: string): Promise<void>;
  /** Revoga toda a família (reuse detection / logout all). */
  revokeFamily(family: string): Promise<void>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
