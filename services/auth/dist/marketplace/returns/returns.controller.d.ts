import { ReturnsService } from './returns.service';
export declare class ReturnsController {
    private readonly returnsService;
    constructor(returnsService: ReturnsService);
    getAnalytics(userId: string, storeId: string, dateFrom?: string, dateTo?: string, product?: string, sku?: string, status?: string, force?: string): Promise<{
        analytics: {
            totalItems: number;
            totalQty: number;
            totalSaleValue: number;
            totalCostUsd: number;
            lostItems: number;
            lostQty: number;
            lostCostUsd: number;
            lostSaleValue: number;
            returnRate: number | null;
            soldQty: number;
            byStatus: Record<string, number>;
            mostReturned: {
                name: string;
                sku: string;
                qty: number;
                saleValue: number;
            }[];
            byMonth: {
                qty: number;
                saleValue: number;
                lost: number;
                month: string;
            }[];
        };
        returns: {
            id: any;
            returnId: any;
            publicId: any;
            uzumOrderId: any;
            productName: any;
            skuTitle: any;
            barcode: any;
            quantity: any;
            costUsd: number | null;
            salePrice: number | null;
            reason: any;
            status: any;
            manualReceived: any;
            orderedAt: number | null;
            returnedAt: number | null;
            receivedAt: number | null;
            daysWaiting: number | null;
        }[];
        lostReport: {
            id: any;
            returnId: any;
            publicId: any;
            uzumOrderId: any;
            productName: any;
            skuTitle: any;
            barcode: any;
            quantity: any;
            costUsd: number | null;
            salePrice: number | null;
            reason: any;
            status: any;
            manualReceived: any;
            orderedAt: number | null;
            returnedAt: number | null;
            receivedAt: number | null;
            daysWaiting: number | null;
        }[];
        lastSyncedAt: number | null;
    }>;
    listInvoices(userId: string, storeId: string, page?: string, size?: string): Promise<{
        invoices: any[];
        page: number;
        size: number;
    }>;
    getInvoice(userId: string, storeId: string, returnId: string): Promise<{
        invoice: any;
    }>;
    sync(userId: string, storeId: string): Promise<{
        ok: boolean;
    }>;
}
