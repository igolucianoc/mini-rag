import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@/core/config/env.schema';
import { PrismaService } from '@/infra/prisma/prisma.service';
import {
  LLM_PROVIDER,
  type LLMProvider,
} from '@/core/rag/ports/llm-provider.port';
import type { Citation, RagAnswer } from '@/core/rag/domain/rag-types';
import type { NumberedSource } from '../domain/context-builder';
import { NO_EVIDENCE_MESSAGE } from '../domain/rag-prompt';
import { parseLlmOutput, type ParsedLlmOutput } from '../domain/llm-output.schema';

/** Entrada da pergunta RAG (compartilhada por ask síncrono e stream). */
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

/** Resultado do parse + resolução de citações reais (sem persistir ainda). */
export interface ResolvedAnswer {
  readonly answerText: string;
  readonly citations: readonly Citation[];
}

/**
 * Serviço compartilhado com a lógica de geração de resposta RAG que NÃO depende
 * do modo de transporte (síncrono vs streaming):
 *  - resolução de citações REAIS (descarta índices inventados, renumera 1..n);
 *  - resolução dos ids reais de DocumentChunk;
 *  - persistência de Query answered (+ Citations) e Query no_evidence.
 *
 * `RagService.ask()` (síncrono) e `RagStreamService.askStream()` (SSE) usam este
 * serviço, evitando duplicar a regra de citações/persistência. NUNCA inventa
 * fontes: toda citação aponta para um chunk realmente recuperado.
 */
@Injectable()
export class RagAnswerService {
  private readonly modelId: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: LLMProvider,
    config: ConfigService<Env, true>,
  ) {
    this.modelId = config.get('HF_MODEL', { infer: true });
  }

  /** Id do modelo configurado (exposto para o metadata das respostas). */
  get configuredModelId(): string {
    return this.modelId;
  }

  /** Acesso ao provider de LLM (streaming e síncrono) para os orquestradores. */
  get llm(): LLMProvider {
    return this.llmProvider;
  }

  /**
   * Converte a saída bruta do modelo em citações REAIS: só mantém índices de
   * fonte presentes no contexto (`sources`); descarta índices inventados e
   * renumera as citações mantidas em 1..n (rank), preservando a ordem.
   */
  resolveCitations(
    raw: string,
    sources: readonly NumberedSource[],
  ): ResolvedAnswer {
    const parsed = parseLlmOutput(raw);
    return this.resolveParsed(parsed, sources);
  }

  private resolveParsed(
    parsed: ParsedLlmOutput,
    sources: readonly NumberedSource[],
  ): ResolvedAnswer {
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
  async persistAnswered(
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
  async persistNoEvidence(
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
