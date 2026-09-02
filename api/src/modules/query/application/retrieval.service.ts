import { Inject, Injectable } from '@nestjs/common';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProvider,
} from '@/shared/rag/ports/embedding-provider.port';
import {
  DEFAULT_TOP_K,
  VECTOR_STORE,
  type VectorStore,
} from '@/shared/rag/ports/vector-store.port';
import type { RetrievalResult } from '@/shared/rag/domain/rag-types';

/** Limiar de similaridade padrão para considerar um chunk como evidência. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.3;

/** Entrada da recuperação. */
export interface RetrievalInput {
  readonly userId: string;
  readonly question: string;
  /** topK; default DEFAULT_TOP_K (5). */
  readonly topK?: number;
  /** Limiar mínimo de similaridade [0,1]; default DEFAULT_SIMILARITY_THRESHOLD. */
  readonly similarityThreshold?: number;
  /** Restringe a busca a documentos específicos do usuário. */
  readonly documentIds?: readonly string[];
}

/**
 * Recuperação (retrieval): embeda a pergunta, busca por similaridade escopada
 * ao usuário e decide se a evidência é suficiente.
 *
 * Regra de suficiência: se NENHUM chunk recuperado atinge o limiar mínimo, o
 * resultado é `insufficient` com um motivo legível — nunca inventamos fontes.
 * Caso contrário, mantemos apenas os chunks acima do limiar como evidência.
 */
@Injectable()
export class RetrievalService {
  constructor(
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
  ) {}

  async retrieve(input: RetrievalInput): Promise<RetrievalResult> {
    const topK = input.topK ?? DEFAULT_TOP_K;
    const threshold = input.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

    const [embedding] = await this.embeddingProvider.embed([input.question]);
    if (!embedding) {
      return {
        kind: 'insufficient',
        chunks: [],
        reason: 'Não foi possível gerar o embedding da pergunta.',
      };
    }

    const scored = await this.vectorStore.similaritySearch(embedding, topK, {
      userId: input.userId,
      documentIds: input.documentIds,
    });

    const relevant = scored.filter((chunk) => chunk.score >= threshold);

    if (relevant.length === 0) {
      return {
        kind: 'insufficient',
        chunks: scored,
        reason:
          scored.length === 0
            ? 'Nenhum documento indexado corresponde à pergunta.'
            : `Nenhum trecho recuperado atingiu o limiar mínimo de similaridade (${threshold}).`,
      };
    }

    return { kind: 'sufficient', chunks: relevant };
  }
}
