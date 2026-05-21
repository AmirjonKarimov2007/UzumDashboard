import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class SessionService {
  private redis: Redis;

  constructor() {
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

    // Store with 7 day TTL (matches refresh token expiry)
    await this.redis.setex(key, 7 * 24 * 60 * 60, value);

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
}