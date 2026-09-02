import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './presentation/auth.controller';
import { AuthService } from './application/auth.service';
import { TokenService } from './application/token.service';
import {
  Argon2PasswordHasher,
  PASSWORD_HASHER,
} from './application/password-hasher';
import { REFRESH_TOKEN_REPOSITORY } from './application/refresh-token.repository';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository';
import { JwtAccessGuard } from './guards/jwt-access.guard';

/**
 * Slice de autenticação (Etapa 04). JwtModule é registrado sem secret global —
 * cada operação passa o secret/TTL certos via ConfigService no TokenService.
 * Exporta TokenService e JwtAccessGuard para reuso pelos próximos slices.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAccessGuard,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
  ],
  exports: [TokenService, JwtAccessGuard],
})
export class AuthModule {}
