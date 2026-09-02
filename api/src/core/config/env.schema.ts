import { z } from 'zod';

/**
 * Schema de variáveis de ambiente da API.
 * Falha rápido na inicialização se algo obrigatório estiver ausente/invalido.
 * O HF_TOKEN é secret e nunca deve ser logado.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),

  // Autenticação (etapas seguintes)
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Hugging Face (provider exclusivo de LLM/embeddings)
  HF_TOKEN: z.string().min(1, 'HF_TOKEN é obrigatório'),
  HF_MODEL: z.string().min(1).default('HuggingFaceH4/zephyr-7b-beta'),
  HF_EMBEDDING_MODEL: z
    .string()
    .min(1)
    .default('sentence-transformers/all-MiniLM-L6-v2'),

  // CORS / frontend
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida e retorna o ambiente tipado.
 * Em ambiente de test permite HF_TOKEN ausente com placeholder para não
 * acoplar a suíte à existência do secret real.
 */
export function validateEnv(
  raw: Record<string, unknown>,
): Env {
  const source =
    raw.NODE_ENV === 'test' && !raw.HF_TOKEN
      ? { ...raw, HF_TOKEN: 'test-token' }
      : raw;
  return envSchema.parse(source);
}
