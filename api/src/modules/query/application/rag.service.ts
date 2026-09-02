import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/config/env.schema';
import {
  LLM_PROVIDER,
  type LLMProvider,
} from '@/shared/rag/ports/llm-provider.port';
import {
  isSufficientRetrieval,
  type Citation,
  type RagAnswer,
} from '@/shared/rag/domain/rag-types';
import { RetrievalService } from './retrieval.service';
import { buildContext, type NumberedSource } from './context-builder';
import { buildRagPrompt, NO_EVIDENCE_MESSAGE } from './rag-prompt';
import { parseLlmOutput, type ParsedLlmOutput } from './llm-output.schema';

/** Entrada da pergunta RAG. */
export interface AskInput {
  readonly userId: string;
  readonly question: string;
  readonly topK?: number;
  readonly documentIds?: readonly string[];
}

/** Resposta enriquecida com metadados de persistência (para a camada HTTP). */
export interface AskResult {
  readonly queryId: string;
  readonly answer: RagAnswer;
  readonly hadSufficientEvidence: boolean;
  readonly modelId: string | null;
  readonly latencyMs: number;
}

/**
 * Orquestra a resposta RAG síncrona (a versão SSE vem na Etapa 07):
 * retrieval -> (se suficiente) contexto -> LLM -> validação/fallback -> citações
 * reais -> persistência de Query + Citation. Se insuficiente, responde
 * `no_evidence` e persiste sem citações. NUNCA inventa fontes: toda citação
 * aponta para um chunk realmente recuperado.
 */
@Injectable()
export class RagService {
  private readonly modelId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: LLMProvider,
    config: ConfigService<Env, true>,
  ) {
    this.modelId = config.get('HF_MODEL', { infer: true });
  }

  async ask(input: AskInput): Promise<AskResult> {
    const startedAt = Date.now();

    const retrieval = await this.retrievalService.retrieve({
      userId: input.userId,
      question: input.question,
      topK: input.topK,
      documentIds: input.documentIds,
    });

    if (!isSufficientRetrieval(retrieval)) {
      return this.persistNoEvidence(input, Date.now() - startedAt);
    }

    const { text: contextText, sources } = buildContext(retrieval.chunks);
    const prompt = buildRagPrompt(input.question, contextText);
    const raw = await this.llmProvider.generate(prompt);

    const parsed = parseLlmOutput(raw);
    const { answerText, citations } = this.resolveCitations(parsed, sources);

    const latencyMs = Date.now() - startedAt;
    return this.persistAnswered(input, answerText, citations, sources, latencyMs);
  }

  /**
   * Converte a saída do modelo em citações REAIS: só mantém índices de fonte que
   * existem no contexto (`sources`); descarta qualquer índice inventado. Renumera
   * as citações mantidas em 1..n (rank) preservando a ordem.
   */
  private resolveCitations(
    parsed: ParsedLlmOutput,
    sources: readonly NumberedSource[],
  ): { answerText: string; citations: Citation[] } {
    const byIndex = new Map<number, NumberedSource>();
    for (const source of sources) {
      byIndex.set(source.index, source);
    }

    const answerText =
      parsed.kind === 'structured' ? parsed.value.answer : parsed.answer;

    const requestedIndexes =
      parsed.kind === 'structured'
        ? parsed.value.citations.map((c) => c.sourceIndex)
        : parsed.referencedIndexes;

    const citations: Citation[] = [];
    const seen = new Set<number>();
    let rank = 1;
    for (const index of requestedIndexes) {
      if (seen.has(index)) {
        continue;
      }
      const source = byIndex.get(index);
      if (!source) {
        continue; // índice inventado / fora do contexto -> descartado
      }
      seen.add(index);
      citations.push({
        documentId: source.chunk.chunk.documentId,
        chunkIndex: source.chunk.chunk.chunkIndex,
        snippet: source.chunk.chunk.content,
        score: source.chunk.score,
        rank,
      });
      rank += 1;
    }

    return { answerText, citations };
  }

  /** Persiste Query answered + Citations (resolvendo DocumentChunk.id real). */
  private async persistAnswered(
    input: AskInput,
    answerText: string,
    citations: readonly Citation[],
    sources: readonly NumberedSource[],
    latencyMs: number,
  ): Promise<AskResult> {
    const chunkIdByKey = await this.resolveChunkIds(sources);

    const query = await this.prisma.query.create({
      data: {
        userId: input.userId,
        question: input.question,
        answer: answerText,
        hadSufficientEvidence: true,
        modelId: this.modelId,
        latencyMs,
        citations: {
          create: citations
            .map((citation) => {
              const documentChunkId = chunkIdByKey.get(
                chunkKey(citation.documentId, citation.chunkIndex),
              );
              if (documentChunkId === undefined) {
                return undefined;
              }
              return {
                documentChunkId,
                rank: citation.rank,
                score: citation.score,
                snippet: citation.snippet,
              };
            })
            .filter(
              (data): data is NonNullable<typeof data> => data !== undefined,
            ),
        },
      },
    });

    return {
      queryId: query.id,
      answer: { kind: 'answered', text: answerText, citations },
      hadSufficientEvidence: true,
      modelId: this.modelId,
      latencyMs,
    };
  }

  /** Persiste Query no_evidence (sem citações) e devolve a resposta. */
  private async persistNoEvidence(
    input: AskInput,
    latencyMs: number,
  ): Promise<AskResult> {
    const query = await this.prisma.query.create({
      data: {
        userId: input.userId,
        question: input.question,
        answer: NO_EVIDENCE_MESSAGE,
        hadSufficientEvidence: false,
        modelId: null,
        latencyMs,
      },
    });

    return {
      queryId: query.id,
      answer: { kind: 'no_evidence', text: NO_EVIDENCE_MESSAGE },
      hadSufficientEvidence: false,
      modelId: null,
      latencyMs,
    };
  }

  /**
   * Resolve os ids reais de DocumentChunk para os chunks citados. A busca
   * vetorial expõe (documentId, chunkIndex) mas não o id do chunk, e a Citation
   * referencia DocumentChunk.id — então buscamos por documento (escopo pequeno,
   * apenas os documentos das fontes) e mapeamos por (documentId, chunkIndex).
   */
  private async resolveChunkIds(
    sources: readonly NumberedSource[],
  ): Promise<Map<string, string>> {
    const documentIds = [
      ...new Set(sources.map((s) => s.chunk.chunk.documentId)),
    ];
    if (documentIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.documentChunk.findMany({
      where: { documentId: { in: documentIds } },
      select: { id: true, documentId: true, chunkIndex: true },
    });

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(chunkKey(row.documentId, row.chunkIndex), row.id);
    }
    return map;
  }
}

/** Chave composta (documentId, chunkIndex), igual à unique do schema. */
function chunkKey(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}
