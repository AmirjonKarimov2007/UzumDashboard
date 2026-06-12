import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { TelegramNotifyService } from './telegram-notify.service';

/**
 * Queue-independent "new order" notifier.
 *
 * The BullMQ order-sync worker silently stops the moment Redis is unhealthy —
 * taking notifications down with it. Telegram alerts are the product's most
 * important feature, so they get their own self-contained poller that depends on
 * nothing but Postgres + the Uzum API.
 *
 * Order source: Uzum's **finance orders** (`/v1/finance/orders`) — the same
 * universal ledger the bot's stats use. We deliberately do NOT use `/v2/fbs/orders`
 * here: many sellers (FBO / marketplace-fulfilled) have ZERO FBS orders, yet all
 * their sales show up in finance. Finance is the one endpoint that sees every order.
 *
 * No-storm guarantee: only orders whose date is AFTER process start fire a
 * message, and each orderId is notified at most once (in-memory `seen` set).
 */
@Injectable()
export class TelegramOrderPoller {
  private readonly logger = new Logger(TelegramOrderPoller.name);
  /** storeId → orderIds already handled (notified or skipped) since boot. */
  private readonly seen = new Map<string, Set<string>>();
  /** `${storeId}:${invoiceId}` → reminder tiers (ms-before) already sent. */
  private readonly remindedInvoices = new Map<string, Set<number>>();
  private readonly startedAt = Date.now();
  private running = false;
  private invoiceRunning = false;

  /** Remind this long (ms) before a supply drop-off slot, most→least urgent. */
  private static readonly REMIND_TIERS = [
    3 * 60 * 60 * 1000, // 3 hours
    60 * 60 * 1000, // 1 hour
    30 * 60 * 1000, // 30 minutes
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: StoresService,
    private readonly uzum: UzumApiClient,
    private readonly notify: TelegramNotifyService,
  ) {}

