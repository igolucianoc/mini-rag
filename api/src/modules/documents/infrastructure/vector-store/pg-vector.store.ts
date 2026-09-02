import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import type { EmbeddedRagChunk, ScoredChunk } from '@/shared/rag/domain/rag-types';
import type {
  SimilarityFilters,
  VectorStore,
} from '@/shared/rag/ports/vector-store.port';
import { toPgVectorLiteral } from '@/shared/rag/embedding/deterministic-embedding';

/** Linha retornada pela busca por similaridade (colunas selecionadas do SQL). */
interface SimilarityRow {
  readonly documentId: string;
  readonly chunkIndex: number;
  readonly content: string;
  readonly tokenCount: number;
  readonly metadata: Prisma.JsonValue;
  /** Distância de cosseno (`<=>`): 0 = idêntico, 2 = oposto. */
  readonly distance: number;
}

/**
 * VectorStore concreto sobre PostgreSQL + pgvector.
 *
 * A coluna `embedding` é `Unsupported("vector(384)")` no Prisma, logo NÃO é
 * acessível pelo client tipado — toda leitura/escrita passa por `$executeRaw`/
 * `$queryRaw`. Para evitar SQL injection, todos os valores dinâmicos entram como
 * PLACEHOLDERS (`${...}`) via `Prisma.sql`, nunca por interpolação de string. O
 * único ponto textual é o literal do vetor (`toPgVectorLiteral`), que também é
 * passado como parâmetro e só então convertido com `::vector` no SQL.
 */
@Injectable()
export class PgVectorStore implements VectorStore {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(chunks: readonly EmbeddedRagChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    // Uma linha VALUES por chunk, com placeholders parametrizados.
    const values = chunks.map((chunk) => {
      const metadataJson = JSON.stringify(chunk.metadata);
      const vectorLiteral = toPgVectorLiteral(chunk.embedding);
      return Prisma.sql`(
        gen_random_uuid()::text,
        ${chunk.documentId},
        ${chunk.chunkIndex},
        ${chunk.content},
        ${chunk.tokenCount},
        ${metadataJson}::jsonb,
        ${vectorLiteral}::vector
      )`;
    });

    // ON CONFLICT (documentId, chunkIndex): idempotência por chunk.
    await this.prisma.$executeRaw`
      INSERT INTO "document_chunks"
        ("id", "documentId", "chunkIndex", "content", "tokenCount", "metadata", "embedding")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("documentId", "chunkIndex") DO UPDATE SET
        "content" = EXCLUDED."content",
        "tokenCount" = EXCLUDED."tokenCount",
        "metadata" = EXCLUDED."metadata",
        "embedding" = EXCLUDED."embedding"
    `;
  }

  async similaritySearch(
    queryEmbedding: readonly number[],
    topK: number,
    filters?: SimilarityFilters,
  ): Promise<ScoredChunk[]> {
    const vectorLiteral = toPgVectorLiteral(queryEmbedding);

    // Cláusulas de filtro compostas de forma segura (placeholders).
    const conditions: Prisma.Sql[] = [];
    if (filters?.userId) {
      conditions.push(Prisma.sql`d."userId" = ${filters.userId}`);
    }
    if (filters?.documentIds && filters.documentIds.length > 0) {
      conditions.push(
        Prisma.sql`c."documentId" IN (${Prisma.join([...filters.documentIds])})`,
      );
    }
    const whereClause =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<SimilarityRow[]>`
      SELECT
        c."documentId"  AS "documentId",
        c."chunkIndex"  AS "chunkIndex",
        c."content"     AS "content",
        c."tokenCount"  AS "tokenCount",
        c."metadata"    AS "metadata",
        (c."embedding" <=> ${vectorLiteral}::vector) AS "distance"
      FROM "document_chunks" c
      JOIN "documents" d ON d."id" = c."documentId"
      ${whereClause}
      ORDER BY c."embedding" <=> ${vectorLiteral}::vector ASC
      LIMIT ${topK}
    `;

    return rows.map((row) => {
      const metadata = toMetadataRecord(row.metadata);
      return {
        chunk: {
          documentId: row.documentId,
          chunkIndex: row.chunkIndex,
          content: row.content,
          // Offsets são persistidos nos metadados do chunk (não há coluna dedicada).
          startOffset: readNumber(metadata.startOffset, 0),
          endOffset: readNumber(metadata.endOffset, row.content.length),
          tokenCount: row.tokenCount,
          metadata,
        },
        // Distância de cosseno em [0, 2] -> similaridade em [0, 1].
        score: 1 - row.distance / 2,
      };
    });
  }
}

/** Lê um número de um valor desconhecido, com fallback. */
function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Converte o Json do banco em um Record tipado (sem `any`). */
function toMetadataRecord(
  value: Prisma.JsonValue,
): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}
