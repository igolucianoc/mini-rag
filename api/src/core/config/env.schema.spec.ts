import { describe, it, expect } from 'vitest';
import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  const base = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    HF_TOKEN: 'hf_fake',
  };

  it('aplica defaults e tipa PORT como number', () => {
    const env = validateEnv({ ...base, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.HF_MODEL).toBe('HuggingFaceH4/zephyr-7b-beta');
  });

  it('falha quando DATABASE_URL está ausente', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'development', HF_TOKEN: 'hf_fake' }),
    ).toThrow();
  });

  it('falha quando HF_TOKEN está ausente fora de test', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://x',
      }),
    ).toThrow();
  });

  it('permite HF_TOKEN ausente em NODE_ENV=test', () => {
    const env = validateEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://x',
    });
    expect(env.HF_TOKEN).toBe('test-token');
  });
});
