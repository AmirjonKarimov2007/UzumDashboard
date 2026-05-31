"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_module_1 = require("./app.module");
const fatalLogger = new common_1.Logger('Process');
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message ?? String(reason);
    if (typeof msg === 'string' && msg.includes('Redis version'))
        return;
    fatalLogger.warn(`Unhandled promise rejection (kept alive): ${msg}`);
});
process.on('uncaughtException', (err) => {
    fatalLogger.error(`Uncaught exception (kept alive): ${err.message}`, err.stack);
});
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('APP_PORT') || 3001;
    const corsOrigins = configService.get('CORS_ORIGINS')?.split(',') || ['*'];
    app.enableCors({
        origin: corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }));
    app.use((req, res, next) => {
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
//# sourceMappingURL=main.js.map