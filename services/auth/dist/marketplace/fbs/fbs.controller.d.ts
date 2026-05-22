import { Response } from 'express';
import { FbsService } from './fbs.service';
declare class BatchLabelsDto {
    orderIds: (number | string)[];
    size?: 'LARGE' | 'SMALL';
}
export declare class FbsController {
    private readonly fbsService;
    constructor(fbsService: FbsService);
    getOrders(userId: string, storeId: string, status: string, page: number, size: number, scheme?: 'FBS' | 'DBS', dateFrom?: string, dateTo?: string): Promise<{
        orders: any[];
        totalAmount?: number;
    }>;
    getOrderCounts(userId: string, storeId: string, dateFrom?: string, dateTo?: string): Promise<Record<string, number>>;
    getAllOrders(userId: string, storeId: string, statusesParam?: string): Promise<{
        count: number;
        orders: any[];
    }>;
    getLiveProducts(userId: string, storeId: string, page: number, size: number, filter?: string, searchQuery?: string, sortBy?: string, order?: 'asc' | 'desc'): Promise<{
        products: any[];
        total: number;
    }>;
    getLiveFinanceOrders(userId: string, storeId: string, page: number, size: number, dateFrom?: string, dateTo?: string): Promise<{
        orderItems: any[];
        total: number;
        page: number;
        size: number;
    }>;
    getLiveStocks(userId: string, storeId: string): Promise<{
        stocks: any[];
        total: number;
    }>;
    getLabel(userId: string, storeId: string, orderId: string, size: 'LARGE' | 'SMALL', res: Response): Promise<void>;
    getBatchLabels(userId: string, storeId: string, dto: BatchLabelsDto): Promise<{
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
export {};
