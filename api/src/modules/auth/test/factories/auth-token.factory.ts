import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '@/core/config/env.schema';
import { TokenService } from '../../application/token.service';

/** Valores de config de teste para auth. TTL de access curto para testar expiração. */
export interface TestAuthConfig {
  readonly JWT_ACCESS_SECRET: string;
  readonly ACCESS_TOKEN_TTL: string;
  readonly REFRESH_TOKEN_TTL_DAYS: number;
  readonly NODE_ENV: Env['NODE_ENV'];
}

const DEFAULT_TEST_CONFIG: TestAuthConfig = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: 7,
  NODE_ENV: 'test',
};

/**
 * ConfigService real (do Nest) alimentado por um objeto de config de teste — só
 * as chaves usadas pelo auth. Usa o construtor público `internalConfig`, sem
 * cast e sem subir o módulo de config (que exigiria o env completo).
 */
export function createTestConfigService(
  overrides: Partial<TestAuthConfig> = {},
): ConfigService<Env, true> {
  const values: TestAuthConfig = { ...DEFAULT_TEST_CONFIG, ...overrides };
  return new ConfigService<Env, true>(values);
}

/** Cria um TokenService real com JwtService real e config de teste. */
export function createTokenService(
  overrides: Partial<TestAuthConfig> = {},
): TokenService {
  return new TokenService(new JwtService(), createTestConfigService(overrides));
}
