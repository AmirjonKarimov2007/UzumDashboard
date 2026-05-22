import { PrismaService } from '../../common/database/prisma.service';
export interface OrdersQuery {
    storeId: string;
    page?: number;
    size?: number;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
}
export declare class OrdersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getOrders(query: OrdersQuery): Promise<{
        data: ({
            items: ({
                product: {
                    name: string;
                    imageUrl: string | null;
                } | null;
            } & {
                id: string;
                name: string;
                total: import("@prisma/client/runtime/library").Decimal;
                price: import("@prisma/client/runtime/library").Decimal;
                uzumSkuId: string;
                productId: string | null;
                orderId: string;
                quantity: number;
            })[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.OrderStatus;
            storeId: string;
            total: import("@prisma/client/runtime/library").Decimal;
            scheme: import(".prisma/client").$Enums.OrderScheme;
            profit: import("@prisma/client/runtime/library").Decimal;
            customerPhone: string | null;
            customerName: string | null;
            uzumOrderId: string;
            orderNumber: string | null;
            deliveryAddress: string | null;
            deliveryCity: string | null;
            paymentMethod: string | null;
            subtotal: import("@prisma/client/runtime/library").Decimal;
            commission: import("@prisma/client/runtime/library").Decimal;
            deliveryFee: import("@prisma/client/runtime/library").Decimal;
            discount: import("@prisma/client/runtime/library").Decimal;
            trackingNumber: string | null;
            notes: string | null;
            orderedAt: Date | null;
            shippedAt: Date | null;
            deliveredAt: Date | null;
            cancelledAt: Date | null;
        })[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getOrder(storeId: string, orderId: string): Promise<{
        items: ({
            product: {
                name: string;
                price: import("@prisma/client/runtime/library").Decimal;
                imageUrl: string | null;
            } | null;
        } & {
            id: string;
            name: string;
            total: import("@prisma/client/runtime/library").Decimal;
            price: import("@prisma/client/runtime/library").Decimal;
            uzumSkuId: string;
            productId: string | null;
            orderId: string;
            quantity: number;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import(".prisma/client").$Enums.OrderStatus;
        storeId: string;
        total: import("@prisma/client/runtime/library").Decimal;
        scheme: import(".prisma/client").$Enums.OrderScheme;
        profit: import("@prisma/client/runtime/library").Decimal;
        customerPhone: string | null;
        customerName: string | null;
        uzumOrderId: string;
        orderNumber: string | null;
        deliveryAddress: string | null;
        deliveryCity: string | null;
        paymentMethod: string | null;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        commission: import("@prisma/client/runtime/library").Decimal;
        deliveryFee: import("@prisma/client/runtime/library").Decimal;
        discount: import("@prisma/client/runtime/library").Decimal;
        trackingNumber: string | null;
        notes: string | null;
        orderedAt: Date | null;
        shippedAt: Date | null;
        deliveredAt: Date | null;
        cancelledAt: Date | null;
    }>;
    getOrderSummary(storeId: string): Promise<{
        total: number;
        completed: number;
        delivering: number;
        canceled: number;
        returned: number;
        totalRevenue: number;
        totalProfit: number;
        totalCommission: number;
    }>;
    getRecentOrders(storeId: string, limit?: number): Promise<({
        items: {
            name: string;
            price: import("@prisma/client/runtime/library").Decimal;
            quantity: number;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import(".prisma/client").$Enums.OrderStatus;
        storeId: string;
        total: import("@prisma/client/runtime/library").Decimal;
        scheme: import(".prisma/client").$Enums.OrderScheme;
        profit: import("@prisma/client/runtime/library").Decimal;
        customerPhone: string | null;
        customerName: string | null;
        uzumOrderId: string;
        orderNumber: string | null;
        deliveryAddress: string | null;
        deliveryCity: string | null;
        paymentMethod: string | null;
        subtotal: import("@prisma/client/runtime/library").Decimal;
        commission: import("@prisma/client/runtime/library").Decimal;
        deliveryFee: import("@prisma/client/runtime/library").Decimal;
        discount: import("@prisma/client/runtime/library").Decimal;
        trackingNumber: string | null;
        notes: string | null;
        orderedAt: Date | null;
        shippedAt: Date | null;
        deliveredAt: Date | null;
        cancelledAt: Date | null;
    })[]>;
}
