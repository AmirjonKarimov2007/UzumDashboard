import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
export interface UzumRateLimitInfo {
    remaining: number;
    replenishRate: number;
    burstCapacity: number;
    limitPerDay: number;
    remainingPerDay: number;
    resetAt: Date | null;
}
export interface UzumPaginatedResponse<T> {
    payload: T[];
    pageNumber: number;
    pageSize: number;
    total: number;
    totalPages: number;
}
export interface UzumShop {
    id: number;
    name: string;
    status: string;
}
export interface UzumProduct {
    skuId: number;
    productId: number;
    name: string;
    categoryTitle: string;
    fullPrice: number;
    sellPrice: number;
    purchasePrice?: number;
    stocks: number;
    ordersAmount: number;
    revenue: number;
    rating: number;
    reviewsAmount: number;
    viewsAmount: number;
    status: string;
    productRank: string;
    imageUrls: string[];
    characteristics?: Record<string, string>;
}
export interface UzumOrder {
    id: number;
    publicId?: string;
    scheme: string;
    status: string;
    dateCreated: number;
    acceptedDate?: number | null;
    deliveryDate?: number | null;
    completedDate?: number | null;
    dateCancelled?: number | null;
    returnDate?: number | null;
    price: number;
    shopId?: number;
    stock?: {
        id?: number;
        title?: string;
        address?: string;
    };
    orderItems: UzumOrderItem[];
    deliveryInfo?: {
        customerFullname?: string;
        customerPhone?: string;
        deliveryAddress?: string;
        deliveryComment?: string;
        city?: string;
    } | null;
}
export interface UzumOrderItem {
    id: number;
    barcode?: number | string;
    skuTitle?: string;
    title?: string;
    price: number;
    amount: number;
    productId?: number;
}
export interface UzumFinanceOrder {
    orderId: number;
    orderDate: string;
    status: string;
    amount: number;
    commission: number;
    transfer: number;
    shopId: number;
    items: {
        skuId: number;
        skuTitle: string;
        qty: number;
        price: number;
        commission: number;
    }[];
}
export interface UzumExpense {
    id: number;
    type: string;
    description: string;
    amount: number;
    date: string;
    shopId: number;
}
export interface UzumStock {
    skuId: number;
    stocks: number;
    reserved: number;
}
export declare class UzumApiClient {
    private readonly config;
    private readonly prisma;
    private readonly logger;
    private readonly baseUrl;
    private readonly maxRetries;
    private readonly retryDelay;
    constructor(config: ConfigService, prisma: PrismaService);
    private buildClient;
    private extractRateLimitInfo;
    private persistRateLimitInfo;
    private logApiCall;
    private executeWithRetry;
    getShops(storeId: string, apiKey: string): Promise<UzumShop[]>;
    getProducts(storeId: string, apiKey: string, shopId: string | number, params?: {
        page?: number;
        size?: number;
        filter?: string;
        sortBy?: string;
        order?: string;
        searchQuery?: string;
    }): Promise<{
        products: any[];
        total: number;
    }>;
    getAllProducts(storeId: string, apiKey: string, shopId: string | number): Promise<any[]>;
    private toEpochSeconds;
    getOrders(storeId: string, apiKey: string, shopIds: string[], params?: {
        page?: number;
        size?: number;
        status?: string;
        scheme?: string;
        dateFrom?: number | string;
        dateTo?: number | string;
    }): Promise<{
        orders: UzumOrder[];
        totalAmount?: number;
    }>;
    getAllOrders(storeId: string, apiKey: string, shopIds: string[], dateFrom?: number | string, dateTo?: number | string): Promise<UzumOrder[]>;
    getOrderById(storeId: string, apiKey: string, orderId: string): Promise<UzumOrder>;
    getFinanceOrders(storeId: string, apiKey: string, shopIds: (string | number)[], params?: {
        page?: number;
        size?: number;
        dateFrom?: number;
        dateTo?: number;
        statuses?: string[];
        group?: boolean;
    }): Promise<{
        orderItems: any[];
        total: number;
    }>;
    getAllFinanceOrders(storeId: string, apiKey: string, shopIds: (string | number)[], dateFrom?: number, dateTo?: number): Promise<any[]>;
    getRawExpenses(storeId: string, apiKey: string, shopId: string | number, page?: number, size?: number): Promise<{
        payments: any[];
        totalElements: number;
    }>;
    getExpenses(storeId: string, apiKey: string, shopIds: (string | number)[], params?: {
        page?: number;
        size?: number;
        dateFrom?: number;
        dateTo?: number;
        sources?: string[];
    }): Promise<{
        payments: any[];
        totalElements: number;
    }>;
    getAllExpenses(storeId: string, apiKey: string, shopIds: (string | number)[], dateFrom?: number, dateTo?: number): Promise<any[]>;
    getStocks(storeId: string, apiKey: string, _shopId?: string, _page?: number, _size?: number): Promise<{
        skuAmountList: any[];
    }>;
    getAllStocks(storeId: string, apiKey: string, shopId?: string): Promise<any[]>;
    setStocks(storeId: string, apiKey: string, items: Array<{
        skuId: number;
        barcode: string;
        amount: number;
        fbsLinked: boolean;
        fbsAllowed: boolean;
        dbsLinked: boolean;
        dbsAllowed: boolean;
    }>): Promise<{
        totalRecords: number;
        updatedRecords: number;
    }>;
    getFbsOrders(storeId: string, apiKey: string, shopId: string | number, status?: string, page?: number, size?: number, extra?: {
        scheme?: 'FBS' | 'DBS';
        dateFrom?: number;
        dateTo?: number;
    }): Promise<{
        orders: any[];
        totalAmount?: number;
    }>;
    getAllFbsOrders(storeId: string, apiKey: string, shopId: string | number, statuses?: string[], dateFrom?: number, dateTo?: number): Promise<any[]>;
    getFbsOrderCount(storeId: string, apiKey: string, shopId: string | number, status: string, dateFrom?: number, dateTo?: number): Promise<number | null>;
    confirmFbsOrder(storeId: string, apiKey: string, orderId: number | string): Promise<{
        ok: boolean;
        order?: any;
        error?: string;
    }>;
    getFbsInvoices(storeId: string, apiKey: string, statuses?: string[], page?: number, size?: number): Promise<{
        invoices: any[];
    }>;
    getFbsInvoiceById(storeId: string, apiKey: string, invoiceId: number | string): Promise<any | null>;
    getFbsInvoiceOrders(storeId: string, apiKey: string, invoiceId: number | string): Promise<any[]>;
    getFbsLabelPdf(storeId: string, apiKey: string, orderId: number | string, size?: 'LARGE' | 'SMALL'): Promise<string | null>;
    getFbsLabelPdfFast(storeId: string, apiKey: string, orderId: number | string, size?: 'LARGE' | 'SMALL'): Promise<string | null>;
    private postAction;
    cancelFbsOrder(storeId: string, apiKey: string, orderId: number | string, reason: string, comment?: string): Promise<{
        ok: boolean;
        error?: string;
        code?: string;
    }>;
    setFbsOrderIdentifiers(storeId: string, apiKey: string, orderId: number | string, items: Array<{
        orderItemId: number;
        values: string[];
    }>): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
    }>;
    getFbsReturnReasons(storeId: string, apiKey: string): Promise<any[]>;
    dbsOrderDelivering(storeId: string, apiKey: string, orderId: number | string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    dbsOrderCompleted(storeId: string, apiKey: string, orderId: number | string, issueCode?: number): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    dbsOrderRefund(storeId: string, apiKey: string, orderId: number | string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    sendPriceData(storeId: string, apiKey: string, shopId: string | number, productId: number, skuList: Array<{
        skuId: number;
        fullPrice?: number;
        sellPrice?: number;
        skuTitle?: string;
    }>): Promise<{
        ok: boolean;
        error?: string;
        code?: string;
    }>;
    getFbsInvoiceActPdf(storeId: string, apiKey: string, invoiceId: number | string): Promise<string | null>;
    getFbsInvoiceClosingDocsPdf(storeId: string, apiKey: string, invoiceId: number | string): Promise<string | null>;
    createFbsInvoice(storeId: string, apiKey: string, body: {
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
    cancelFbsInvoice(storeId: string, apiKey: string, invoiceId: number | string): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    updateFbsInvoiceContent(storeId: string, apiKey: string, invoiceId: number | string, body: {
        sellerId: number;
        customerOrderId: number;
        idempotencyKey?: string;
    }): Promise<{
        ok: boolean;
        payload?: any;
        error?: string;
        code?: string;
    }>;
    getFbsInvoiceDropOffPoints(storeId: string, apiKey: string, customerOrderIds: (number | string)[]): Promise<any[]>;
    getFbsInvoiceTimeSlots(storeId: string, apiKey: string, dopId: string, sellerOrderIds: (number | string)[]): Promise<any[]>;
    updateFbsInvoiceDropOff(storeId: string, apiKey: string, body: {
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
    getSellerReturns(storeId: string, apiKey: string, shopId: string | number, params?: {
        page?: number;
        size?: number;
    }): Promise<any[]>;
    getSellerReturnById(storeId: string, apiKey: string, shopId: string | number, returnId: number | string): Promise<any | null>;
    getSellerInvoices(storeId: string, apiKey: string, params?: {
        page?: number;
        size?: number;
    }): Promise<any[]>;
    getStocksV3(storeId: string, apiKey: string, page?: number, size?: number): Promise<{
        skuAmountList: any[];
    }>;
    validateConnection(storeId: string, apiKey: string): Promise<{
        valid: boolean;
        shops: UzumShop[];
    }>;
    private sleep;
}
