import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from '@/shared/validation/zod-validation.pipe';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CurrentUser } from '@/modules/auth/guards/current-user.decorator';
import type { AuthenticatedUser } from '@/modules/auth/guards/current-user.decorator';
import { IngestionService } from '../application/ingestion.service';
import type { IngestionResult } from '../application/ingestion.service';
import {
  DocumentsService,
  type DocumentListItem,
} from '../application/documents.service';
import {
  ACCEPTED_MIME_TYPES,
  documentIdParamSchema,
  MAX_UPLOAD_BYTES,
  uploadDocumentBodySchema,
  type DocumentIdParam,
  type UploadDocumentBody,
} from '../schemas/document.schema';

/** Resposta do upload: o run de ingestão + resumo. */
interface UploadResponse {
  readonly documentId: string;
  readonly status: IngestionResult['status'];
  readonly chunkCount: number;
  readonly error?: string;
}

/**
 * Rotas de documentos, todas protegidas por JwtAccessGuard: o dono é sempre o
 * usuário autenticado. Upload é multipart via Multer (FileInterceptor), com
 * validação de tamanho e mimetype. A ingestão é síncrona nesta etapa (aceitável);
 * o gancho para processamento assíncrono (BullMQ) fica documentado, sem adicionar
 * Redis/fila agora.
 */
@Controller('documents')
@UseGuards(JwtAccessGuard)
export class DocumentsController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe<UploadDocumentBody>(uploadDocumentBodySchema))
    body: UploadDocumentBody,
  ): Promise<UploadResponse> {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatório no campo "file"');
    }
    if (!isAcceptedMime(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado: ${file.mimetype}`,
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Arquivo excede o tamanho máximo permitido');
    }

    const result = await this.ingestionService.ingest({
      userId: user.id,
      title: body.title,
      file: {
        buffer: file.buffer,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    return {
      documentId: result.documentId,
      status: result.status,
      chunkCount: result.chunkCount,
      error: result.error,
    };
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentListItem[]> {
    return this.documentsService.listForUser(user.id);
  }

  @Get(':id')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe<DocumentIdParam>(documentIdParamSchema))
    params: DocumentIdParam,
  ): Promise<DocumentListItem> {
    return this.documentsService.getForUser(user.id, params.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe<DocumentIdParam>(documentIdParamSchema))
    params: DocumentIdParam,
  ): Promise<void> {
    await this.documentsService.deleteForUser(user.id, params.id);
  }
}

/** Type guard: o mimetype está na lista de aceitos. */
function isAcceptedMime(
  mimeType: string,
): mimeType is (typeof ACCEPTED_MIME_TYPES)[number] {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType);
}
