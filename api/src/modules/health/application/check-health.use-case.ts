import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

/** Resultado do health check da aplicação. */
export interface HealthStatus {
  readonly status: 'ok' | 'degraded';
  readonly db: 'up' | 'down';
  readonly timestamp: string;
}

/**
 * Use-case de verificação de saúde: checa a conectividade com o banco e reporta
 * o estado geral. Não depende do framework HTTP — apenas do PrismaService.
 */
@Injectable()
export class CheckHealthUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<HealthStatus> {
    let db: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      timestamp: new Date().toISOString(),
    };
  }
}
