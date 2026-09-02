import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
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
