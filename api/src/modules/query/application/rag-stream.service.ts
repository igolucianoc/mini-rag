import { Injectable } from '@nestjs/common';
import { isSufficientRetrieval } from '@/core/rag/domain/rag-types';
import { RetrievalService } from './retrieval.service';
import { buildContext, type NumberedSource } from '../domain/context-builder';
import { buildRagPrompt, NO_EVIDENCE_MESSAGE } from '../domain/rag-prompt';
import { RagAnswerService, type AskInput } from './rag-answer.service';
import type {
  RagStreamCitation,
  RagStreamContextSource,
  RagStreamEvent,
} from '../domain/rag-stream.events';

/**
 * Orquestra a resposta RAG em STREAMING (Etapa 07), como um async generator de
 * `RagStreamEvent`. É PURO em relação ao Nest (não conhece HTTP/Observable),
 * então é testável coletando os eventos num array. O controller faz a ponte
 * async-iterable -> Observable<MessageEvent> para o `@Sse()`.
 *
 * Reaproveita `RagAnswerService` (citações reais + persistência), a mesma regra
 * usada pelo `RagService.ask()` síncrono. O parse/citações só ocorrem NO FIM,
 * porque o texto completo só existe após consumir todo o stream do LLM.
 */
@Injectable()
export class RagStreamService {
  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly answerService: RagAnswerService,
  ) {}

  /**
   * Fluxo feliz: started -> retrieving -> context_ready -> token* -> source* ->
   * completed. Sem evidência: started -> retrieving -> completed (sucesso, sem
   * fontes). Erro no meio: emite `failed` (mensagem sanitizada) e ENCERRA.
   */
  async *askStream(input: AskInput): AsyncIterable<RagStreamEvent> {
    const startedAt = Date.now();

    yield { type: 'started' };
    yield { type: 'retrieving' };

    try {
      const retrieval = await this.retrievalService.retrieve({
        userId: input.userId,
        question: input.question,
        topK: input.topK,
        documentIds: input.documentIds,
      });

      // Sem evidência é SUCESSO (não erro): persiste no_evidence e encerra com
      // `completed`, sem tokens nem sources — nunca emite `failed` aqui.
      if (!isSufficientRetrieval(retrieval)) {
        const result = await this.answerService.persistNoEvidence(
          input,
          Date.now() - startedAt,
        );
        yield {
          type: 'completed',
          result: {
            queryId: result.queryId,
            answer: result.answer.text,
            hadSufficientEvidence: false,
            modelId: result.modelId,
            latencyMs: result.latencyMs,
            citations: [],
          },
        };
        return;
      }

      const { text: contextText, sources } = buildContext(retrieval.chunks);
      yield { type: 'context_ready', sources: toContextSources(sources) };

      const prompt = buildRagPrompt(input.question, contextText);

      let fullText = '';
      for await (const fragment of this.answerService.llm.generateStream(
        prompt,
      )) {
        fullText += fragment;
        yield { type: 'token', text: fragment };
      }

      const { answerText, citations } = this.answerService.resolveCitations(
        fullText,
        sources,
      );

      for (const citation of citations) {
        yield { type: 'source', source: toStreamCitation(citation) };
      }

      const latencyMs = Date.now() - startedAt;
      const result = await this.answerService.persistAnswered(
        input,
        answerText,
        citations,
        sources,
        latencyMs,
      );

      yield {
        type: 'completed',
        result: {
          queryId: result.queryId,
          answer: answerText,
          hadSufficientEvidence: true,
          modelId: result.modelId,
          latencyMs: result.latencyMs,
          citations: citations.map(toStreamCitation),
        },
      };
    } catch {
      // Mensagem SANITIZADA: nunca vaza HF_TOKEN nem stack sensível ao cliente.
      // Ignoramos de propósito o conteúdo do erro capturado — a mensagem exposta
      // é genérica e fixa, então nenhum detalhe interno pode escapar.
      yield { type: 'failed', message: SANITIZED_FAILURE_MESSAGE };
    }
  }
}

/** Converte fontes numeradas do contexto para o payload de `context_ready`. */
function toContextSources(
  sources: readonly NumberedSource[],
): RagStreamContextSource[] {
  return sources.map((source) => {
    const title = source.chunk.chunk.metadata['title'];
    return {
      index: source.index,
      documentId: source.chunk.chunk.documentId,
      chunkIndex: source.chunk.chunk.chunkIndex,
      ...(typeof title === 'string' ? { title } : {}),
      score: source.chunk.score,
      snippet: source.chunk.chunk.content,
    };
  });
}

/** Converte uma Citation de domínio para o payload de `source`/`completed`. */
function toStreamCitation(citation: {
  readonly rank: number;
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly score: number;
  readonly snippet: string;
}): RagStreamCitation {
  return {
    rank: citation.rank,
    documentId: citation.documentId,
    chunkIndex: citation.chunkIndex,
    score: citation.score,
    snippet: citation.snippet,
  };
}

/**
 * Mensagem de falha exposta no evento `failed`. Genérica e estável, NUNCA
 * reflete o conteúdo do erro original — então não há risco de vazar segredos
 * (ex.: HF_TOKEN) ou stack sensível mesmo que apareçam no erro subjacente.
 */
const SANITIZED_FAILURE_MESSAGE = 'Falha ao gerar a resposta. Tente novamente.';

/** Mensagem exposta ao encerrar sem evidência (reexport para clareza/testes). */
export { NO_EVIDENCE_MESSAGE };
