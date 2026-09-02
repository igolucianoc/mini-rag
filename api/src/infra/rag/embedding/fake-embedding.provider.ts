import { Injectable } from '@nestjs/common';
import type { EmbeddingProvider } from '@/core/rag/ports/embedding-provider.port';
import {
  FAKE_EMBEDDING_DIMENSIONS,
  fakeDeterministicEmbedding,
} from '@/core/rag/embedding/deterministic-embedding';

/**
 * EmbeddingProvider FAKE e determinístico, sem rede. Usa
 * `fakeDeterministicEmbedding` (vetor L2-normalizado de 384 dims) para cada texto.
 *
 * É o provider ligado ao token EMBEDDING_PROVIDER nesta etapa; a Etapa 06 substitui
 * pela implementação real da Hugging Face. Também é reutilizado nos testes por ser
 * determinístico (mesmo texto => mesmo vetor).
 */
@Injectable()
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = FAKE_EMBEDDING_DIMENSIONS;

  embed(texts: string[]): Promise<number[][]> {
    const vectors = texts.map((text) =>
      fakeDeterministicEmbedding(text, this.dimensions),
    );
    return Promise.resolve(vectors);
  }
}
