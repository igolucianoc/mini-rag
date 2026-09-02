import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Usuário autenticado anexado à request pelo JwtAccessGuard. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}

/** Request com o usuário autenticado presente (garantido após o guard). */
interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Injeta o usuário autenticado nos handlers. Deve ser usado em rotas protegidas
 * pelo `JwtAccessGuard`, que popula `request.user`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
