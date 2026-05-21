"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("ioredis");
let SessionService = class SessionService {
    constructor() {
        this.redis = new ioredis_1.Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            db: parseInt(process.env.REDIS_DB || '0'),
        });
    }
    async createSession(data) {
        const key = `session:${data.token}`;
        const value = JSON.stringify({
            userId: data.userId,
            device: data.device,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            createdAt: new Date().toISOString(),
        });
        await this.redis.setex(key, 7 * 24 * 60 * 60, value);
        const userSessionsKey = `user:sessions:${data.userId}`;
        await this.redis.sadd(userSessionsKey, data.token);
    }
    async getSession(token) {
        const key = `session:${token}`;
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
    }
    async deleteSession(token) {
        const session = await this.getSession(token);
        if (session) {
            const key = `session:${token}`;
            const userSessionsKey = `user:sessions:${session.userId}`;
            await this.redis.del(key);
            await this.redis.srem(userSessionsKey, token);
        }
    }
    async deleteAllSessions(userId) {
        const userSessionsKey = `user:sessions:${userId}`;
        const tokens = await this.redis.smembers(userSessionsKey);
        for (const token of tokens) {
            const key = `session:${token}`;
            await this.redis.del(key);
        }
        await this.redis.del(userSessionsKey);
    }
    async getUserSessions(userId) {
        const userSessionsKey = `user:sessions:${userId}`;
        const tokens = await this.redis.smembers(userSessionsKey);
        const sessions = [];
        for (const token of tokens) {
            const session = await this.getSession(token);
            if (session) {
                sessions.push({ ...session, token });
            }
        }
        return sessions;
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], SessionService);
//# sourceMappingURL=sessions.service.js.map