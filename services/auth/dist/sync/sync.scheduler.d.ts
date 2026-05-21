import { SyncService } from './sync.service';
import { StoresService } from '../marketplace/stores/stores.service';
export declare class SyncScheduler {
    private readonly syncService;
    private readonly storesService;
    private readonly logger;
    constructor(syncService: SyncService, storesService: StoresService);
    syncOrdersAll(): Promise<void>;
    syncProductsAll(): Promise<void>;
    syncAnalyticsAll(): Promise<void>;
}
