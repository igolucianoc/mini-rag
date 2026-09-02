import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import type { Env } from '../core/config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  // cookie-parser: o refresh token trafega em cookie HttpOnly; precisamos ler
  // req.cookies no controller de auth. Preferido a parsear o header à mão.
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });
  // A validação de entrada é feita por ZodValidationPipe nos controllers (o
  // projeto usa Zod, não class-validator), então não registramos o
  // ValidationPipe global do Nest — que exigiria class-validator/transformer.
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API ouvindo em http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
