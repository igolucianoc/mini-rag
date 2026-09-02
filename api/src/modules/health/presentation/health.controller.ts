import { Controller, Get } from '@nestjs/common';
import {
  CheckHealthUseCase,
  type HealthStatus,
} from '../application/check-health.use-case';

@Controller('health')
export class HealthController {
  constructor(private readonly checkHealth: CheckHealthUseCase) {}

  @Get()
  async check(): Promise<HealthStatus> {
    return this.checkHealth.execute();
  }
}
