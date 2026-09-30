import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class SessionService {
  private redis: Redis;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
    });
  }

  /**
   * Create session in Redis
   */
  async createSession(data: {
    userId: string;
    token: string;
    device?: any;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const key = `session:${data.token}`;
    const value = JSON.stringify({
      userId: data.userId,
      device: data.device,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      createdAt: new Date().toISOString(),
    });

    // Keep Redis and database refresh-token lifetimes aligned.
    await this.redis.setex(key, this.refreshTtlSeconds(), value);

    // Add to user's active sessions list
    const userSessionsKey = `user:sessions:${data.userId}`;
    await this.redis.sadd(userSessionsKey, data.token);
  }

  /**
   * Get session
   */
  async getSession(token: string): Promise<any | null> {
    const key = `session:${token}`;
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  /**
   * Delete session
   */
  async deleteSession(token: string): Promise<void> {
    const session = await this.getSession(token);
    if (session) {
      const key = `session:${token}`;
      const userSessionsKey = `user:sessions:${session.userId}`;

      await this.redis.del(key);
      await this.redis.srem(userSessionsKey, token);
    }
  }

  /**
   * Delete all sessions for user
   */
  async deleteAllSessions(userId: string): Promise<void> {
    const userSessionsKey = `user:sessions:${userId}`;
    const tokens = await this.redis.smembers(userSessionsKey);

    // Delete each session
    for (const token of tokens) {
      const key = `session:${token}`;
      await this.redis.del(key);
    }

    // Clear user's sessions set
    await this.redis.del(userSessionsKey);
  }

  /**
   * Get all active sessions for user
   */
  async getUserSessions(userId: string): Promise<any[]> {
    const userSessionsKey = `user:sessions:${userId}`;
    const tokens = await this.redis.smembers(userSessionsKey);

    const sessions: any[] = [];
    for (const token of tokens) {
      const session = await this.getSession(token);
      if (session) {
        sessions.push({ ...session, token });
      }
    }

    return sessions;
  }

  private refreshTtlSeconds(): number {
    const raw = this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN') || '365d';
    const match = raw.match(/^(\d+)([smhd])$/i);
    if (!match) return 365 * 24 * 60 * 60;
    const value = Number(match[1]);
    const units = { s: 1, m: 60, h: 3600, d: 86_400 };
    return Math.max(60, value * units[match[2].toLowerCase() as keyof typeof units]);
  }
}
