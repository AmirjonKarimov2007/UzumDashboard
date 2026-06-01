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
var StoresService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoresService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const crypto_util_1 = require("../../common/utils/crypto.util");
let StoresService = StoresService_1 = class StoresService {
    constructor(prisma, uzumClient, config) {
        this.prisma = prisma;
        this.uzumClient = uzumClient;
        this.config = config;
        this.logger = new common_1.Logger(StoresService_1.name);
    }
    get encryptionSecret() {
        const secret = this.config.get('ENCRYPTION_SECRET');
        if (!secret || secret.length < 32) {
            throw new Error('ENCRYPTION_SECRET must be at least 32 characters');
        }
        return secret;
    }
    async getStores(userId) {
        return this.prisma.store.findMany({
            where: { userId },
            include: {
                connection: {
                    select: {
                        isConnected: true,
                        isAutoSync: true,
                        lastSyncAt: true,
                        lastSyncStatus: true,
                        lastSyncError: true,
                        rateLimitRemaining: true,
                        rateLimitDayRemaining: true,
                        uzumShopId: true,
                    },
                },
                _count: {
                    select: {
                        products: true,
                        orders: true,
                    },
                },
            },
        });
    }
    async getStore(userId, storeId) {
        const store = await this.prisma.store.findFirst({
            where: { id: storeId, userId },
            include: {
                connection: {
                    select: {
                        isConnected: true,
                        isAutoSync: true,
                        lastSyncAt: true,
                        lastSyncStatus: true,
                        lastSyncError: true,
                        rateLimitRemaining: true,
                        rateLimitDayRemaining: true,
                        uzumShopId: true,
                    },
                },
            },
        });
        if (!store)
            throw new common_1.NotFoundException('Store not found');
        return store;
    }
    async connectStore(userId, storeId, dto) {
        let store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
        if (!store) {
            store = await this.prisma.store.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
            if (!store) {
                store = await this.prisma.store.create({
                    data: { userId, name: "Mening do'konim", plan: 'FREE', status: 'ACTIVE' },
                });
                this.logger.log(`connectStore: auto-created store ${store.id} for user ${userId}`);
            }
            storeId = store.id;
        }
        this.logger.log(`Validating Uzum credentials for store ${storeId}`);
        let shopName = `Uzum Shop ${dto.uzumShopId}`;
        let validationWarning = null;
        try {
            const { valid, shops } = await this.uzumClient.validateConnection(storeId, dto.apiKey);
            if (valid && shops.length > 0) {
                const matchingShop = shops.find((s) => String(s.id) === dto.uzumShopId);
                if (matchingShop) {
                    shopName = matchingShop.name || shopName;
                }
                if (!matchingShop) {
                    validationWarning = `Shop ID ${dto.uzumShopId} Uzum hisobingizda topilmadi. Mavjud do'konlar: ${shops.map((s) => `${s.id} (${s.name})`).join(', ')}`;
                }
            }
        }
        catch (err) {
            validationWarning = err?.message || 'Uzum API tekshiruvi muvaffaqiyatsiz — kalitni tekshiring';
            this.logger.warn(`Uzum validation failed for store ${storeId}: ${validationWarning}`);
        }
        const existing = await this.prisma.storeConnection.findFirst({
            where: { uzumShopId: dto.uzumShopId, isConnected: true },
            include: { store: { include: { user: { select: { phone: true } } } } },
        });
        if (existing && existing.storeId !== storeId) {
            const isDev = process.env.NODE_ENV !== 'production';
            const ownerPhone = existing.store?.user?.phone;
            const msg = isDev && ownerPhone
                ? `Bu Uzum do'koni boshqa hisobga bog'langan: ${ownerPhone}`
                : 'Bu Uzum do\'koni boshqa hisobga bog\'langan';
            throw new common_1.ConflictException(msg);
        }
        const { encrypted, iv, tag } = (0, crypto_util_1.encrypt)(dto.apiKey, this.encryptionSecret);
        await this.prisma.storeConnection.upsert({
            where: { storeId },
            create: {
                storeId,
                uzumShopId: dto.uzumShopId,
                apiKeyEncrypted: encrypted,
                apiKeyIv: iv,
                apiKeyTag: tag,
                isConnected: !validationWarning,
                isAutoSync: dto.autoSync ?? true,
                lastSyncError: validationWarning,
            },
            update: {
                uzumShopId: dto.uzumShopId,
                apiKeyEncrypted: encrypted,
                apiKeyIv: iv,
                apiKeyTag: tag,
                isConnected: !validationWarning,
                isAutoSync: dto.autoSync ?? true,
                lastSyncError: validationWarning,
            },
        });
        await this.prisma.store.update({
            where: { id: storeId },
            data: { name: shopName },
        });
        await this.prisma.auditLog.create({
            data: {
                action: 'STORE_CONNECTED',
                userId,
                entity: 'Store',
                entityId: storeId,
                metadata: { uzumShopId: dto.uzumShopId, warning: validationWarning },
            },
        });
        this.logger.log(`Store ${storeId} saved (shopId=${dto.uzumShopId}, warning=${validationWarning})`);
        if (validationWarning) {
            return {
                connected: false,
                storeId,
                shopName,
                warning: validationWarning,
                message: 'Sozlamalar saqlandi, lekin Uzum API bilan aloqa o\'rnatilmadi. Uzum Seller paneldan to\'g\'ri API kalitini oling.',
            };
        }
        return { connected: true, storeId, shopName };
    }
    async disconnectStore(userId, storeId) {
        const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
        if (!store)
            throw new common_1.NotFoundException('Store not found');
        await this.prisma.storeConnection.deleteMany({ where: { storeId } });
        await this.prisma.auditLog.create({
            data: {
                action: 'STORE_DISCONNECTED',
                userId,
                entity: 'Store',
                entityId: storeId,
            },
        });
        return { disconnected: true };
    }
    async updateConnectionSettings(userId, storeId, dto) {
        const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
        if (!store)
            throw new common_1.NotFoundException('Store not found');
        await this.prisma.storeConnection.updateMany({
            where: { storeId },
            data: { isAutoSync: dto.autoSync },
        });
        return { updated: true };
    }
    async testConnection(userId, storeId) {
        const conn = await this.prisma.storeConnection.findUnique({ where: { storeId } });
        if (!conn || !conn.isConnected)
            return { healthy: false };
        const apiKey = (0, crypto_util_1.decrypt)(conn.apiKeyEncrypted, conn.apiKeyIv, conn.apiKeyTag, this.encryptionSecret);
        const start = Date.now();
        const { shops } = await this.uzumClient.validateConnection(storeId, apiKey);
        const latencyMs = Date.now() - start;
        const shop = shops.find((s) => String(s.id) === conn.uzumShopId);
        return { healthy: true, shopName: shop?.name, latencyMs };
    }
    async getDecryptedApiKey(storeId) {
        const conn = await this.prisma.storeConnection.findUnique({ where: { storeId } });
        if (!conn?.apiKeyEncrypted)
            return null;
        return (0, crypto_util_1.decrypt)(conn.apiKeyEncrypted, conn.apiKeyIv, conn.apiKeyTag, this.encryptionSecret);
    }
    async getStoreCredentials(userId, storeId) {
        const store = await this.prisma.store.findFirst({
            where: { id: storeId, userId },
            include: { connection: true },
        });
        if (!store)
            throw new common_1.NotFoundException("Do'kon topilmadi");
        if (!store.connection?.uzumShopId || !store.connection?.apiKeyEncrypted) {
            throw new common_1.NotFoundException("Do'kon Uzum API'ga ulanmagan. Settings → Do'kon ulanish bo'limidan API kalitni kiriting.");
        }
        return {
            uzumShopId: store.connection.uzumShopId,
            apiKey: (0, crypto_util_1.decrypt)(store.connection.apiKeyEncrypted, store.connection.apiKeyIv, store.connection.apiKeyTag, this.encryptionSecret),
        };
    }
    async getConnectionInfo(storeId) {
        return this.prisma.storeConnection.findUnique({ where: { storeId } });
    }
    async markSyncStarted(storeId) {
        await this.prisma.storeConnection.updateMany({
            where: { storeId },
            data: { lastSyncStatus: 'RUNNING', lastSyncError: null },
        });
    }
    async markSyncCompleted(storeId) {
        await this.prisma.storeConnection.updateMany({
            where: { storeId },
            data: { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', lastSyncError: null },
        });
    }
    async markSyncFailed(storeId, error) {
        await this.prisma.storeConnection.updateMany({
            where: { storeId },
            data: { lastSyncStatus: 'FAILED', lastSyncError: error.slice(0, 500) },
        });
    }
    async getConnectedStores() {
        const connections = await this.prisma.storeConnection.findMany({
            where: { isConnected: true },
            select: { storeId: true, uzumShopId: true },
        });
        return connections;
    }
};
exports.StoresService = StoresService;
exports.StoresService = StoresService = StoresService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        uzum_api_client_1.UzumApiClient,
        config_1.ConfigService])
], StoresService);
//# sourceMappingURL=stores.service.js.map