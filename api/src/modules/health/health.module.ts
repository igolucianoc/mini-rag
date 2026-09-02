import { Module } from '@nestjs/common';
import { HealthController } from './presentation/health.controller';
import { CheckHealthUseCase } from './application/check-health.use-case';

@Module({
  controllers: [HealthController],
  providers: [CheckHealthUseCase],
})
export class HealthModule {}
