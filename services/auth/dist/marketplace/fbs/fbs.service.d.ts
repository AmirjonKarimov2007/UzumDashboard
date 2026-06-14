import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { FinanceSyncService } from '../finance/finance-sync.service';
export declare class FbsService {
    private readonly uzumClient;
    private readonly storesService;
    private readonly financeSync;
    private readonly logger;
    private countsCache;
    private productsCache;
    private productsInflight;
    private readonly PRODUCTS_TTL_MS;
    private productAnalyticsCache;
    private readonly PRODUCT_ANALYTICS_TTL_MS;
    constructor(uzumClient: UzumApiClient, storesService: StoresService, financeSync: FinanceSyncService);
    getOrders(userId: string, storeId: string, status?: string, page?: number, size?: number, extra?: {
        scheme?: 'FBS' | 'DBS';
        dateFrom?: number;
        dateTo?: number;
    }): Promise<{
        orders: any[];
        totalAmount?: number;
    }>;
    getAllOrders(userId: string, storeId: string, statuses?: string[]): Promise<{
        count: number;
        orders: any[];
    }>;
    getLabelPdf(userId: string, storeId: string, orderId: number | string, size?: 'LARGE' | 'SMALL'): Promise<Buffer | null>;
    getLiveProducts(userId: string, storeId: string, page?: number, size?: number, filter?: string, searchQuery?: string, sortBy?: string, order?: 'asc' | 'desc'): Promise<any>;
    getLiveFinanceOrders(userId: string, storeId: string, page?: number, size?: number, dateFrom?: number, dateTo?: number): Promise<{
        orderItems: any[];
        total: number;
        page: number;
        size: number;
    }>;
    private countsInflight;
    getOrderCounts(userId: string, storeId: string, dateFrom?: number, dateTo?: number): Promise<Record<string, number>>;
    private refreshOrderCounts;
    getOrdersAdvanced(userId: string, storeId: string, params: {
        status?: string;
        page?: number;
        size?: number;
        dateFrom?: number;
        dateTo?: number;
        scheme?: 'FBS' | 'DBS';
    }): Promise<{
        orders: any[];
        page: number;
        size: number;
        status: string;
    }>;
    confirmOrder(userId: string, storeId: string, orderId: number | string): Promise<{
        ok: boolean;
        order?: any;
        error?: string;
    }>;
    private expireCounts;
    cancelOrder(userId: string, storeId: string, orderId: number | string, reason: string, comment?: string): Promise<{
        ok: boolean;
        error?: string;
        code?: string;
    }>;
    setOrderIdentifiers(userId: string, storeId: string, orderId: number | string, items: Array<{
        orderItemId: number;
        values: string[];
    }>): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
    }>;
    private returnReasonsCache;
    getReturnReasons(userId: string, storeId: string): Promise<any[]>;
    dbsDelivering(userId: string, storeId: string, orderId: number | string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    dbsCompleted(userId: string, storeId: string, orderId: number | string, issueCode?: number): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    dbsRefund(userId: string, storeId: string, orderId: number | string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    updatePrices(userId: string, storeId: string, productId: number, skuList: Array<{
        skuId: number;
        fullPrice?: number;
        sellPrice?: number;
        skuTitle?: string;
    }>): Promise<{
        ok: boolean;
        error?: string;
        code?: string;
    }>;
    getInvoiceActPdf(userId: string, storeId: string, invoiceId: number | string): Promise<Buffer | null>;
    getInvoiceClosingPdf(userId: string, storeId: string, invoiceId: number | string): Promise<Buffer | null>;
    cancelInvoice(userId: string, storeId: string, invoiceId: number | string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    getInvoiceDropOffPoints(userId: string, storeId: string, orderIds: (number | string)[]): Promise<any[]>;
    getInvoiceTimeSlots(userId: string, storeId: string, dopId: string, orderIds: (number | string)[]): Promise<any[]>;
    createInvoice(userId: string, storeId: string, body: {
        orderIds: number[];
        dropOffPointUuid: string;
        timeSlotUuid: string;
        sellerId: number;
        idempotencyKey?: string;
    }): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    getReturns(userId: string, storeId: string, params?: {
        returnId?: number | string;
        page?: number;
        size?: number;
    }): Promise<{
        returns: any[];
    }>;
    getSupplyInvoices(userId: string, storeId: string, page?: number, size?: number): Promise<{
        invoices: any[];
    }>;
    getInvoices(userId: string, storeId: string, statuses?: string[], page?: number, size?: number): Promise<{
        invoices: any[];
    }>;
    getInvoice(userId: string, storeId: string, invoiceId: number | string): Promise<any>;
    getInvoiceOrders(userId: string, storeId: string, invoiceId: number | string): Promise<{
        orders: any[];
    }>;
    private stockMetaCache;
    private readonly STOCK_META_TTL_MS;
    private pickStockImage;
    private getStockMeta;
    getLiveStocks(userId: string, storeId: string, force?: boolean): Promise<{
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
    setStocks(userId: string, storeId: string, updates: Array<{
        skuId: number;
        amount: number;
    }>): Promise<{
        totalRecords: number;
        updatedRecords: number;
        skipped: number[];
    }>;
    getProductAnalytics(userId: string, storeId: string, force?: boolean): Promise<any>;
    getBatchLabelsPdf(userId: string, storeId: string, orderIds: (number | string)[], size?: 'LARGE' | 'SMALL'): Promise<{
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
    getOrderItemBarcodes(userId: string, storeId: string, orderIds: (number | string)[]): Promise<{
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
