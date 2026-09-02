import { Injectable } from '@nestjs/common';
import { isSufficientRetrieval } from '@/core/rag/domain/rag-types';
import { RetrievalService } from './retrieval.service';
import { buildContext } from '../domain/context-builder';
import { buildRagPrompt } from '../domain/rag-prompt';
import {
  RagAnswerService,
  type AskInput,
  type AskResult,
} from './rag-answer.service';

export type { AskInput, AskResult } from './rag-answer.service';

/**
 * Orquestra a resposta RAG SÍNCRONA:
 * retrieval -> (se suficiente) contexto -> LLM.generate -> validação/fallback ->
 * citações reais -> persistência de Query + Citation. Se insuficiente, responde
 * `no_evidence` e persiste sem citações.
 *
 * A lógica de citações reais e persistência vive no `RagAnswerService`
 * (compartilhado com o `RagStreamService` da Etapa 07), para não duplicar regra.
 * Este serviço cuida apenas da orquestração do fluxo síncrono.
 */
@Injectable()
export class RagService {
  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly answerService: RagAnswerService,
  ) {}

  async ask(input: AskInput): Promise<AskResult> {
    const startedAt = Date.now();

    const retrieval = await this.retrievalService.retrieve({
      userId: input.userId,
      question: input.question,
      topK: input.topK,
      documentIds: input.documentIds,
    });

    if (!isSufficientRetrieval(retrieval)) {
      return this.answerService.persistNoEvidence(
        input,
        Date.now() - startedAt,
      );
    }

    const { text: contextText, sources } = buildContext(retrieval.chunks);
    const prompt = buildRagPrompt(input.question, contextText);
    const raw = await this.answerService.llm.generate(prompt);

    const { answerText, citations } = this.answerService.resolveCitations(
      raw,
      sources,
    );

    const latencyMs = Date.now() - startedAt;
    return this.answerService.persistAnswered(
      input,
      answerText,
      citations,
      sources,
      latencyMs,
    );
  }
}
