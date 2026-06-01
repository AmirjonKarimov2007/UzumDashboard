import { AnalyticsService } from '../analytics/analytics.service';
import { FinanceSyncService } from './finance-sync.service';
import { PrismaService } from '../../common/database/prisma.service';
export declare class FinanceController {
    private readonly analyticsService;
    private readonly financeSyncService;
    private readonly prisma;
    constructor(analyticsService: AnalyticsService, financeSyncService: FinanceSyncService, prisma: PrismaService);
    getProcessingAndWithdraw(userId: string, storeId: string, force?: string): Promise<any>;
    getLogisticsAndFines(userId: string, storeId: string, force?: string): Promise<any>;
    getReconciliation(userId: string, storeId: string, dateFrom?: string, dateTo?: string): Promise<any>;
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
    getTransactions(storeId: string, page: number, size: number, dateFrom?: string, dateTo?: string): Promise<{
        data: {
            id: string;
            status: import(".prisma/client").$Enums.OrderStatus;
            total: import("@prisma/client/runtime/library").Decimal;
            profit: import("@prisma/client/runtime/library").Decimal;
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
    getCashflow(storeId: string, timeRange?: string): Promise<{
        revenue: number;
        profit: number;
        expenses: number;
        returns: number;
        orders: number;
        chartData: {
            date: string;
            revenue: number;
            profit: number;
            expenses: number;
        }[];
    }>;
    getCommissionAnalysis(storeId: string, timeRange?: string): Promise<{
        baseCommission: number;
        deliveryFee: number;
        paymentFee: number;
        totalCommission: number;
        commissionRate: number;
    }>;
    getRoiAnalysis(storeId: string, timeRange?: string): Promise<{
        roi: number;
        netProfit: number;
        totalInvestment: number;
        margin: number;
        ordersCount: number;
        avgProfitPerOrder: number;
    }>;
    private getCashflowData;
    private getCommissionData;
    private getRoiData;
    private getDateRange;
}
