import { z } from 'zod';

/**
 * Schemas de entrada das rotas de auth (Etapa 04).
 * Validação com Zod; os DTO types são inferidos dos schemas (fonte única).
 */

/** Senha mínima de 8 caracteres — requisito do prompt. */
const passwordSchema = z.string().min(8, 'A senha deve ter ao menos 8 caracteres');

export const registerSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
