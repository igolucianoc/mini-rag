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

export type QueryIdParam = z.infer<typeof queryIdParamSchema>;
export type AskQuestionBody = z.infer<typeof askQuestionBodySchema>;
