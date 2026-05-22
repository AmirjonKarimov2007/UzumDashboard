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
    orderId: number;
    deliverySchema: string;
    status: string;
    orderDate: string;
    orderItems: UzumOrderItem[];
    deliveryInfo?: {
        customerFullName?: string;
        customerPhone?: string;
        deliveryAddress?: string;
        city?: string;
    };
    financialInfo?: {
        totalAmount: number;
        commission: number;
        deliveryPrice: number;
        discount: number;
    };
}
export interface UzumOrderItem {
    skuId: number;
    skuTitle: string;
    qty: number;
    price: number;
    totalPrice: number;
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
    getOrders(storeId: string, apiKey: string, shopIds: string[], params?: {
        page?: number;
        size?: number;
        status?: string;
        scheme?: string;
        dateFrom?: string;
        dateTo?: string;
    }): Promise<UzumPaginatedResponse<UzumOrder>>;
    getAllOrders(storeId: string, apiKey: string, shopIds: string[], dateFrom?: string, dateTo?: string): Promise<UzumOrder[]>;
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
    getExpenses(storeId: string, apiKey: string, shopIds: (string | number)[], params?: {
        page?: number;
        size?: number;
        dateFrom?: number;
        dateTo?: number;
        sources?: string[];
    }): Promise<{
        payments: any[];
    }>;
    getAllExpenses(storeId: string, apiKey: string, shopIds: (string | number)[], dateFrom?: number, dateTo?: number): Promise<any[]>;
    getStocks(storeId: string, apiKey: string, _shopId?: string, _page?: number, _size?: number): Promise<{
        skuAmountList: any[];
    }>;
    getAllStocks(storeId: string, apiKey: string, shopId?: string): Promise<any[]>;
    getFbsOrders(storeId: string, apiKey: string, shopId: string | number, status?: string, page?: number, size?: number): Promise<{
        orders: any[];
    }>;
    getAllFbsOrders(storeId: string, apiKey: string, shopId: string | number, statuses?: string[]): Promise<any[]>;
    getFbsLabelPdf(storeId: string, apiKey: string, orderId: number | string, size?: 'LARGE' | 'SMALL'): Promise<string | null>;
    validateConnection(storeId: string, apiKey: string): Promise<{
        valid: boolean;
        shops: UzumShop[];
    }>;
    private sleep;
}
