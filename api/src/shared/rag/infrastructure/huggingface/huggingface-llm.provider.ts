import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import type { LLMProvider } from '@/shared/rag/ports/llm-provider.port';
import {
  HF_CHAT_COMPLETIONS_URL,
  HuggingFaceError,
  hfPostJson,
  type FetchFn,
} from './hf-http';

/** Quantidade máxima de tokens novos a gerar por resposta. */
const MAX_NEW_TOKENS = 512;
/** Tamanho (em caracteres) dos fragmentos emitidos por `generateStream`. */
const STREAM_CHUNK_SIZE = 24;

/**
 * LLMProvider real via router de Inference Providers da Hugging Face, usando o
 * endpoint chat-completions (OpenAI-compatible) do HF_MODEL.
 *
 * - Sem SDK: `fetch` nativo injetável (default global) para permitir mock.
 * - Config (HF_TOKEN/HF_MODEL) via ConfigService; token nunca logado.
 * - Resposta validada a partir de `unknown` antes de uso.
 *
 * DECISÃO sobre o endpoint: a antiga Inference API (text-generation por
 * pipeline) foi descontinuada em favor do router. Modelos de chat atuais são
 * servidos pela superfície OpenAI-compatible `/v1/chat/completions`, que retorna
 * `{ choices: [{ message: { content } }] }`. O prompt de RAG (já montado a
 * montante) é enviado como uma única mensagem `user`.
 *
 * DECISÃO sobre `generateStream`: continua sendo um WRAPPER sobre `generate`
 * (resposta completa emitida em pedaços), mantendo o contrato da porta sem
 * parsear o stream SSE bruto. Streaming token-a-token real fica para depois.
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
    const payload = await hfPostJson(
      this.fetchFn,
      HF_CHAT_COMPLETIONS_URL,
      this.token,
      {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: MAX_NEW_TOKENS,
      },
    );

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
 * Valida a resposta chat-completions e extrai o texto gerado.
 * A API retorna `{ choices: [{ message: { content: string } }] }`. Qualquer
 * outra forma é considerada malformada e vira erro claro.
 */
function extractGeneratedText(payload: unknown): string {
  if (hasChatContent(payload)) {
    return payload.choices[0].message.content;
  }

  throw new HuggingFaceError(
    'Resposta de geração malformada: campo "choices[0].message.content" ausente',
  );
}

/** Type guard: valor tem o formato `{ choices: [{ message: { content: string } }] }`. */
function hasChatContent(
  value: unknown,
): value is { choices: [{ message: { content: string } }] } {
  if (typeof value !== 'object' || value === null || !('choices' in value)) {
    return false;
  }

  const { choices } = value;
  if (!Array.isArray(choices) || choices.length === 0) {
    return false;
  }

  const first: unknown = choices[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'message' in first &&
    typeof first.message === 'object' &&
    first.message !== null &&
    'content' in first.message &&
    typeof first.message.content === 'string'
  );
}
