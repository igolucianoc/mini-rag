import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from '../modules/health/health.module';
import { AuthModule } from '../modules/auth/auth.module';
import { DocumentsModule } from '../modules/documents/documents.module';
import { QueryModule } from '../modules/query/query.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // Rate limiting global (padrão brando). Rotas sensíveis (login/refresh)
    // aplicam limites mais estritos via @Throttle no controller.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    HealthModule,
    AuthModule,
    DocumentsModule,
    QueryModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
