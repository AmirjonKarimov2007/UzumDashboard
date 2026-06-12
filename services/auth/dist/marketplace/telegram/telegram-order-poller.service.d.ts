import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { TelegramNotifyService } from './telegram-notify.service';
export declare class TelegramOrderPoller {
    private readonly prisma;
    private readonly stores;
    private readonly uzum;
    private readonly notify;
    private readonly logger;
    private readonly seen;
    private readonly remindedInvoices;
    private readonly startedAt;
    private running;
    private invoiceRunning;
    private static readonly REMIND_TIERS;
    constructor(prisma: PrismaService, stores: StoresService, uzum: UzumApiClient, notify: TelegramNotifyService);
    poll(): Promise<void>;
    pollInvoices(): Promise<void>;
    private checkStoreInvoices;
    private pollStore;
    private groupByOrder;
}
