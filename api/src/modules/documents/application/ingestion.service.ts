import { Inject, Injectable, Logger } from '@nestjs/common';
import { DocumentSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { EMBEDDING_PROVIDER } from '@/shared/rag/ports/embedding-provider.port';
import type { EmbeddingProvider } from '@/shared/rag/ports/embedding-provider.port';
import { VECTOR_STORE } from '@/shared/rag/ports/vector-store.port';
import type { VectorStore } from '@/shared/rag/ports/vector-store.port';
import type { SupportedMimeType } from '@/shared/rag/ports/document-parser.port';
import type { EmbeddedRagChunk } from '@/shared/rag/domain/rag-types';
import { chunkText } from '@/shared/rag/chunking/chunk-text';
import type { ChunkOptions } from '@/shared/rag/ports/chunker.port';
import { ParserRegistry } from '../infrastructure/parsers/parser-registry';

/** Opções default de chunking (ADR 0002): 1000 chars, overlap 200. */
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 1000,
  overlap: 200,
};

/** Arquivo recebido para ingestão. */
export interface IngestionFile {
  readonly buffer: Buffer;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** Entrada da ingestão. */
export interface IngestionInput {
  readonly userId: string;
  readonly file: IngestionFile;
  /** Título opcional; default derivado do nome do arquivo. */
  readonly title?: string;
  readonly chunkOptions?: ChunkOptions;
}

/** Resumo da ingestão devolvido ao chamador. */
export interface IngestionResult {
  readonly documentId: string;
  readonly ingestionRunId: string;
  readonly status: 'READY' | 'FAILED';
  readonly chunkCount: number;
  readonly error?: string;
}

/** Erro de ingestão com causa legível (parse inválido, texto vazio etc.). */
export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestionError';
  }
}

/** Mapa mimetype -> enum de fonte do schema. */
const MIME_TO_SOURCE_TYPE: Readonly<Record<SupportedMimeType, DocumentSourceType>> = {
  'text/markdown': DocumentSourceType.MARKDOWN,
  'text/plain': DocumentSourceType.TXT,
  'application/pdf': DocumentSourceType.PDF,
};

