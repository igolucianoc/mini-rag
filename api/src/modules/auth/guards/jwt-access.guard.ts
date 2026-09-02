import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../application/token.service';
import type { AuthenticatedUser } from './current-user.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Guard reutilizável que valida o access token Bearer e popula `request.user`.
 * Usado pelos próximos slices para proteger rotas.
 */
@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }

    try {
      const claims = await this.tokenService.verifyAccessToken(token);
      request.user = { id: claims.sub, email: claims.email };
      return true;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado');
    }
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (!header) {
      return null;
    }
    const [scheme, value] = header.split(' ');
    if (scheme !== 'Bearer' || !value) {
      return null;
    }
    return value;
  }
}
