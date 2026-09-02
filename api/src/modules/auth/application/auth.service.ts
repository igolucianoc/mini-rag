import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { PASSWORD_HASHER } from './password-hasher';
import type { PasswordHasher } from './password-hasher';
import { REFRESH_TOKEN_REPOSITORY } from './refresh-token.repository';
import type { RefreshTokenRepository } from './refresh-token.repository';
import { TokenService } from './token.service';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema';

/** Metadados opcionais da requisição, para auditoria da sessão. */
export interface SessionContext {
  readonly userAgent?: string;
  readonly ip?: string;
}

/** Resultado de login/refresh: access token (corpo) + refresh bruto (cookie). */
export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
}

/** Usuário público (sem passwordHash). */
export interface PublicUser {
  readonly id: string;
  readonly email: string;
}

/** Mensagem genérica de credenciais — não revela se o e-mail existe. */
const INVALID_CREDENTIALS = 'Credenciais inválidas';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async register(input: RegisterInput, ctx: SessionContext = {}): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.prisma.user.create({
      data: { email: input.email, passwordHash },
      select: { id: true, email: true },
    });

    return this.issueTokens(user, randomUUID(), ctx);
  }

  async login(input: LoginInput, ctx: SessionContext = {}): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, passwordHash: true },
    });

    // Erro genérico e sempre verificando o hash — evita revelar existência do
    // e-mail e reduz a diferença de tempo entre "não existe" e "senha errada".
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const valid = await this.hasher.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return this.issueTokens({ id: user.id, email: user.email }, randomUUID(), ctx);
  }

  /**
   * Rotação + reuse detection.
   * - Token desconhecido -> recusa.
   * - Token já revogado/rotacionado reapresentado -> revoga toda a família e recusa.
   * - Token expirado -> recusa.
   * - Token válido -> emite novo par na mesma família e marca o atual como substituído.
   */
  async refresh(rawToken: string, ctx: SessionContext = {}): Promise<AuthTokens> {
    const tokenHash = this.tokenService.hashRefreshToken(rawToken);
    const stored = await this.refreshTokens.findByTokenHash(tokenHash);

    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Reuse detection: um token revogado só é reapresentado se foi vazado/reusado.
    if (stored.revokedAt !== null) {
      await this.refreshTokens.revokeFamily(stored.family);
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, email: true },
    });
    if (!user) {
      await this.refreshTokens.revokeFamily(stored.family);
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokens = await this.issueTokens(user, stored.family, ctx);
    // Liga o token antigo ao novo e o revoga (rotação).
    const newHash = this.tokenService.hashRefreshToken(tokens.refreshToken);
    const created = await this.refreshTokens.findByTokenHash(newHash);
    if (created) {
      await this.refreshTokens.markReplaced(stored.id, created.id);
    }
    return tokens;
  }

  /** Logout: revoga o refresh token atual (idempotente se já ausente). */
  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(rawToken);
    const stored = await this.refreshTokens.findByTokenHash(tokenHash);
    if (stored && stored.revokedAt === null) {
      await this.refreshTokens.revoke(stored.id);
    }
  }

  /** Logout all: revoga toda a família da sessão atual. */
  async logoutAll(rawToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(rawToken);
    const stored = await this.refreshTokens.findByTokenHash(tokenHash);
    if (stored) {
      await this.refreshTokens.revokeFamily(stored.family);
    }
  }

  private async issueTokens(
    user: PublicUser,
    family: string,
    ctx: SessionContext,
  ): Promise<AuthTokens> {
    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
    });
    const { token, tokenHash } = this.tokenService.generateRefreshToken();
    const expiresAt = this.tokenService.refreshTokenExpiry();

    await this.refreshTokens.create({
      userId: user.id,
      tokenHash,
      family,
      expiresAt,
      userAgent: ctx.userAgent,
      ip: ctx.ip,
    });

    return { accessToken, refreshToken: token, refreshTokenExpiresAt: expiresAt };
  }
}
