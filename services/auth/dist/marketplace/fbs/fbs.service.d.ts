import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
export declare class FbsService {
    private readonly uzumClient;
    private readonly storesService;
    private readonly logger;
    constructor(uzumClient: UzumApiClient, storesService: StoresService);
    getOrders(userId: string, storeId: string, status?: string, page?: number, size?: number): Promise<{
        orders: any[];
    }>;
    getAllOrders(userId: string, storeId: string, statuses?: string[]): Promise<{
        count: number;
        orders: any[];
    }>;
    getLabelPdf(userId: string, storeId: string, orderId: number | string, size?: 'LARGE' | 'SMALL'): Promise<Buffer | null>;
    getLiveProducts(userId: string, storeId: string, page?: number, size?: number, filter?: string, searchQuery?: string, sortBy?: string, order?: 'asc' | 'desc'): Promise<{
        products: any[];
        total: number;
    }>;
    getLiveFinanceOrders(userId: string, storeId: string, page?: number, size?: number, dateFrom?: number, dateTo?: number): Promise<{
        orderItems: any[];
        total: number;
        page: number;
        size: number;
    }>;
    getLiveStocks(userId: string, storeId: string): Promise<{
        stocks: any[];
        total: number;
    }>;
    getBatchLabelsPdf(userId: string, storeId: string, orderIds: (number | string)[], size?: 'LARGE' | 'SMALL'): Promise<{
        total: number;
        success: number;
        failed: number;
        results: ({
            orderId: string | number;
            ok: boolean;
            document: string | null;
            error?: undefined;
        } | {
            orderId: string | number;
            ok: boolean;
            error: any;
            document?: undefined;
        })[];
    }>;
}