  @Cron('*/2 * * * *')
  async poll() {
    if (this.running) return; // never overlap ticks
    this.running = true;
    try {
      const connected = await this.stores.getConnectedStores();
      for (const { storeId } of connected) {
        await this.pollStore(storeId).catch((e) =>
          this.logger.warn(
            `poll store ${storeId} failed: ${(e as Error).message}`,
          ),
        );
      }
    } catch (e) {
      this.logger.warn(`order poll tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // ─── FBS supply (ta'minlash) deadline reminders ────────────────────────────

  @Cron('*/15 * * * *')
  async pollInvoices() {
    if (this.invoiceRunning) return;
    this.invoiceRunning = true;
    try {
      const connected = await this.stores.getConnectedStores();
      for (const { storeId } of connected) {
        await this.checkStoreInvoices(storeId).catch((e) =>
          this.logger.warn(
            `invoice check ${storeId} failed: ${(e as Error).message}`,
          ),
        );
      }
    } catch (e) {
      this.logger.warn(`invoice poll tick failed: ${(e as Error).message}`);
    } finally {
      this.invoiceRunning = false;
    }
  }

  private async checkStoreInvoices(storeId: string): Promise<void> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { userId: true },
    });
    if (!store) return;

    const tu = await this.prisma.telegramUser.findUnique({
      where: { userId: store.userId },
      select: { isActive: true, notifyOrders: true },
    });
    if (!tu || !tu.isActive || !tu.notifyOrders) return;

    const creds = await this.stores.getStoreCredentials(store.userId, storeId);
    const { invoices } = await this.uzum.getFbsInvoices(storeId, creds.apiKey, [
      'CREATED',
      'ACCEPTANCE_IN_PROGRESS',
    ]);

    const now = Date.now();
    for (const inv of invoices) {
      const statusVal = inv?.status?.value;
      if (statusVal !== 'CREATED' && statusVal !== 'ACCEPTANCE_IN_PROGRESS') {
        continue;
      }
      const timeFrom = Number(inv?.timeSlot?.timeFrom || 0);
      if (!timeFrom) continue;
      const remaining = timeFrom - now;
      if (remaining <= 0) continue; // slot already started/passed

      const key = `${storeId}:${inv.id}`;
      let sent = this.remindedInvoices.get(key);
      if (!sent) {
        sent = new Set();
        this.remindedInvoices.set(key, sent);
      }

      const due = TelegramOrderPoller.REMIND_TIERS.filter(
        (t) => remaining <= t && !sent!.has(t),
      );
      if (!due.length) continue;

      await this.notify.notifyInvoiceDeadline(storeId, {
        invoiceId: inv.id,
        number: inv.number ?? inv.id,
        numberOrders: Number(inv.numberOrders || 0),
        numberAcceptedOrders: Number(inv.numberAcceptedOrders || 0),
        warehouse: inv?.stock?.title || null,
        address: inv?.dropOffPoint?.address || inv?.stock?.address || null,
        timeFrom,
        timeTo: Number(inv?.timeSlot?.timeTo || 0) || null,
        remainingMs: remaining,
      });

      // Mark every tier we've already entered so we don't double-fire.
      for (const t of TelegramOrderPoller.REMIND_TIERS) {
        if (remaining <= t) sent.add(t);
      }
      this.logger.log(
        `Invoice reminder sent: store=${storeId} invoice=${inv.id} remaining=${Math.round(remaining / 60000)}min`,
      );
    }

    if (this.remindedInvoices.size > 5000) this.remindedInvoices.clear();
  }

  private async pollStore(storeId: string): Promise<void> {
    // Only poll stores whose owner has notifications enabled — saves API calls.
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { userId: true },
    });
    if (!store) return;

    const tu = await this.prisma.telegramUser.findUnique({
      where: { userId: store.userId },
      select: { isActive: true, notifyOrders: true },
    });
    if (!tu || !tu.isActive || !tu.notifyOrders) return;

    const creds = await this.stores.getStoreCredentials(store.userId, storeId);

    const now = Date.now();
    const items = await this.uzum.getAllFinanceOrders(
      storeId,
      creds.apiKey,
      [creds.uzumShopId],
      now - 2 * 24 * 60 * 60 * 1000, // last 2 days
      now,
    );

    // Finance returns one row per SKU — aggregate into orders by orderId.
    const orders = this.groupByOrder(items);

    let seen = this.seen.get(storeId);
    if (!seen) {
      seen = new Set();
      this.seen.set(storeId, seen);
    }

    const fresh = orders
      .filter((o) => o.date > this.startedAt && !seen!.has(o.orderId))
      .sort((a, b) => a.date - b.date); // oldest first

    for (const o of fresh) {
      seen.add(o.orderId); // mark handled regardless of outcome
      if (o.cancelled) continue; // don't ping for instantly-cancelled orders
      try {
        await this.notify.notifyNewOrder(storeId, {
          uzumOrderId: o.orderId,
          status: o.status || 'PROCESSING',
          total: o.total,
          profit: o.profit,
          customerName: null,
          customerPhone: null,
          deliveryCity: null,
          orderedAt: new Date(o.date),
          items: o.items,
          imageUrl: o.image || null,
        });
      } catch (e) {
        this.logger.warn(
          `notify order ${o.orderId} failed: ${(e as Error).message}`,
        );
      }
    }

    const notifiedCount = fresh.filter((o) => !o.cancelled).length;
    if (notifiedCount > 0) {
      this.logger.log(
        `Notified ${notifiedCount} new order(s) for store ${storeId}`,
      );
    }

    // Keep the per-store set from growing unbounded over a long-lived process.
    if (seen.size > 20_000) seen.clear();
  }

  private groupByOrder(items: any[]): Array<{
    orderId: string;
    date: number;
    status: string;
    cancelled: boolean;
    total: number;
    profit: number;
    image: string;
    items: Array<{ name: string; quantity: number; price: number }>;
  }> {
    const map = new Map<
      string,
      {
        orderId: string;
        date: number;
        status: string;
        cancelled: boolean;
        total: number;
        profit: number;
        image: string;
        items: Map<string, { quantity: number; price: number }>;
      }
    >();

    for (const it of items) {
      const orderId = it?.orderId != null ? String(it.orderId) : '';
      if (!orderId) continue;
      const date = Number(it.date || it.dateIssued || 0);
      const statusUpper = String(it.status || '').toUpperCase();
      const cancelled =
        it.cancelled === true ||
        statusUpper === 'CANCELED' ||
        statusUpper === 'CANCELLED';

      const o =
        map.get(orderId) ||
        {
          orderId,
          date: 0,
          status: it.status || '',
          cancelled: false,
          total: 0,
          profit: 0,
          image: '',
          items: new Map<string, { quantity: number; price: number }>(),
        };

      if (date > o.date) {
        o.date = date;
        o.status = it.status || o.status;
      }
      if (!o.image) o.image = pickImage(it);
      o.cancelled = o.cancelled || cancelled;
      o.profit += Number(it.sellerProfit || 0);
      const qty = Math.max(1, Number(it.amount || 0));
      const price = Number(it.sellPrice || 0);
      o.total += price * qty;

      const name = it.productTitle || it.skuTitle || 'Mahsulot';
      const line = o.items.get(name) || { quantity: 0, price };
      line.quantity += qty;
      o.items.set(name, line);

      map.set(orderId, o);
    }

    return [...map.values()].map((o) => ({
      orderId: o.orderId,
      date: o.date,
      status: o.status,
      cancelled: o.cancelled,
      total: o.total,
      profit: o.profit,
      image: o.image,
      items: [...o.items.entries()].map(([name, v]) => ({
        name,
        quantity: v.quantity,
        price: v.price,
      })),
    }));
  }
}

/** Finance item product image is an object: { photo: { '240': { high, low } } }. */
function pickImage(it: any): string {
  const photo = it?.productImage?.photo;
  if (!photo) return '';
  const sz = photo['240'] || photo['480'] || photo['120'] || photo['80'] || Object.values(photo)[0];
  return (sz as any)?.high || (sz as any)?.low || '';
}
