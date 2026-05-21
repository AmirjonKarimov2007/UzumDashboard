import { PrismaService } from '../../common/database/prisma.service';
export declare class InventoryService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getInventory(storeId: string, page?: number, size?: number, status?: string, search?: string): Promise<{
        data: {
            totalValue: number;
            unitCost: number;
            product: {
                id: string;
                name: string;
                status: import(".prisma/client").$Enums.ProductStatus;
                category: string | null;
                price: import("@prisma/client/runtime/library").Decimal;
                uzumSkuId: string;
                imageUrl: string | null;
            };
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
        }[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getInventorySummary(storeId: string): Promise<{
        inStock: number;
        lowStock: number;
        outOfStock: number;
        overstock: number;
        totalValue: number;
    }>;
}
