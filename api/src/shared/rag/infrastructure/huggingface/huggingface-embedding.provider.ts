import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import type { EmbeddingProvider } from '@/shared/rag/ports/embedding-provider.port';
import { FAKE_EMBEDDING_DIMENSIONS } from '@/shared/rag/embedding/deterministic-embedding';
import {
  hfInferencePipelineUrl,
  HuggingFaceError,
  hfPostJson,
  type FetchFn,
} from './hf-http';

/**
 * Dimensão dos embeddings do all-MiniLM-L6-v2 (384). Igual ao provider fake,
 * garantindo que ingestão e busca compartilhem o MESMO espaço vetorial.
 */
const HF_EMBEDDING_DIMENSIONS = FAKE_EMBEDDING_DIMENSIONS; // 384

/**
 * EmbeddingProvider real via router de Inference Providers da Hugging Face
 * (pipeline feature-extraction do HF_EMBEDDING_MODEL no provider hf-inference).
 *
 * - Sem SDK: usa `fetch` nativo, injetável no construtor para permitir mock em
 *   teste (default: `fetch` global do Node 22).
 * - Config (HF_TOKEN/HF_EMBEDDING_MODEL) vem do ConfigService injetado, NUNCA de
 *   `process.env` diretamente. O token nunca é logado.
 * - A resposta é `unknown` e só é usada após validação de forma (type guard),
 *   normalizando os dois formatos que a API retorna (number[] p/ 1 input,
 *   number[][] p/ lote).
 */
@Injectable()
export class HuggingFaceEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = HF_EMBEDDING_DIMENSIONS;

  private readonly token: string;
  private readonly model: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.token = config.get('HF_TOKEN', { infer: true });
    this.model = config.get('HF_EMBEDDING_MODEL', { infer: true });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const url = hfInferencePipelineUrl(this.model, 'feature-extraction');
    const payload = await hfPostJson(this.fetchFn, url, this.token, {
      inputs: texts,
      options: { wait_for_model: true },
    });

    const vectors = normalizeEmbeddingResponse(payload, texts.length);
    return vectors;
  }
}

/**
 * Valida e normaliza a resposta da feature-extraction para `number[][]`,
 * preservando a ordem dos inputs. A API pode devolver:
 *  - `number[][]` (um vetor por input) — caso esperado para lote;
 *  - `number[]`   (um único vetor) — quando enviamos 1 input.
 * Qualquer outra forma é considerada malformada e vira erro claro.
 */
function normalizeEmbeddingResponse(
  payload: unknown,
  expectedCount: number,
): number[][] {
  if (!Array.isArray(payload)) {
    throw new HuggingFaceError(
      'Resposta de embedding malformada: esperado um array',
    );
  }

  if (isNumberMatrix(payload)) {
    if (payload.length !== expectedCount) {
      throw new HuggingFaceError(
        'Resposta de embedding malformada: quantidade de vetores diverge dos inputs',
      );
    }
    return payload;
  }

  if (expectedCount === 1 && isNumberVector(payload)) {
    return [payload];
  }

  throw new HuggingFaceError(
    'Resposta de embedding malformada: formato de vetores inesperado',
  );
}

/** Type guard: `unknown` é `number[]` não-vazio. */
function isNumberVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** Type guard: `unknown` é `number[][]` com todas as linhas sendo vetores. */
function isNumberMatrix(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length > 0 && value.every(isNumberVector);
}
