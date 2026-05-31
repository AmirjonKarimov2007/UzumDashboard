import { StoresService } from './stores.service';
import { ConnectStoreDto, UpdateConnectionDto } from './dto/stores.dto';
export declare class StoresController {
    private readonly storesService;
    constructor(storesService: StoresService);
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
    testConnection(userId: string, storeId: string): Promise<{
        healthy: boolean;
        shopName?: string;
        latencyMs?: number;
    }>;
    updateConnectionSettings(userId: string, storeId: string, dto: UpdateConnectionDto): Promise<{
        updated: boolean;
    }>;
}
