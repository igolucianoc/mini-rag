import { z } from 'zod';

/** cuid do Prisma — string não-vazia (validação de formato leve). */
const idSchema = z.string().min(1, 'Id obrigatório');

/** Params de rotas com :id. */
export const queryIdParamSchema = z.object({
  id: idSchema,
});

/**
 * Corpo do POST de pergunta. topK e documentIds são opcionais; o default de topK
 * (DEFAULT_TOP_K) é aplicado no RetrievalService, mantendo o schema com tipos de
 * entrada e saída idênticos (o ZodValidationPipe é invariante em T).
 */
export const askQuestionBodySchema = z.object({
  question: z.string().trim().min(1, 'Pergunta obrigatória').max(2000),
  topK: z.number().int().positive().max(20).optional(),
  documentIds: z.array(idSchema).max(100).optional(),
});

/**
 * Query string do endpoint SSE (GET). SSE (via fetch streaming) só carrega
 * parâmetros na URL, então normalizamos os tipos vindos como string:
 *  - `topK` chega como string -> coerção para número;
 *  - `documentIds` pode vir repetido (`?documentIds=a&documentIds=b`) — o Nest
 *    entrega string única ou array; normalizamos sempre para `string[]`.
 * NUNCA aceitamos token de auth aqui: a autenticação continua via header Bearer.
 */
export const askQuestionStreamQuerySchema = z.object({
  question: z.string().trim().min(1, 'Pergunta obrigatória').max(2000),
  topK: z.coerce.number().int().positive().max(20).optional(),
  documentIds: z
    .union([idSchema, z.array(idSchema)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .pipe(z.array(idSchema).max(100))
    .optional(),
});

export type QueryIdParam = z.infer<typeof queryIdParamSchema>;
export type AskQuestionBody = z.infer<typeof askQuestionBodySchema>;
export type AskQuestionStreamQuery = z.infer<
  typeof askQuestionStreamQuerySchema
>;
