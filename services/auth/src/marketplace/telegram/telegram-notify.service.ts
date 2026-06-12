import { Injectable, Logger } from '@nestjs/common';
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
  items: Array<{ name: string; quantity: number; price: number }>;
  imageUrl?: string | null;
}

export interface InvoiceDeadlinePayload {
  invoiceId: string | number;
  number: string | number;
  numberOrders: number;
  numberAcceptedOrders?: number;
  warehouse?: string | null; // stock.title
  address?: string | null; // dropOffPoint.address || stock.address
  timeFrom: number; // ms
  timeTo?: number | null; // ms
  remainingMs: number;
}

@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: TelegramBotService,
  ) {}

  async notifyNewOrder(storeId: string, order: NewOrderPayload): Promise<void> {
    const bot = this.botService.getBot();
    if (!bot) return;

    // The store's owner — that's who gets the notification.
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, userId: true },
    });
    if (!store) return;

    const tu = await this.prisma.telegramUser.findUnique({
      where: { userId: store.userId },
    });
    if (!tu || !tu.isActive || !tu.notifyOrders) return;

    const text = this.formatNewOrder(store.name, order);

    // Inline "Tasdiqlash" (Confirm) button → bot confirms the order via Uzum API.
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '✅ Tasdiqlash',
            callback_data: `cfm:${storeId}:${order.uzumOrderId}`,
          },
        ],
      ],
    };

    try {
      // Telegram photo captions are limited to 1024 chars — fall back to a text
      // message if the order summary is longer, or if there's no image.
      if (order.imageUrl && text.length <= 1024) {
        try {
          await bot.telegram.sendPhoto(tu.chatId, order.imageUrl, {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup,
          } as any);
        } catch (photoErr: any) {
          this.logger.warn(
            `sendPhoto failed (${photoErr?.message}); falling back to text`,
          );
          await bot.telegram.sendMessage(tu.chatId, text, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            reply_markup: replyMarkup,
          } as any);
        }
      } else {
        await bot.telegram.sendMessage(tu.chatId, text, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: replyMarkup,
        } as any);
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (
        msg.includes('403') ||
        msg.includes('blocked') ||
        msg.includes('chat not found') ||
        msg.includes('user is deactivated')
      ) {
        await this.prisma.telegramUser
          .update({ where: { id: tu.id }, data: { isActive: false } })
          .catch(() => undefined);
        this.logger.warn(
          `Deactivated telegram user ${tu.id} (chat ${tu.chatId}): ${msg}`,
        );
      } else {
        this.logger.error(
          `Failed to notify chat ${tu.chatId} for store ${storeId}: ${msg}`,
        );
      }
    }
  }

  /** Remind the seller that an FBS supply (ta'minlash) drop-off window is near. */
  async notifyInvoiceDeadline(
    storeId: string,
    inv: InvoiceDeadlinePayload,
  ): Promise<void> {
    const bot = this.botService.getBot();
    if (!bot) return;

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, userId: true },
    });
    if (!store) return;

    const tu = await this.prisma.telegramUser.findUnique({
      where: { userId: store.userId },
    });
    if (!tu || !tu.isActive || !tu.notifyOrders) return;

    const text = this.formatInvoiceDeadline(store.name, inv);

    try {
      await bot.telegram.sendMessage(tu.chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      } as any);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (
        msg.includes('403') ||
        msg.includes('blocked') ||
        msg.includes('chat not found') ||
        msg.includes('user is deactivated')
      ) {
        await this.prisma.telegramUser
          .update({ where: { id: tu.id }, data: { isActive: false } })
          .catch(() => undefined);
        this.logger.warn(`Deactivated telegram user ${tu.id}: ${msg}`);
      } else {
        this.logger.error(
          `Failed to send invoice reminder to ${tu.chatId}: ${msg}`,
        );
      }
    }
  }

  private formatInvoiceDeadline(
    storeName: string,
    inv: InvoiceDeadlinePayload,
  ): string {
    const lines: string[] = [];
    lines.push("⏰ <b>Ta'minlash muddati yaqinlashmoqda!</b>");
    lines.push(`🏪 <b>Do'kon:</b> ${escapeHtml(storeName)}`);
    lines.push(`🧾 <b>Ta'minlash:</b> #${escapeHtml(String(inv.number))}`);
    lines.push(`📦 <b>Buyurtmalar:</b> ${inv.numberOrders} ta`);
    if (inv.warehouse) {
      lines.push(`🏬 <b>Ombor:</b> ${escapeHtml(inv.warehouse)}`);
    }
    if (inv.address) {
      lines.push(`📍 <b>Topshirish joyi:</b> ${escapeHtml(inv.address)}`);
    }
    lines.push(`🕒 <b>Vaqt:</b> ${fmtSlot(inv.timeFrom, inv.timeTo)}`);
    lines.push(`⏳ <b>Qoldi:</b> ${humanizeRemaining(inv.remainingMs)}`);
    return lines.join('\n');
  }

  private formatNewOrder(storeName: string, o: NewOrderPayload): string {
    const lines: string[] = [];
    lines.push(`🛒 <b>Yangi buyurtma!</b>`);
    lines.push(`🏪 <b>Do'kon:</b> ${escapeHtml(storeName)}`);
    lines.push(`#️⃣ <b>Order ID:</b> <code>${escapeHtml(o.uzumOrderId)}</code>`);
    if (o.scheme) lines.push(`📦 <b>Sxema:</b> ${o.scheme}`);
    lines.push(`📌 <b>Status:</b> ${escapeHtml(o.status)}`);
    lines.push(`💰 <b>Summa:</b> ${money(Number(o.total) || 0)}`);
    if (o.profit) {
      lines.push(`💚 <b>Foyda:</b> ${money(Number(o.profit) || 0)}`);
    }
    if (o.customerName) {
      lines.push(`👤 <b>Mijoz:</b> ${escapeHtml(o.customerName)}`);
    }
    if (o.customerPhone) {
      lines.push(`📞 <b>Tel:</b> ${escapeHtml(o.customerPhone)}`);
    }
    if (o.deliveryCity) {
      lines.push(`📍 <b>Shahar:</b> ${escapeHtml(o.deliveryCity)}`);
    }
    if (o.orderedAt) {
      lines.push(`🕒 <b>Vaqt:</b> ${new Date(o.orderedAt).toLocaleString('uz-UZ')}`);
    }

    if (o.items?.length) {
      lines.push('');
      lines.push('<b>Tovarlar:</b>');
      for (const it of o.items.slice(0, 10)) {
        lines.push(
          `• ${escapeHtml(it.name)} × ${it.quantity} — ${money(Number(it.price) || 0)}`,
        );
      }
      if (o.items.length > 10) {
        lines.push(`… va yana ${o.items.length - 10} ta`);
      }
    }

    return lines.join('\n');
  }
}

function money(n: number): string {
  return n.toLocaleString('uz-UZ', { maximumFractionDigits: 0 }) + ' so\'m';
}

/** "2 soat 15 daqiqa" / "45 daqiqa" from a remaining-ms value. */
function humanizeRemaining(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} soat ${m} daqiqa`;
  if (h > 0) return `${h} soat`;
  return `${m} daqiqa`;
}

/** "12.06 14:30–15:30" from two ms timestamps (timeTo optional). */
function fmtSlot(fromMs: number, toMs?: number | null): string {
  const dt = (ms: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(ms).toLocaleString('uz-UZ', opts);
  const day = dt(fromMs, { day: '2-digit', month: '2-digit' });
  const from = dt(fromMs, { hour: '2-digit', minute: '2-digit' });
  if (!toMs) return `${day} ${from}`;
  const to = dt(toMs, { hour: '2-digit', minute: '2-digit' });
  return `${day} ${from}–${to}`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
