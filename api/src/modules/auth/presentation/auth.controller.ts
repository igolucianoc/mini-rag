import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '@/core/config/env.schema';
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation.pipe';
import { AuthService } from '../application/auth.service';
import type { AuthTokens, SessionContext } from '../application/auth.service';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './schemas/auth.schema';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { CurrentUser } from './guards/current-user.decorator';
import type { AuthenticatedUser } from './guards/current-user.decorator';

/** Nome do cookie que carrega o refresh token. */
const REFRESH_COOKIE = 'refresh_token';
/** Escopo do cookie: só as rotas de auth precisam enviá-lo. */
const REFRESH_COOKIE_PATH = '/api/auth';

/** Corpo de resposta das rotas que autenticam. Access token fica no corpo. */
interface AuthResponseBody {
  readonly accessToken: string;
  readonly user?: AuthenticatedUser;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ZodValidationPipe<RegisterInput>(registerSchema))
  async register(
    @Body() body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const tokens = await this.authService.register(body, this.sessionContext(req));
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  // Throttle estrito nas rotas sensíveis: 5 tentativas/minuto contra brute force.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe<LoginInput>(loginSchema))
  async login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const tokens = await this.authService.login(body, this.sessionContext(req));
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseBody> {
    const rawToken = this.readRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }
    const tokens = await this.authService.refresh(rawToken, this.sessionContext(req));
    this.setRefreshCookie(res, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = this.readRefreshCookie(req);
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    this.clearRefreshCookie(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAccessGuard)
  async logoutAll(
    @CurrentUser() _user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = this.readRefreshCookie(req);
    if (rawToken) {
      await this.authService.logoutAll(rawToken);
    }
    this.clearRefreshCookie(res);
  }

  private sessionContext(req: Request): SessionContext {
    const userAgent = req.headers['user-agent'];
    return {
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      ip: req.ip,
    };
  }

  private readRefreshCookie(req: Request): string | undefined {
    const cookies: unknown = req.cookies;
    if (typeof cookies !== 'object' || cookies === null) {
      return undefined;
    }
    const value = (cookies as Record<string, unknown>)[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  private setRefreshCookie(res: Response, tokens: AuthTokens): void {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.baseCookieOptions(),
      expires: tokens.refreshTokenExpiresAt,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, this.baseCookieOptions());
  }

  /**
   * Flags do cookie de refresh:
   * - httpOnly: inacessível ao JS, protege contra roubo via XSS.
   * - secure: só trafega em HTTPS (exceto em dev, onde é HTTP local).
   * - sameSite 'strict': o refresh nunca é enviado em requisições cross-site,
   *   fechando CSRF. Como o access token vai no corpo (guardado em memória pelo
   *   front) e é enviado via header Authorization, não dependemos do cookie em
   *   navegações cross-site, então 'strict' não quebra o fluxo.
   * - path restrito às rotas de auth: o cookie só é enviado onde é usado.
   */
  private baseCookieOptions(): CookieOptions {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }
}
