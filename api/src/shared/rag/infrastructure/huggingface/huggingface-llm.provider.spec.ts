import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import { HuggingFaceLLMProvider } from './huggingface-llm.provider';
import { HuggingFaceError, type FetchFn } from './hf-http';

const SECRET_TOKEN = 'hf_secret_llm_token_xyz';

function config(): ConfigService<Env, true> {
  return {
    get: (key: string): string => {
      if (key === 'HF_TOKEN') return SECRET_TOKEN;
      if (key === 'HF_MODEL') return 'meta-llama/Llama-3.1-8B-Instruct';
      return '';
    },
  } as unknown as ConfigService<Env, true>;
}

function fakeFetch(response: Response): FetchFn {
  return () => Promise.resolve(response);
}

describe('HuggingFaceLLMProvider', () => {
  it('extrai o conteúdo de resposta chat-completions válida', async () => {
    const body = { choices: [{ message: { role: 'assistant', content: 'olá mundo' } }] };
    const provider = new HuggingFaceLLMProvider(
      config(),
      fakeFetch(new Response(JSON.stringify(body), { status: 200 })),
    );

    const result = await provider.generate('prompt');
    expect(result).toBe('olá mundo');
  });

  it('erro de status vira HuggingFaceError sem vazar o token', async () => {
    const provider = new HuggingFaceLLMProvider(
      config(),
      fakeFetch(new Response('server error body', { status: 503 })),
    );

    try {
      await provider.generate('p');
      expect.fail('deveria ter lançado');
    } catch (err) {
      expect(err).toBeInstanceOf(HuggingFaceError);
      expect(String(err)).not.toContain(SECRET_TOKEN);
      expect((err as HuggingFaceError).message).not.toContain(SECRET_TOKEN);
    }
  });

  it('resposta malformada (sem choices/message/content) vira erro claro', async () => {
    const provider = new HuggingFaceLLMProvider(
      config(),
      fakeFetch(new Response(JSON.stringify({ foo: 'bar' }), { status: 200 })),
    );

    await expect(provider.generate('p')).rejects.toThrow(/malformada/);
  });

  it('generateStream emite a resposta completa em fragmentos', async () => {
    const body = {
      choices: [{ message: { content: 'abcdefghijklmnopqrstuvwxyz0123456789' } }],
    };
    const provider = new HuggingFaceLLMProvider(
      config(),
      fakeFetch(new Response(JSON.stringify(body), { status: 200 })),
    );

    let assembled = '';
    let fragments = 0;
    for await (const piece of provider.generateStream('p')) {
      assembled += piece;
      fragments += 1;
    }
    expect(assembled).toBe('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(fragments).toBeGreaterThan(1);
  });
});
