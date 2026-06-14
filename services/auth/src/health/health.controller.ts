import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

/**
 * Liveness + readiness probes. Public (no auth) so Docker/nginx/uptime monitors
 * can hit them. docker-compose's api healthcheck targets GET /health.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — process is up. Always cheap, never touches the DB. */
  @Get()
  liveness() {
    return { status: 'ok', uptime: Math.round(process.uptime()), timestamp: Date.now() };
  }

  /** Readiness — dependencies (DB) reachable. Returns 503 if the DB is down. */
  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', db: 'up' };
    } catch {
      return { status: 'degraded', db: 'down' };
    }
  }
}
