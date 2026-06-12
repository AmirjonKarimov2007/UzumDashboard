import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/database/prisma.service';
import { FinanceSyncService } from '../finance/finance-sync.service';
export type StatsRange = 'today' | 'week' | 'month';
export interface ExpenseCategoryDef {
    key: string;
    label: string;
    emoji: string;
}
export declare const EXPENSE_CATEGORIES: ExpenseCategoryDef[];
export declare function categoryDef(key: string): ExpenseCategoryDef;
export declare class TelegramStatsService {
    private readonly prisma;
    private readonly finance;
    private readonly config;
    private readonly logger;
    private readonly fallbackRate;
    constructor(prisma: PrismaService, finance: FinanceSyncService, config: ConfigService);
    private getUsdRate;
    formatProfitCard(userId: string, range: StatsRange): Promise<string>;
    formatStoresList(userId: string): Promise<string>;
    getStoresForUser(userId: string): Promise<Array<{
        id: string;
        name: string;
    }>>;
    userOwnsStore(userId: string, storeId: string): Promise<boolean>;
    addExpense(input: {
        storeId: string;
        category: string;
        amount: number;
        description: string;
    }): Promise<{
        id: string;
    }>;
    deleteExpense(userId: string, expenseId: string): Promise<boolean>;
    formatExpensesList(userId: string, page: number, pageSize?: number): Promise<{
        text: string;
        items: Array<{
            id: string;
            label: string;
        }>;
        page: number;
        totalPages: number;
    }>;
    private getUserStoreIds;
    private fmtRange;
}
