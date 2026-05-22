import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { encrypt, decrypt } from '../../common/utils/crypto.util';
import { ConnectStoreDto, UpdateConnectionDto } from './dto/stores.dto';

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
    private readonly config: ConfigService,
  ) {}

  private get encryptionSecret(): string {
    const secret = this.config.get<string>('ENCRYPTION_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error('ENCRYPTION_SECRET must be at least 32 characters');
    }
    return secret;
  }

  async getStores(userId: string) {
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

  async getStore(userId: string, storeId: string) {
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
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async connectStore(userId: string, storeId: string, dto: ConnectStoreDto) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
    if (!store) throw new NotFoundException('Store not found');

    // Try to validate credentials against Uzum API (non-blocking)
    this.logger.log(`Validating Uzum credentials for store ${storeId}`);
    let shopName = `Uzum Shop ${dto.uzumShopId}`;
    let validationWarning: string | null = null;

    try {
      const { valid, shops } = await this.uzumClient.validateConnection(storeId, dto.apiKey);
      if (valid && shops.length > 0) {
        const matchingShop = shops.find((s) => String(s.id) === dto.uzumShopId);
        if (matchingShop) {
          shopName = matchingShop.name || shopName;
        }
        // Verify shop ID is among returned shops
        if (!matchingShop) {
          validationWarning = `Shop ID ${dto.uzumShopId} Uzum hisobingizda topilmadi. Mavjud do'konlar: ${shops.map((s) => `${s.id} (${s.name})`).join(', ')}`;
        }
      }
    } catch (err: any) {
      // Surface friendly validation errors — but still allow saving credentials
      // so user can test via "Test Connection" or manual sync
      validationWarning = err?.message || 'Uzum API tekshiruvi muvaffaqiyatsiz — kalitni tekshiring';
      this.logger.warn(`Uzum validation failed for store ${storeId}: ${validationWarning}`);
    }

    // Check for conflicts with other stores
    const existing = await this.prisma.storeConnection.findFirst({
      where: { uzumShopId: dto.uzumShopId },
    });
    if (existing && existing.storeId !== storeId) {
      throw new ConflictException('Bu Uzum do\'koni boshqa hisobga bog\'langan');
    }

    // Encrypt API key
    const { encrypted, iv, tag } = encrypt(dto.apiKey, this.encryptionSecret);

    // Upsert connection — save credentials regardless of validation result
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

    // Update store name from Uzum if we got it
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
        shopName,
        warning: validationWarning,
        message: 'Sozlamalar saqlandi, lekin Uzum API bilan aloqa o\'rnatilmadi. Uzum Seller paneldan to\'g\'ri API kalitini oling.',
      };
    }

    return { connected: true, shopName };
  }

  async disconnectStore(userId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
    if (!store) throw new NotFoundException('Store not found');

    await this.prisma.storeConnection.updateMany({
      where: { storeId },
      data: { isConnected: false },
    });

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

  async updateConnectionSettings(userId: string, storeId: string, dto: UpdateConnectionDto) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
    if (!store) throw new NotFoundException('Store not found');

    await this.prisma.storeConnection.updateMany({
      where: { storeId },
      data: { isAutoSync: dto.autoSync },
    });

    return { updated: true };
  }

  async testConnection(userId: string, storeId: string): Promise<{ healthy: boolean; shopName?: string; latencyMs?: number }> {
    const conn = await this.prisma.storeConnection.findUnique({ where: { storeId } });
    if (!conn || !conn.isConnected) return { healthy: false };

    const apiKey = decrypt(conn.apiKeyEncrypted, conn.apiKeyIv, conn.apiKeyTag, this.encryptionSecret);

    const start = Date.now();
    const { shops } = await this.uzumClient.validateConnection(storeId, apiKey);
    const latencyMs = Date.now() - start;

    const shop = shops.find((s) => String(s.id) === conn.uzumShopId);
    return { healthy: true, shopName: shop?.name, latencyMs };
  }

  // Used internally by sync workers & FBS service
  async getDecryptedApiKey(storeId: string): Promise<string | null> {
    const conn = await this.prisma.storeConnection.findUnique({ where: { storeId } });
    if (!conn?.apiKeyEncrypted) return null;
    return decrypt(conn.apiKeyEncrypted, conn.apiKeyIv, conn.apiKeyTag, this.encryptionSecret);
  }

  // Get both shopId and apiKey for FBS calls — single source of truth
  async getStoreCredentials(
    userId: string,
    storeId: string,
  ): Promise<{ uzumShopId: string; apiKey: string }> {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, userId },
      include: { connection: true },
    });
    if (!store) throw new NotFoundException("Do'kon topilmadi");
    if (!store.connection?.uzumShopId || !store.connection?.apiKeyEncrypted) {
      throw new NotFoundException("Do'kon Uzum API'ga ulanmagan. Settings → Do'kon ulanish bo'limidan API kalitni kiriting.");
    }
    return {
      uzumShopId: store.connection.uzumShopId,
      apiKey: decrypt(
        store.connection.apiKeyEncrypted,
        store.connection.apiKeyIv,
        store.connection.apiKeyTag,
        this.encryptionSecret,
      ),
    };
  }

  async getConnectionInfo(storeId: string) {
    return this.prisma.storeConnection.findUnique({ where: { storeId } });
  }

  async markSyncStarted(storeId: string) {
    await this.prisma.storeConnection.updateMany({
      where: { storeId },
      data: { lastSyncStatus: 'RUNNING', lastSyncError: null },
    });
  }

  async markSyncCompleted(storeId: string) {
    await this.prisma.storeConnection.updateMany({
      where: { storeId },
      data: { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', lastSyncError: null },
    });
  }

  async markSyncFailed(storeId: string, error: string) {
    await this.prisma.storeConnection.updateMany({
      where: { storeId },
      data: { lastSyncStatus: 'FAILED', lastSyncError: error.slice(0, 500) },
    });
  }

  async getConnectedStores(): Promise<Array<{ storeId: string; uzumShopId: string }>> {
    const connections = await this.prisma.storeConnection.findMany({
      where: { isConnected: true },
      select: { storeId: true, uzumShopId: true },
    });
    return connections;
  }
}
