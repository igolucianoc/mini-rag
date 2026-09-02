import { z } from 'zod';

/**
 * Schemas de entrada das rotas de documentos (Etapa 05). Validação com Zod; os
 * tipos são inferidos dos schemas (fonte única de verdade).
 */

/** cuid do Prisma (@default(cuid())) — string não-vazia. Validação de formato leve. */
const idSchema = z.string().min(1, 'Id obrigatório');

/** Params de rotas com :id. */
export const documentIdParamSchema = z.object({
  id: idSchema,
});

/** Metadados opcionais do upload (título). O arquivo em si vem via multipart. */
export const uploadDocumentBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;
export type UploadDocumentBody = z.infer<typeof uploadDocumentBodySchema>;

/** mimetypes aceitos no upload (espelha SupportedMimeType). */
export const ACCEPTED_MIME_TYPES = [
  'text/markdown',
  'text/plain',
  'application/pdf',
] as const;

/** Tamanho máximo do upload: 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
