import { OrdersService } from './orders.service';
export declare class OrdersController {
    private readonly ordersService;
    constructor(ordersService: OrdersService);
    getOrders(storeId: string, page: number, size: number, search?: string, status?: string, dateFrom?: string, dateTo?: string): Promise<{
        data: ({
            items: ({
                product: {
                    name: string;
                    imageUrl: string | null;
                } | null;
            } & {
                id: string;
                name: string;
                price: import("@prisma/client/runtime/library").Decimal;
                uzumSkuId: string;
                productId: string | null;
                total: import("@prisma/client/runtime/library").Decimal;
                orderId: string;
                quantity: number;
            })[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.OrderStatus;
            storeId: string;
            scheme: import(".prisma/client").$Enums.OrderScheme;
            profit: import("@prisma/client/runtime/library").Decimal;
            total: import("@prisma/client/runtime/library").Decimal;
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
    getSummary(storeId: string): Promise<{
        total: number;
        completed: number;
        delivering: number;
        canceled: number;
        returned: number;
        totalRevenue: number;
        totalProfit: number;
        totalCommission: number;
    }>;
    getRecent(storeId: string, limit: number): Promise<({
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
        scheme: import(".prisma/client").$Enums.OrderScheme;
        profit: import("@prisma/client/runtime/library").Decimal;
        total: import("@prisma/client/runtime/library").Decimal;
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
            price: import("@prisma/client/runtime/library").Decimal;
            uzumSkuId: string;
            productId: string | null;
            total: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
            quantity: number;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        status: import(".prisma/client").$Enums.OrderStatus;
        storeId: string;
        scheme: import(".prisma/client").$Enums.OrderScheme;
        profit: import("@prisma/client/runtime/library").Decimal;
        total: import("@prisma/client/runtime/library").Decimal;
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
}
