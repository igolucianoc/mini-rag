import { Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentStatus } from '@prisma/client';
import { PrismaService } from '@/infra/prisma/prisma.service';

/** Item de documento na listagem (com contagem de chunks). */
export interface DocumentListItem {
  readonly id: string;
  readonly title: string;
  readonly status: DocumentStatus;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly chunkCount: number;
  readonly createdAt: Date;
}

/**
 * Operações de leitura/remoção de documentos do usuário autenticado. Toda query
 * é escopada por `userId` para isolar dados entre usuários (o dono é sempre o
 * usuário autenticado).
 */
@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista os documentos do usuário, com a contagem de chunks. */
  async listForUser(userId: string): Promise<DocumentListItem[]> {
    const documents = await this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });

    return documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      chunkCount: doc._count.chunks,
      createdAt: doc.createdAt,
    }));
  }

  /** Detalhe de um documento do usuário; 404 se não existir ou não for dele. */
  async getForUser(userId: string, documentId: string): Promise<DocumentListItem> {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, userId },
      include: { _count: { select: { chunks: true } } },
    });
    if (!doc) {
      throw new NotFoundException('Documento não encontrado');
    }
    return {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      originalFilename: doc.originalFilename,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      chunkCount: doc._count.chunks,
      createdAt: doc.createdAt,
    };
  }

  /**
   * Remove um documento do usuário. Chunks/ingestion runs somem por cascade
   * (onDelete: Cascade no schema). 404 se não for dono.
   */
  async deleteForUser(userId: string, documentId: string): Promise<void> {
    const result = await this.prisma.document.deleteMany({
      where: { id: documentId, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Documento não encontrado');
    }
  }
}
