import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv } from '../../core/config/env.schema';
import type { Env } from '../../core/config/env.schema';

/**
 * Módulo de configuração tipada. Expõe o ConfigService do Nest já validado
 * pelo schema Zod. Falha rápido na inicialização se o ambiente for inválido.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (raw: Record<string, unknown>): Env => validateEnv(raw),
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class AppConfigModule {}
