import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { ConnectStoreDto, UpdateConnectionDto } from './dto/stores.dto';
export declare class StoresService {
    private readonly prisma;
    private readonly uzumClient;
    private readonly config;
    private readonly logger;
    constructor(prisma: PrismaService, uzumClient: UzumApiClient, config: ConfigService);
    private get encryptionSecret();
    getStores(userId: string): Promise<({
        connection: {
            uzumShopId: string;
            isConnected: boolean;
            isAutoSync: boolean;
            lastSyncAt: Date | null;
            lastSyncStatus: import(".prisma/client").$Enums.SyncStatus;
            lastSyncError: string | null;
            rateLimitRemaining: number | null;
            rateLimitDayRemaining: number | null;
        } | null;
        _count: {
            products: number;
            orders: number;
        };
    } & {
        status: import(".prisma/client").$Enums.StoreStatus;
        id: string;
        userId: string;
        name: string;
        domain: string | null;
        logo: string | null;
        plan: import(".prisma/client").$Enums.Plan;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    getStore(userId: string, storeId: string): Promise<{
        connection: {
            uzumShopId: string;
            isConnected: boolean;
            isAutoSync: boolean;
            lastSyncAt: Date | null;
            lastSyncStatus: import(".prisma/client").$Enums.SyncStatus;
            lastSyncError: string | null;
            rateLimitRemaining: number | null;
            rateLimitDayRemaining: number | null;
        } | null;
    } & {
        status: import(".prisma/client").$Enums.StoreStatus;
        id: string;
        userId: string;
        name: string;
        domain: string | null;
        logo: string | null;
        plan: import(".prisma/client").$Enums.Plan;
        createdAt: Date;
        updatedAt: Date;
    }>;
    connectStore(userId: string, storeId: string, dto: ConnectStoreDto): Promise<{
        connected: boolean;
        shopName: string;
        warning: string;
        message: string;
    } | {
        connected: boolean;
        shopName: string;
        warning?: undefined;
        message?: undefined;
    }>;
    disconnectStore(userId: string, storeId: string): Promise<{
        disconnected: boolean;
    }>;
    updateConnectionSettings(userId: string, storeId: string, dto: UpdateConnectionDto): Promise<{
        updated: boolean;
    }>;
    testConnection(userId: string, storeId: string): Promise<{
        healthy: boolean;
        shopName?: string;
        latencyMs?: number;
    }>;
    getDecryptedApiKey(storeId: string): Promise<string | null>;
    getStoreCredentials(userId: string, storeId: string): Promise<{
        uzumShopId: string;
        apiKey: string;
    }>;
    getConnectionInfo(storeId: string): Promise<{
        uzumShopId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        storeId: string;
        apiKeyEncrypted: string;
        apiKeyIv: string;
        apiKeyTag: string;
        isConnected: boolean;
        isAutoSync: boolean;
        lastSyncAt: Date | null;
        lastSyncStatus: import(".prisma/client").$Enums.SyncStatus;
        lastSyncError: string | null;
        rateLimitRemaining: number | null;
        rateLimitDayRemaining: number | null;
        rateLimitResetAt: Date | null;
    } | null>;
    markSyncStarted(storeId: string): Promise<void>;
    markSyncCompleted(storeId: string): Promise<void>;
    markSyncFailed(storeId: string, error: string): Promise<void>;
    getConnectedStores(): Promise<Array<{
        storeId: string;
        uzumShopId: string;
    }>>;
}
