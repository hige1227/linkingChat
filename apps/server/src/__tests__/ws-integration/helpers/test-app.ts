/**
 * Shared NestJS test app setup for WS integration tests.
 * Requires Docker services (Postgres, Redis) to be running.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { RedisIoAdapter } from '../../../gateway/adapters/redis-io.adapter';
import { PrismaService } from '../../../prisma/prisma.service';

export interface TestContext {
  app: INestApplication;
  httpServer: any;
  prisma: PrismaService;
  baseUrl: string;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.init();
  await app.listen(0);

  const httpServer = app.getHttpServer();
  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const prisma = app.get(PrismaService);

  return { app, httpServer, prisma, baseUrl };
}
