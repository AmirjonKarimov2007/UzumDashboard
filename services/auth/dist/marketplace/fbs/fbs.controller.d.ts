import { Response } from 'express';
import { FbsService } from './fbs.service';
declare class BatchLabelsDto {
    orderIds: (number | string)[];
    size?: 'LARGE' | 'SMALL';
}
declare class StockUpdateItem {
    skuId: number;
    amount: number;
}
declare class SetStocksDto {
    updates: StockUpdateItem[];
}
declare class CancelOrderDto {
    reason: string;
    comment?: string;
}
declare class IdentifierItem {
    orderItemId: number;
    values: string[];
}
declare class SetIdentifiersDto {
    items: IdentifierItem[];
}
declare class PriceSkuItem {
    skuId: number;
    fullPrice?: number;
    sellPrice?: number;
    skuTitle?: string;
}
declare class UpdatePricesDto {
    productId: number;
    skuList: PriceSkuItem[];
}
declare class CreateInvoiceDto {
    orderIds: number[];
    dropOffPointUuid: string;
    timeSlotUuid: string;
    sellerId: number;
    idempotencyKey?: string;
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
    confirmOrder(userId: string, storeId: string, orderId: string): Promise<{
        ok: boolean;
        order?: any;
        error?: string;
    }>;
    cancelOrder(userId: string, storeId: string, orderId: string, dto: CancelOrderDto): Promise<{
        ok: boolean;
        error?: string;
        code?: string;
    }>;
    setIdentifiers(userId: string, storeId: string, orderId: string, dto: SetIdentifiersDto): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
    }>;
    getReturnReasons(userId: string, storeId: string): Promise<any[]>;
    dbsDelivering(userId: string, storeId: string, orderId: string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    dbsCompleted(userId: string, storeId: string, orderId: string, issueCode?: string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    dbsRefund(userId: string, storeId: string, orderId: string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    updatePrices(userId: string, storeId: string, dto: UpdatePricesDto): Promise<{
        ok: boolean;
        error?: string;
        code?: string;
    }>;
    getReturns(userId: string, storeId: string, page: number, size: number, returnId?: string): Promise<{
        returns: any[];
    }>;
    getSupplyInvoices(userId: string, storeId: string, page: number, size: number): Promise<{
        invoices: any[];
    }>;
    getInvoices(userId: string, storeId: string, statusesParam?: string, page?: number, size?: number): Promise<{
        invoices: any[];
    }>;
    getInvoice(userId: string, storeId: string, invoiceId: string): Promise<any>;
    getInvoiceOrders(userId: string, storeId: string, invoiceId: string): Promise<{
        orders: any[];
    }>;
    getInvoiceAct(userId: string, storeId: string, invoiceId: string, res: Response): Promise<void>;
    getInvoiceClosing(userId: string, storeId: string, invoiceId: string, res: Response): Promise<void>;
    cancelInvoice(userId: string, storeId: string, invoiceId: string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    createInvoice(userId: string, storeId: string, dto: CreateInvoiceDto): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    getDropOffPoints(userId: string, storeId: string, orderIds: string): Promise<any[]>;
    getTimeSlots(userId: string, storeId: string, dopId: string, orderIds: string): Promise<any[]>;
    getProductAnalytics(userId: string, storeId: string, force?: string): Promise<any>;
    getLiveProducts(userId: string, storeId: string, page: number, size: number, filter?: string, searchQuery?: string, sortBy?: string, order?: 'asc' | 'desc'): Promise<any>;
    getLiveFinanceOrders(userId: string, storeId: string, page: number, size: number, dateFrom?: string, dateTo?: string): Promise<{
        orderItems: any[];
        total: number;
        page: number;
        size: number;
    }>;
    getLiveStocks(userId: string, storeId: string, force?: string): Promise<{
        stocks: {
            skuId: any;
            skuTitle: any;
            productTitle: any;
            barcode: any;
            amount: any;
            fbsLinked: any;
            fbsAllowed: any;
            dbsLinked: any;
            dbsAllowed: any;
            sellerSkuCode: any;
            image: any;
            productId: any;
            price: any;
            purchasePrice: any;
            sold: any;
            category: any;
            article: any;
        }[];
        total: number;
        totalUnits: any;
        totalValue: number;
        inStock: number;
        outOfStock: number;
    }>;
    setStocks(userId: string, storeId: string, dto: SetStocksDto): Promise<{
        totalRecords: number;
        updatedRecords: number;
        skipped: number[];
    }>;
    getLabel(userId: string, storeId: string, orderId: string, size: 'LARGE' | 'SMALL', res: Response): Promise<void>;
    getBatchLabels(userId: string, storeId: string, dto: BatchLabelsDto): Promise<{
        total: number;
        success: number;
        failed: number;
        results: {
            orderId: any;
            ok: boolean;
            document?: string | null;
            error?: string;
        }[];
    }>;
    getBatchBarcodes(userId: string, storeId: string, dto: BatchLabelsDto): Promise<{
        items: {
            orderId: number;
            itemId: number;
            barcode: string;
            skuTitle: string;
            title: string;
            amount: number;
        }[];
        failedOrders: number;
    }>;
}
export {};
