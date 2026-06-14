import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { FinanceSyncService } from '../finance/finance-sync.service';
export interface ReturnsFilters {
    dateFrom?: number;
    dateTo?: number;
    product?: string;
    sku?: string;
    status?: string;
    force?: boolean;
}
export declare class ReturnsService {
    private readonly prisma;
    private readonly uzumClient;
    private readonly storesService;
    private readonly financeSync;
    private readonly logger;
    private readonly LOST_DAYS;
    private readonly SYNC_TTL_MS;
    private lastSync;
    private inflight;
    constructor(prisma: PrismaService, uzumClient: UzumApiClient, storesService: StoresService, financeSync: FinanceSyncService);
    syncReturns(userId: string, storeId: string): Promise<void>;
    private doSync;
    private detectLost;
    listInvoices(userId: string, storeId: string, page?: number, size?: number): Promise<{
        invoices: any[];
        page: number;
        size: number;
    }>;
    getInvoice(userId: string, storeId: string, returnId: string | number): Promise<{
        invoice: any;
    }>;
    getAnalytics(userId: string, storeId: string, filters?: ReturnsFilters): Promise<{
        analytics: {
            totalItems: number;
            totalQty: number;
            totalSaleValue: number;
            totalCostUsd: number;
            lostItems: number;
            lostQty: number;
            lostCostUsd: number;
            lostSaleValue: number;
            returnRate: number | null;
            soldQty: number;
            byStatus: Record<string, number>;
            mostReturned: {
                name: string;
                sku: string;
                qty: number;
                saleValue: number;
            }[];
            byMonth: {
                qty: number;
                saleValue: number;
                lost: number;
                month: string;
            }[];
        };
        returns: {
            id: any;
            returnId: any;
            publicId: any;
            uzumOrderId: any;
            productName: any;
            skuTitle: any;
            barcode: any;
            quantity: any;
            costUsd: number | null;
            salePrice: number | null;
            reason: any;
            status: any;
            manualReceived: any;
            orderedAt: number | null;
            returnedAt: number | null;
            receivedAt: number | null;
            daysWaiting: number | null;
        }[];
        lostReport: {
            id: any;
            returnId: any;
            publicId: any;
            uzumOrderId: any;
            productName: any;
            skuTitle: any;
            barcode: any;
            quantity: any;
            costUsd: number | null;
            salePrice: number | null;
            reason: any;
            status: any;
            manualReceived: any;
            orderedAt: number | null;
            returnedAt: number | null;
            receivedAt: number | null;
            daysWaiting: number | null;
        }[];
        lastSyncedAt: number | null;
    }>;
    private toDto;
}
