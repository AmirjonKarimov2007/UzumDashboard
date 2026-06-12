import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

// ─── Process-level safety net ──────────────────────────────────────────────
// BullMQ's internal RedisConnection reconnect loop emits unhandled promise
// rejections when Redis is too old (3.0 vs required 5.0). In Node 16+ those
// rejections eventually kill the process. We log them and keep running so
// the HTTP server (login + everything else) doesn't die.
const fatalLogger = new Logger('Process');
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message ?? String(reason);
  // Don't spam the log with the same Redis-version rejection from BullMQ.
  if (typeof msg === 'string' && msg.includes('Redis version')) return;
  fatalLogger.warn(`Unhandled promise rejection (kept alive): ${msg}`);
});
process.on('uncaughtException', (err: Error) => {
  fatalLogger.error(`Uncaught exception (kept alive): ${err.message}`, err.stack);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT') || 3001;
  const corsOrigins = configService.get<string>('CORS_ORIGINS')?.split(',') || ['*'];

  // CORS
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Security headers
  app.use((req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  await app.listen(port);
  console.log(`🚀 Auth Service running on http://localhost:${port}`);
}
bootstrap();