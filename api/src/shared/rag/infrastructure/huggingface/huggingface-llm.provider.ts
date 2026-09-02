import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import type { LLMProvider } from '@/shared/rag/ports/llm-provider.port';
import {
  HF_INFERENCE_BASE_URL,
  HuggingFaceError,
  hfPostJson,
  type FetchFn,
} from './hf-http';

/** Quantidade máxima de tokens novos a gerar por resposta. */
const MAX_NEW_TOKENS = 512;
/** Tamanho (em caracteres) dos fragmentos emitidos por `generateStream`. */
const STREAM_CHUNK_SIZE = 24;

/**
 * LLMProvider real via Hugging Face Inference API (text-generation do HF_MODEL).
 *
 * - Sem SDK: `fetch` nativo injetável (default global) para permitir mock.
 * - Config (HF_TOKEN/HF_MODEL) via ConfigService; token nunca logado.
 * - Resposta validada a partir de `unknown` antes de uso.
 *
 * DECISÃO sobre `generateStream`: o streaming real (SSE) do NOSSO endpoint é a
 * Etapa 07. Aqui `generateStream` é um WRAPPER sobre `generate`: pega a resposta
 * completa e a emite em pedaços. Isso mantém o contrato da porta satisfeito sem
 * o risco de parsear o stream SSE bruto da HF nesta etapa. Quando a Etapa 07
 * precisar de streaming token-a-token de verdade, este método pode passar a
 * consumir `stream: true` da HF sem mudar a porta.
 */
@Injectable()
export class HuggingFaceLLMProvider implements LLMProvider {
  private readonly token: string;
  private readonly model: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.token = config.get('HF_TOKEN', { infer: true });
    this.model = config.get('HF_MODEL', { infer: true });
  }

  async generate(prompt: string): Promise<string> {
    const url = `${HF_INFERENCE_BASE_URL}/models/${this.model}`;
    const payload = await hfPostJson(this.fetchFn, url, this.token, {
      inputs: prompt,
      parameters: {
        max_new_tokens: MAX_NEW_TOKENS,
        return_full_text: false,
      },
      options: { wait_for_model: true },
    });

    return extractGeneratedText(payload);
  }

  async *generateStream(prompt: string): AsyncIterable<string> {
    const full = await this.generate(prompt);
    for (let i = 0; i < full.length; i += STREAM_CHUNK_SIZE) {
      yield full.slice(i, i + STREAM_CHUNK_SIZE);
    }
  }
}

/**
 * Valida a resposta da text-generation e extrai o texto gerado.
 * A API retorna `[{ generated_text: string }]`. Algumas variantes retornam o
 * objeto direto `{ generated_text: string }`. Qualquer outra forma é malformada.
 */
function extractGeneratedText(payload: unknown): string {
  if (Array.isArray(payload)) {
    const first: unknown = payload[0];
    if (hasGeneratedText(first)) {
      return first.generated_text;
    }
  } else if (hasGeneratedText(payload)) {
    return payload.generated_text;
  }

  throw new HuggingFaceError(
    'Resposta de geração malformada: campo "generated_text" ausente',
  );
}

/** Type guard: valor possui `generated_text: string`. */
function hasGeneratedText(
  value: unknown,
): value is { generated_text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'generated_text' in value &&
    typeof value.generated_text === 'string'
  );
}
