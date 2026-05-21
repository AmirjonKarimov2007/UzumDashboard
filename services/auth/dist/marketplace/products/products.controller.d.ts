import { ProductsService } from './products.service';
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    getProducts(storeId: string, page: number, size: number, search?: string, status?: string, category?: string, sortBy?: string, order?: 'asc' | 'desc'): Promise<{
        data: ({
            inventory: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                status: import(".prisma/client").$Enums.InventoryStatus;
                storeId: string;
                productId: string;
                currentStock: number;
                reservedStock: number;
                minStock: number;
                reorderPoint: number;
                soldLast30Days: number;
                daysUntilStockout: number | null;
                lastRestockedAt: Date | null;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            name: string;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.ProductStatus;
            storeId: string;
            category: string | null;
            revenue: import("@prisma/client/runtime/library").Decimal;
            price: import("@prisma/client/runtime/library").Decimal;
            stock: number;
            soldCount: number;
            profit: import("@prisma/client/runtime/library").Decimal;
            margin: import("@prisma/client/runtime/library").Decimal;
            rating: import("@prisma/client/runtime/library").Decimal | null;
            uzumSkuId: string;
            uzumProductId: string | null;
            purchasePrice: import("@prisma/client/runtime/library").Decimal | null;
            reviewCount: number;
            viewCount: number;
            rank: string | null;
            imageUrl: string | null;
            deletedAt: Date | null;
        })[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getSummary(storeId: string): Promise<{
        total: number;
        active: number;
        lowStock: number;
        outOfStock: number;
        totalRevenue: number;
        totalProfit: number;
        totalSold: number;
    }>;
    getTopProducts(storeId: string, limit: number): Promise<{
        id: string;
        name: string;
        status: import(".prisma/client").$Enums.ProductStatus;
        revenue: import("@prisma/client/runtime/library").Decimal;
        soldCount: number;
        margin: import("@prisma/client/runtime/library").Decimal;
        imageUrl: string | null;
    }[]>;
    getProduct(storeId: string, productId: string): Promise<{
        inventory: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.InventoryStatus;
            storeId: string;
            productId: string;
            currentStock: number;
            reservedStock: number;
            minStock: number;
            reorderPoint: number;
            soldLast30Days: number;
            daysUntilStockout: number | null;
            lastRestockedAt: Date | null;
        } | null;
        metrics: {
            id: string;
            createdAt: Date;
            orders: number;
            revenue: import("@prisma/client/runtime/library").Decimal;
            productId: string;
            date: Date;
            views: number;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        status: import(".prisma/client").$Enums.ProductStatus;
        storeId: string;
        category: string | null;
        revenue: import("@prisma/client/runtime/library").Decimal;
        price: import("@prisma/client/runtime/library").Decimal;
        stock: number;
        soldCount: number;
        profit: import("@prisma/client/runtime/library").Decimal;
        margin: import("@prisma/client/runtime/library").Decimal;
        rating: import("@prisma/client/runtime/library").Decimal | null;
        uzumSkuId: string;
        uzumProductId: string | null;
        purchasePrice: import("@prisma/client/runtime/library").Decimal | null;
        reviewCount: number;
        viewCount: number;
        rank: string | null;
        imageUrl: string | null;
        deletedAt: Date | null;
    }>;
}
