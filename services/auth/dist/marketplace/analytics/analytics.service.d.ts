import { PrismaService } from '../../common/database/prisma.service';
export declare class AnalyticsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getDashboardMetrics(storeId: string, timeRange?: string): Promise<{
        revenue: {
            value: number;
            change: number;
            sparkline: number[];
        };
        orders: {
            value: number;
            change: number;
            sparkline: number[];
        };
        profit: {
            value: number;
            change: number;
            sparkline: number[];
        };
        margin: {
            value: number;
            change: number;
            sparkline: never[];
        };
    }>;
    getRevenueChart(storeId: string, timeRange?: string): Promise<{
        name: string;
        revenue: number;
        profit: number;
        orders: number;
    }[]>;
    getCategoryBreakdown(storeId: string): Promise<{
        name: string;
        value: number;
        count: number;
        percentage: number;
    }[]>;
    getFinanceSummary(storeId: string, timeRange?: string): Promise<{
        revenue: number;
        commission: number;
        expenses: number;
        returnLoss: number;
        profit: number;
        margin: number;
        netRevenue: number;
        roi: number;
    }>;
    getExpenseBreakdown(storeId: string, timeRange?: string): Promise<(import(".prisma/client").Prisma.PickEnumerable<import(".prisma/client").Prisma.ExpenseGroupByOutputType, "category"[]> & {
        _count: {
            id: number;
        };
        _sum: {
            amount: import("@prisma/client/runtime/library").Decimal | null;
        };
    })[]>;
    getTransactions(storeId: string, page?: number, size?: number, dateFrom?: string, dateTo?: string): Promise<{
        data: {
            id: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            profit: import("@prisma/client/runtime/library").Decimal;
            total: import("@prisma/client/runtime/library").Decimal;
            uzumOrderId: string;
            commission: import("@prisma/client/runtime/library").Decimal;
            orderedAt: Date | null;
            items: {
                name: string;
            }[];
        }[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    private getMetricsForPeriod;
    private getSparkline;
    private getDateRange;
}
