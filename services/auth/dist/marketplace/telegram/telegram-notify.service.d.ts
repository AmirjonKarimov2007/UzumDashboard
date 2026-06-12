import { PrismaService } from '../../common/database/prisma.service';
import { TelegramBotService } from './telegram-bot.service';
export interface NewOrderPayload {
    uzumOrderId: string;
    scheme?: 'FBS' | 'DBS';
    status: string;
    total: number;
    profit: number;
    customerName?: string | null;
    customerPhone?: string | null;
    deliveryCity?: string | null;
    orderedAt?: Date | null;
    items: Array<{
        name: string;
        quantity: number;
        price: number;
    }>;
    imageUrl?: string | null;
}
export interface InvoiceDeadlinePayload {
    invoiceId: string | number;
    number: string | number;
    numberOrders: number;
    numberAcceptedOrders?: number;
    warehouse?: string | null;
    address?: string | null;
    timeFrom: number;
    timeTo?: number | null;
    remainingMs: number;
}
export declare class TelegramNotifyService {
    private readonly prisma;
    private readonly botService;
    private readonly logger;
    constructor(prisma: PrismaService, botService: TelegramBotService);
    notifyNewOrder(storeId: string, order: NewOrderPayload): Promise<void>;
    notifyInvoiceDeadline(storeId: string, inv: InvoiceDeadlinePayload): Promise<void>;
    private formatInvoiceDeadline;
    private formatNewOrder;
}