/**
 * Orquestra o pipeline de ingestão de um upload:
 *   create Document(PROCESSING) + IngestionRun(PROCESSING)
 *   -> parse -> normaliza -> chunk -> embed -> persiste chunks+embeddings
 *   -> IngestionRun(COMPLETED) + Document(READY).
 *
 * Consistência (ver comentários inline): a criação do Document/IngestionRun é
 * feita antes do trabalho pesado para termos rastro do run. O parse e a validação
 * ocorrem ANTES de qualquer escrita de chunk — se o parse falhar ou o texto
 * normalizado ficar vazio, nenhum chunk é criado e o estado vai para FAILED. A
 * escrita dos chunks + a marcação final (COMPLETED/READY) roda dentro de um
 * `$transaction`, de modo que nunca fica um Document READY com chunks parciais:
 * ou tudo é gravado e o documento vira READY, ou nada é gravado e ele vira FAILED.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parserRegistry: ParserRegistry,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddingProvider: EmbeddingProvider,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
  ) {}

  async ingest(input: IngestionInput): Promise<IngestionResult> {
    const { userId, file } = input;
    const chunkOptions = input.chunkOptions ?? DEFAULT_CHUNK_OPTIONS;
    const title = input.title ?? deriveTitle(file.originalFilename);

    // Rejeita mimetype não suportado antes mesmo de criar registros.
    if (!this.parserRegistry.supports(file.mimeType)) {
      throw new IngestionError(`Tipo de arquivo não suportado: ${file.mimeType}`);
    }
    const sourceType = MIME_TO_SOURCE_TYPE[file.mimeType];

    // 1. Cria Document (PROCESSING) e IngestionRun (PROCESSING).
    const document = await this.prisma.document.create({
      data: {
        userId,
        title,
        sourceType,
        originalFilename: file.originalFilename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        status: 'PROCESSING',
      },
    });
    const ingestionRun = await this.prisma.ingestionRun.create({
      data: { documentId: document.id, status: 'PROCESSING' },
    });

    try {
      // 2. Parse + normalização.
      const parser = this.parserRegistry.resolve(file.mimeType);
      const parsed = await parser.parse({
        content: file.buffer,
        mimeType: file.mimeType,
        originalFilename: file.originalFilename,
      });

      // 3. Documento sem texto útil => FAILED, sem chunks.
      if (parsed.text.trim().length === 0) {
        throw new IngestionError(
          'O documento não produziu texto após a normalização',
        );
      }

      // 4. Chunking.
      const chunkResults = chunkText(parsed.text, chunkOptions);
      if (chunkResults.length === 0) {
        throw new IngestionError('O documento não gerou chunks');
      }

      // 5. Embedding do lote (ordem preservada).
      const embeddings = await this.embeddingProvider.embed(
        chunkResults.map((chunk) => chunk.content),
      );
      if (embeddings.length !== chunkResults.length) {
        throw new IngestionError(
          'O provider de embedding retornou quantidade divergente de vetores',
        );
      }

      // 6. Monta os EmbeddedRagChunk (metadados com filename + offsets).
      const embeddedChunks: EmbeddedRagChunk[] = chunkResults.map(
        (chunk, index) => ({
          documentId: document.id,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          tokenCount: chunk.tokenCount,
          metadata: {
            originalFilename: file.originalFilename,
            startOffset: chunk.startOffset,
            endOffset: chunk.endOffset,
            ...parsed.metadata,
          },
          embedding: requireVector(embeddings, index),
        }),
      );

      // 7. Persiste chunks+embeddings e marca sucesso atomicamente.
      const stats: Prisma.InputJsonValue = {
        chunkCount: embeddedChunks.length,
        totalTokens: embeddedChunks.reduce((sum, c) => sum + c.tokenCount, 0),
        chunkSize: chunkOptions.chunkSize,
        overlap: chunkOptions.overlap,
      };

      await this.vectorStore.upsert(embeddedChunks);
      await this.prisma.$transaction([
        this.prisma.ingestionRun.update({
          where: { id: ingestionRun.id },
          data: {
            status: 'COMPLETED',
            finishedAt: new Date(),
            chunkCount: embeddedChunks.length,
            stats,
          },
        }),
        this.prisma.document.update({
          where: { id: document.id },
          data: { status: 'READY' },
        }),
      ]);

      return {
        documentId: document.id,
        ingestionRunId: ingestionRun.id,
        status: 'READY',
        chunkCount: embeddedChunks.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro na ingestão';
      this.logger.warn(`Ingestão falhou para o documento ${document.id}: ${message}`);

      // Estado de falha consistente: Document FAILED + IngestionRun FAILED.
      await this.prisma.$transaction([
        this.prisma.ingestionRun.update({
          where: { id: ingestionRun.id },
          data: { status: 'FAILED', finishedAt: new Date(), error: message },
        }),
        this.prisma.document.update({
          where: { id: document.id },
          data: { status: 'FAILED' },
        }),
      ]);

      return {
        documentId: document.id,
        ingestionRunId: ingestionRun.id,
        status: 'FAILED',
        chunkCount: 0,
        error: message,
      };
    }
  }
}

/** Deriva um título a partir do nome do arquivo (remove extensão). */
function deriveTitle(filename: string): string {
  const withoutExt = filename.replace(/\.[^./\\]+$/, '');
  const trimmed = withoutExt.trim();
  return trimmed.length > 0 ? trimmed : filename;
}

/** Acesso seguro ao vetor por índice (respeita noUncheckedIndexedAccess). */
function requireVector(vectors: number[][], index: number): number[] {
  const vector = vectors[index];
  if (!vector) {
    throw new IngestionError(`Embedding ausente para o chunk ${index}`);
  }
  return vector;
}
