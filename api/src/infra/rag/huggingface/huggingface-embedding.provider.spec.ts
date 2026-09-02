import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/core/config/env.schema';
import { HuggingFaceEmbeddingProvider } from './huggingface-embedding.provider';
import { HuggingFaceError, type FetchFn } from './hf-http';

const SECRET_TOKEN = 'hf_super_secret_token_123';

function config(): ConfigService<Env, true> {
  return {
    get: (key: string): string => {
      if (key === 'HF_TOKEN') return SECRET_TOKEN;
      if (key === 'HF_EMBEDDING_MODEL') return 'sentence-transformers/all-MiniLM-L6-v2';
      return '';
    },
  } as unknown as ConfigService<Env, true>;
}

/** Cria um fetch fake com uma Response controlada. */
function fakeFetch(response: Response): FetchFn {
  return () => Promise.resolve(response);
}

describe('HuggingFaceEmbeddingProvider', () => {
  it('parseia resposta válida (number[][]) preservando a ordem', async () => {
    const body: number[][] = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    const provider = new HuggingFaceEmbeddingProvider(
      config(),
      fakeFetch(new Response(JSON.stringify(body), { status: 200 })),
    );

    const result = await provider.embed(['a', 'b']);
    expect(result).toEqual(body);
    expect(provider.dimensions).toBe(384);
  });

  it('aceita number[] quando há um único input', async () => {
    const body = [0.1, 0.2, 0.3];
    const provider = new HuggingFaceEmbeddingProvider(
      config(),
      fakeFetch(new Response(JSON.stringify(body), { status: 200 })),
    );

    const result = await provider.embed(['única']);
    expect(result).toEqual([body]);
  });

  it('erro de status vira HuggingFaceError e NÃO vaza o token', async () => {
    const provider = new HuggingFaceEmbeddingProvider(
      config(),
      fakeFetch(new Response('rate limited', { status: 429 })),
    );

    await expect(provider.embed(['x'])).rejects.toBeInstanceOf(HuggingFaceError);
    try {
      await provider.embed(['x']);
    } catch (err) {
      expect(String(err)).not.toContain(SECRET_TOKEN);
      expect((err as HuggingFaceError).status).toBe(429);
    }
  });

  it('resposta malformada vira erro claro', async () => {
    const provider = new HuggingFaceEmbeddingProvider(
      config(),
      fakeFetch(new Response(JSON.stringify({ oops: true }), { status: 200 })),
    );

    await expect(provider.embed(['x'])).rejects.toThrow(/malformada/);
  });

  it('lista vazia não chama a rede', async () => {
    let called = false;
    const spy: FetchFn = () => {
      called = true;
      return Promise.resolve(new Response('[]'));
    };
    const provider = new HuggingFaceEmbeddingProvider(config(), spy);

    const result = await provider.embed([]);
    expect(result).toEqual([]);
    expect(called).toBe(false);
  });
});
