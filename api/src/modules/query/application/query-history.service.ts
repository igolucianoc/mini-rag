import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

/** Item do histórico de perguntas do usuário. */
export interface QueryListItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string | null;
  readonly hadSufficientEvidence: boolean;
  readonly modelId: string | null;
  readonly latencyMs: number | null;
  readonly createdAt: Date;
}

/** Citação de uma pergunta, já resolvida para (documentId, chunkIndex). */
export interface QueryCitationDetail {
  readonly rank: number;
  readonly score: number;
  readonly snippet: string;
  readonly documentId: string;
  readonly chunkIndex: number;
}

/** Detalhe de uma pergunta com suas citações. */
export interface QueryDetail extends QueryListItem {
  readonly citations: readonly QueryCitationDetail[];
}

/**
 * Leitura do histórico de perguntas do usuário autenticado. Toda query é
 * escopada por `userId` (isolamento entre usuários); detalhe retorna 404 se a
 * pergunta não for do usuário. Útil para o frontend (Etapa 08).
 */
@Injectable()
export class QueryHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista as perguntas do usuário, mais recentes primeiro. */
  async listForUser(userId: string): Promise<QueryListItem[]> {
    const rows = await this.prisma.query.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      question: row.question,
      answer: row.answer,
      hadSufficientEvidence: row.hadSufficientEvidence,
      modelId: row.modelId,
      latencyMs: row.latencyMs,
      createdAt: row.createdAt,
    }));
  }

  /** Detalhe de uma pergunta do usuário com citações; 404 se não for dele. */
  async getForUser(userId: string, queryId: string): Promise<QueryDetail> {
    const row = await this.prisma.query.findFirst({
      where: { id: queryId, userId },
      include: {
        citations: {
          orderBy: { rank: 'asc' },
          include: {
            documentChunk: {
              select: { documentId: true, chunkIndex: true },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Pergunta não encontrada');
    }

    return {
      id: row.id,
      question: row.question,
      answer: row.answer,
      hadSufficientEvidence: row.hadSufficientEvidence,
      modelId: row.modelId,
      latencyMs: row.latencyMs,
      createdAt: row.createdAt,
      citations: row.citations.map((citation) => ({
        rank: citation.rank,
        score: citation.score,
        snippet: citation.snippet,
        documentId: citation.documentChunk.documentId,
        chunkIndex: citation.documentChunk.chunkIndex,
      })),
    };
  }

  /**
   * Apaga TODO o histórico de perguntas do usuário. Escopado por `userId`
   * (nunca toca em queries de outro usuário). As `Citation` associadas somem por
   * cascade (onDelete: Cascade no schema). Idempotente: histórico já vazio é
   * sucesso, não erro. Retorna a quantidade de perguntas removidas.
   */
  async deleteAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.query.deleteMany({ where: { userId } });
    return result.count;
  }
}
