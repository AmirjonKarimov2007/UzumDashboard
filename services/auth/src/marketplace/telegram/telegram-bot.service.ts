import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import {
  TelegramStatsService,
  StatsRange,
  EXPENSE_CATEGORIES,
  categoryDef,
} from './telegram-stats.service';

/**
 * Multi-step expense entry is held in memory per chat. It is intentionally
 * ephemeral: a restart simply drops half-finished drafts, which is fine.
 */
interface ExpenseDraft {
  step: 'amount' | 'description';
  storeId: string;
  storeName: string;
  category: string;
  amount?: number;
  updatedAt: number;
}

const DRAFT_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class TelegramBotService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf | null = null;
  private botUsername: string | null = null;
  private readonly drafts = new Map<string, ExpenseDraft>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly stats: TelegramStatsService,
    private readonly uzum: UzumApiClient,
    private readonly stores: StoresService,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
      return;
    }

    this.bot = new Telegraf(token);
    this.registerHandlers();

    try {
      const me = await this.bot.telegram.getMe();
      this.botUsername = me.username || null;
      this.logger.log(`Telegram bot @${me.username} authorized (id=${me.id})`);
    } catch (e) {
      this.logger.error(
        `Failed to authorize Telegram bot: ${(e as Error).message}`,
      );
      this.bot = null;
      return;
    }

    this.bot
      .launch({ dropPendingUpdates: true })
      .catch((e) => this.logger.error(`Bot polling error: ${e?.message || e}`));
    this.logger.log('Telegram bot polling started');

    await this.notifyAdminStartup();
  }

  onApplicationShutdown() {
    if (this.bot) {
      try {
        this.bot.stop('SIGTERM');
      } catch (e) {
        this.logger.warn(`Bot stop failed: ${(e as Error).message}`);
      }
    }
  }

  getBot(): Telegraf | null {
    return this.bot;
  }

  getBotUsername(): string | null {
    return this.botUsername;
  }

  // ─── Admin startup ping ───────────────────────────────────────────────────

  private async notifyAdminStartup() {
    const adminId = this.config.get<string>('TELEGRAM_ADMIN_ID');
    if (!adminId || !this.bot) return;
    try {
      await this.bot.telegram.sendMessage(
        adminId,
        `🤖 <b>Uzum Dashboard bot ishga tushdi</b>\n` +
          `🔗 @${this.botUsername || ''}\n` +
          `🕒 ${new Date().toLocaleString('uz-UZ')}`,
        { parse_mode: 'HTML' },
      );
      this.logger.log(`Startup notice sent to admin chat ${adminId}`);
    } catch (e) {
      this.logger.warn(
        `Failed to notify admin ${adminId}: ${(e as Error).message}`,
      );
    }
  }

  // ─── Handler registration ─────────────────────────────────────────────────

  private registerHandlers() {
    if (!this.bot) return;

    this.bot.use(async (ctx, next) => {
      const text = (ctx.message as any)?.text;
      const cb = (ctx.callbackQuery as any)?.data;
      if (text || cb) {
        this.logger.log(
          `IN chat=${ctx.chat?.id} ${cb ? `cb=${JSON.stringify(cb)}` : `text=${JSON.stringify(text)}`}`,
        );
      }
      try {
        await next();
      } catch (e) {
        this.logger.error(
          `Handler threw for chat=${ctx.chat?.id}: ${(e as Error).message}`,
          (e as Error).stack,
        );
        try {
          await ctx.reply(
            '⚠️ Texnik xato yuz berdi. Birozdan keyin urinib ko\'ring.',
          );
        } catch {
          // ignore
        }
      }
    });

    this.bot.catch((e, ctx) => {
      this.logger.error(
        `Uncaught bot error chat=${ctx.chat?.id}: ${(e as Error).message}`,
        (e as Error).stack,
      );
    });

    // Commands
    this.bot.start(async (ctx) => this.handleStart(ctx));
    this.bot.command('menu', async (ctx) =>
      this.requireAuth(ctx, () => this.showHome(ctx, false)),
    );
    this.bot.command('logout', async (ctx) => this.handleLogout(ctx));
    this.bot.command('help', async (ctx) => this.sendHelp(ctx));

    // Phone login
    this.bot.on(message('contact'), async (ctx) => this.handleContact(ctx));

    // Inline-keyboard callbacks
    this.bot.on('callback_query', async (ctx) => this.handleCallback(ctx));

    // Free text — only meaningful while an expense draft is awaiting input.
    this.bot.on(message('text'), async (ctx) => this.handleText(ctx));
  }

  // ─── /start ───────────────────────────────────────────────────────────────

  private async handleStart(ctx: Context) {
    const tu = await this.findTelegramUser(ctx);
    if (tu) {
      await this.showHome(ctx, false);
      return;
    }
    await this.askPhone(ctx);
  }

  private async askPhone(ctx: Context) {
    await ctx.reply(
      '👋 <b>Uzum Dashboard botiga xush kelibsiz!</b>\n\n' +
        'Kabinetingizga kirish uchun pastdagi tugma orqali telefon raqamingizni yuboring.\n\n' +
        '<i>Eslatma: telefon raqamingiz saytdan ro\'yxatdan o\'tgan raqam bilan bir xil bo\'lishi kerak.</i>',
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([
          [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
        ])
          .resize()
          .oneTime(),
      } as any,
    );
  }

  // ─── Contact / phone login ────────────────────────────────────────────────

  private async handleContact(ctx: Context) {
    const contact = (ctx.message as any)?.contact;
    if (!contact) return;

    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply(
        '⚠️ Iltimos, faqat o\'zingizning telefon raqamingizni yuboring.',
      );
      return;
    }

    const phone = this.normalizePhone(String(contact.phone_number || ''));
    const user = await this.findUserByPhone(phone);

    if (!user) {
      await ctx.reply(
        `❌ <b>${escapeHtml(phone)}</b> raqami tizimda topilmadi.\n\n` +
          'Avval saytdan ro\'yxatdan o\'ting, keyin shu botga qayta kiring.',
        {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: { remove_keyboard: true },
        } as any,
      );
      return;
    }

    const chatId = String(ctx.chat?.id);
    const isNew = !(await this.prisma.telegramUser.findUnique({
      where: { userId: user.id },
    }));

    await this.prisma.telegramUser.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        chatId,
        phone: user.phone,
        username: ctx.from?.username || null,
        firstName: ctx.from?.first_name || null,
        lastName: ctx.from?.last_name || null,
      },
      update: {
        chatId,
        phone: user.phone,
        username: ctx.from?.username || null,
        firstName: ctx.from?.first_name || null,
        lastName: ctx.from?.last_name || null,
        isActive: true,
      },
    });

    const greeting = isNew
      ? `✅ <b>Xush kelibsiz${user.name ? ', ' + escapeHtml(user.name) : ''}!</b>`
      : `✅ <b>Qaytib kelganingizdan xursandmiz${user.name ? ', ' + escapeHtml(user.name) : ''}!</b>`;

    // Drop the contact-request reply keyboard, then show the inline home card.
    await ctx.reply(greeting, {
      parse_mode: 'HTML',
      reply_markup: { remove_keyboard: true },
    } as any);
    await this.showHome(ctx, false);

    if (isNew) {
      await this.notifyAdminNewLink(user, ctx);
    }
  }

  private async notifyAdminNewLink(
    user: { id: string; phone: string; name: string | null },
    ctx: Context,
  ) {
    const adminId = this.config.get<string>('TELEGRAM_ADMIN_ID');
    if (!adminId || !this.bot) return;
    try {
      await this.bot.telegram.sendMessage(
        adminId,
        `🆕 <b>Yangi foydalanuvchi botga kirdi</b>\n` +
          `👤 ${escapeHtml(user.name || '—')}\n` +
          `📞 ${escapeHtml(user.phone)}\n` +
          (ctx.from?.username ? `🔗 @${ctx.from.username}\n` : '') +
          `🕒 ${new Date().toLocaleString('uz-UZ')}`,
        { parse_mode: 'HTML' },
      );
    } catch {
      // ignore admin-notify failures
    }
  }

  // ─── Inline navigation ─────────────────────────────────────────────────────

  private async handleCallback(ctx: Context) {
    const data = (ctx.callbackQuery as any)?.data as string | undefined;
    if (!data) return;

    const tu = await this.findTelegramUser(ctx);
    if (!tu) {
      await this.ack(ctx);
      await this.askPhone(ctx);
      return;
    }

    const [head, ...rest] = data.split(':');

    try {
      switch (head) {
        case 'home':
          await this.ack(ctx);
          await this.showHome(ctx, true);
          break;
        case 'stats':
          await this.ack(ctx, '⏳ Hisoblanmoqda…');
          await this.showStats(ctx, tu.userId, rest[0] as StatsRange);
          break;
        case 'fin':
          await this.ack(ctx);
          await this.showExpenses(ctx, tu.userId, Number(rest[1] || 0));
          break;
        case 'stores':
          await this.ack(ctx);
          await this.showStores(ctx, tu.userId);
          break;
        case 'notify':
          await this.ack(
            ctx,
            tu.notifyOrders
              ? '🔕 Bildirishnomalar o\'chirildi'
              : '🔔 Bildirishnomalar yoqildi',
          );
          await this.toggleNotify(ctx, tu.id, tu.notifyOrders);
          break;
        case 'help':
          await this.ack(ctx);
          await this.sendHelp(ctx, true);
          break;
        case 'exp':
          await this.handleExpenseCallback(ctx, tu.userId, rest);
          break;
        case 'cfm':
          await this.handleConfirmOrder(ctx, tu.userId, rest[0], rest[1]);
          break;
        default:
          await this.ack(ctx);
      }
    } catch (e) {
      this.logger.error(
        `callback ${data} failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
      await this.ack(ctx, '⚠️ Xato');
    }
  }

  /** Home = today's profit card + the main inline menu. */
  private async showHome(ctx: Context, edit: boolean) {
    const tu = await this.findTelegramUser(ctx);
    if (!tu) {
      await this.askPhone(ctx);
      return;
    }
    const text = await this.stats.formatProfitCard(tu.userId, 'today');
    await this.render(ctx, text, this.mainMenu(tu.notifyOrders), edit);
  }

  private async showStats(ctx: Context, userId: string, range: StatsRange) {
    const safeRange: StatsRange = ['today', 'week', 'month'].includes(range)
      ? range
      : 'today';
    const tu = await this.findTelegramUser(ctx);
    const text = await this.stats.formatProfitCard(userId, safeRange);
    await this.render(
      ctx,
      text,
      this.mainMenu(tu?.notifyOrders ?? true, safeRange),
      true,
    );
  }

  private async showStores(ctx: Context, userId: string) {
    const text = await this.stats.formatStoresList(userId);
    await this.render(ctx, text, this.backMenu(), true);
  }

  private async toggleNotify(
    ctx: Context,
    telegramUserId: string,
    current: boolean,
  ) {
    const next = !current;
    await this.prisma.telegramUser.update({
      where: { id: telegramUserId },
      data: { notifyOrders: next },
    });
    await this.showHome(ctx, true);
  }

  // ─── Confirm order (Tasdiqlash) ─────────────────────────────────────────────

  /**
   * Confirm an order via Uzum (`POST /v1/fbs/order/{id}/confirm`) so it moves to
   * the packing ("yig'ishda") stage. Triggered by the inline button on a new-order
   * notification. The button card is edited in place to reflect the outcome.
   */
  private async handleConfirmOrder(
    ctx: Context,
    userId: string,
    storeId: string,
    orderId: string,
  ) {
    if (!storeId || !orderId) {
      await this.ack(ctx, '⚠️ Ma\'lumot yetarli emas');
      return;
    }
    if (!(await this.stats.userOwnsStore(userId, storeId))) {
      await this.ack(ctx, '⚠️ Do\'kon topilmadi');
      return;
    }

    await this.ack(ctx, '⏳ Tasdiqlanmoqda…');

    let result: { ok: boolean; error?: string };
    try {
      const { apiKey } = await this.stores.getStoreCredentials(userId, storeId);
      result = await this.uzum.confirmFbsOrder(storeId, apiKey, orderId);
    } catch (e) {
      result = { ok: false, error: (e as Error).message };
    }

    if (result.ok) {
      await this.appendToCard(ctx, '\n\n✅ Tasdiqlandi · yig\'ishda', true);
      await this.ack(ctx, '✅ Tasdiqlandi');
    } else {
      const reason = result.error ? `: ${result.error}` : '';
      await this.appendToCard(ctx, `\n\n⚠️ Tasdiqlanmadi${reason}`, false);
      await this.ack(ctx, '⚠️ Tasdiqlanmadi');
    }
  }

  /**
   * Append a plain status line to a notification card. Works whether the card is
   * a photo (caption) or a text message; optionally strips the inline button.
   * No parse_mode — Telegram returns the card text already plain, so re-sending
   * it as HTML could break on stray entities.
   */
  private async appendToCard(ctx: Context, suffix: string, removeButton: boolean) {
    const msg: any = ctx.callbackQuery?.message;
    const markup = removeButton ? { inline_keyboard: [] } : msg?.reply_markup;
    try {
      if (msg?.caption != null) {
        await ctx.editMessageCaption((msg.caption || '') + suffix, {
          reply_markup: markup,
        } as any);
      } else if (msg?.text != null) {
        await ctx.editMessageText((msg.text || '') + suffix, {
          reply_markup: markup,
        } as any);
      } else if (removeButton) {
        await ctx.editMessageReplyMarkup(markup as any);
      }
    } catch (e) {
      this.logger.warn(`appendToCard failed: ${(e as Error).message}`);
    }
  }

  // ─── Expenses view + entry ─────────────────────────────────────────────────

  private async showExpenses(ctx: Context, userId: string, page: number) {
    const { text, items, page: p, totalPages } =
      await this.stats.formatExpensesList(userId, page);

    const rows: any[] = [];
    rows.push([
      Markup.button.callback('➕ Xarajat qo\'shish', 'exp:add'),
    ]);
    // One delete button per listed expense.
    for (const it of items) {
      rows.push([Markup.button.callback(`🗑 ${it.label}`, `exp:del:${it.id}`)]);
    }
    if (totalPages > 1) {
      const nav: any[] = [];
      if (p > 0)
        nav.push(Markup.button.callback('⬅️', `fin:page:${p - 1}`));
      nav.push(Markup.button.callback(`${p + 1}/${totalPages}`, 'noop'));
      if (p < totalPages - 1)
        nav.push(Markup.button.callback('➡️', `fin:page:${p + 1}`));
      rows.push(nav);
    }
    rows.push([Markup.button.callback('🏠 Bosh menyu', 'home')]);

    await this.render(ctx, text, Markup.inlineKeyboard(rows), true);
  }

  private async handleExpenseCallback(
    ctx: Context,
    userId: string,
    rest: string[],
  ) {
    const action = rest[0];
    const chatId = String(ctx.chat?.id);

    if (action === 'add') {
      await this.ack(ctx);
      const stores = await this.stats.getStoresForUser(userId);
      if (!stores.length) {
        await this.render(
          ctx,
          '🏪 Avval saytdan do\'kon qo\'shing.',
          this.backMenu(),
          true,
        );
        return;
      }
      if (stores.length === 1) {
        this.drafts.set(chatId, {
          step: 'amount',
          storeId: stores[0].id,
          storeName: stores[0].name,
          category: '',
          updatedAt: Date.now(),
        });
        await this.askCategory(ctx);
      } else {
        const rows = stores.map((s) => [
          Markup.button.callback(`🏪 ${s.name}`, `exp:store:${s.id}`),
        ]);
        rows.push([Markup.button.callback('✖️ Bekor', 'fin:page:0')]);
        await this.render(
          ctx,
          'Qaysi do\'kon uchun xarajat?',
          Markup.inlineKeyboard(rows),
          true,
        );
      }
      return;
    }

    if (action === 'store') {
      await this.ack(ctx);
      const storeId = rest[1];
      const stores = await this.stats.getStoresForUser(userId);
      const store = stores.find((s) => s.id === storeId);
      if (!store) {
        await this.render(ctx, '⚠️ Do\'kon topilmadi.', this.backMenu(), true);
        return;
      }
      this.drafts.set(chatId, {
        step: 'amount',
        storeId: store.id,
        storeName: store.name,
        category: '',
        updatedAt: Date.now(),
      });
      await this.askCategory(ctx);
      return;
    }

    if (action === 'cat') {
      await this.ack(ctx);
      const draft = this.getDraft(chatId);
      if (!draft) {
        await this.showExpenses(ctx, userId, 0);
        return;
      }
      draft.category = rest[1];
      draft.step = 'amount';
      draft.updatedAt = Date.now();
      const cat = categoryDef(draft.category);
      await this.render(
        ctx,
        `${cat.emoji} <b>${escapeHtml(cat.label)}</b>\n🏪 ${escapeHtml(draft.storeName)}\n\n` +
          '💵 Xarajat summasini yuboring (faqat raqam, so\'mda).\nMisol: <code>150000</code>',
        Markup.inlineKeyboard([
          [Markup.button.callback('✖️ Bekor', 'exp:cancel')],
        ]),
        true,
      );
      return;
    }

    if (action === 'skipdesc') {
      await this.ack(ctx);
      const draft = this.getDraft(chatId);
      if (!draft || draft.amount == null) {
        await this.showExpenses(ctx, userId, 0);
        return;
      }
      await this.saveDraft(ctx, userId, draft, categoryDef(draft.category).label);
      return;
    }

    if (action === 'cancel') {
      await this.ack(ctx, 'Bekor qilindi');
      this.drafts.delete(chatId);
      await this.showExpenses(ctx, userId, 0);
      return;
    }

    if (action === 'del') {
      const ok = await this.stats.deleteExpense(userId, rest[1]);
      await this.ack(ctx, ok ? '🗑 O\'chirildi' : '⚠️ Topilmadi');
      await this.showExpenses(ctx, userId, 0);
      return;
    }

    await this.ack(ctx);
  }

  private async askCategory(ctx: Context) {
    const rows: any[] = [];
    for (let i = 0; i < EXPENSE_CATEGORIES.length; i += 2) {
      rows.push(
        EXPENSE_CATEGORIES.slice(i, i + 2).map((c) =>
          Markup.button.callback(`${c.emoji} ${c.label}`, `exp:cat:${c.key}`),
        ),
      );
    }
    rows.push([Markup.button.callback('✖️ Bekor', 'exp:cancel')]);
    await this.render(
      ctx,
      '🏷 Xarajat turini tanlang:',
      Markup.inlineKeyboard(rows),
      true,
    );
  }

  /** Free-text: continue an in-progress expense draft, else show home. */
  private async handleText(ctx: Context) {
    const tu = await this.findTelegramUser(ctx);
    if (!tu) {
      await this.askPhone(ctx);
      return;
    }

    const chatId = String(ctx.chat?.id);
    const draft = this.getDraft(chatId);
    const text = ((ctx.message as any)?.text || '').trim();

    if (!draft) {
      await this.showHome(ctx, false);
      return;
    }

    if (draft.step === 'amount') {
      const amount = parseAmount(text);
      if (amount == null || amount <= 0) {
        await ctx.reply(
          '⚠️ Summani to\'g\'ri kiriting (faqat raqam).\nMisol: <code>150000</code>',
          { parse_mode: 'HTML' } as any,
        );
        return;
      }
      draft.amount = amount;
      draft.step = 'description';
      draft.updatedAt = Date.now();
      await ctx.reply(
        `💵 ${money(amount)}\n\n📝 Izoh yozing yoki o'tkazib yuboring:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('⏭ O\'tkazib yuborish', 'exp:skipdesc')],
          [Markup.button.callback('✖️ Bekor', 'exp:cancel')],
        ]),
      );
      return;
    }

    if (draft.step === 'description') {
      if (draft.amount == null) {
        this.drafts.delete(chatId);
        await this.showHome(ctx, false);
        return;
      }
      await this.saveDraft(ctx, tu.userId, draft, text.slice(0, 200));
      return;
    }
  }

  private async saveDraft(
    ctx: Context,
    userId: string,
    draft: ExpenseDraft,
    description: string,
  ) {
    const chatId = String(ctx.chat?.id);
    // Re-check ownership in case stores changed mid-flow.
    if (!(await this.stats.userOwnsStore(userId, draft.storeId))) {
      this.drafts.delete(chatId);
      await ctx.reply('⚠️ Do\'kon topilmadi, xarajat saqlanmadi.');
      return;
    }
    await this.stats.addExpense({
      storeId: draft.storeId,
      category: draft.category || 'OTHER',
      amount: draft.amount!,
      description: description || categoryDef(draft.category).label,
    });
    this.drafts.delete(chatId);

    const cat = categoryDef(draft.category);
    await ctx.reply(
      `✅ <b>Xarajat saqlandi</b>\n` +
        `${cat.emoji} ${escapeHtml(cat.label)} · ${money(draft.amount!)}\n` +
        `🏪 ${escapeHtml(draft.storeName)}`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📉 Xarajatlar', 'fin:page:0')],
          [Markup.button.callback('🏠 Bosh menyu', 'home')],
        ]),
      } as any,
    );
  }

  // ─── Menu / help / logout ──────────────────────────────────────────────────

  private mainMenu(notifyOrders: boolean, active?: StatsRange) {
    const mark = (r: StatsRange, label: string) =>
      active === r ? `· ${label} ·` : label;
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(mark('today', '📊 Bugun'), 'stats:today'),
        Markup.button.callback(mark('week', '📈 Hafta'), 'stats:week'),
        Markup.button.callback(mark('month', '🗓 Oy'), 'stats:month'),
      ],
      [
        Markup.button.callback('📉 Xarajatlar', 'fin:page:0'),
        Markup.button.callback('➕ Xarajat', 'exp:add'),
      ],
      [Markup.button.callback('🏪 Do\'konlar', 'stores')],
      [
        Markup.button.callback(
          notifyOrders
            ? '🔔 Bildirishnoma: yoniq'
            : '🔕 Bildirishnoma: o\'chiq',
          'notify:toggle',
        ),
      ],
      [Markup.button.callback('ℹ️ Yordam', 'help')],
    ]);
  }

  private backMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Bosh menyu', 'home')],
    ]);
  }

  private async sendHelp(ctx: Context, edit = false) {
    const text =
      '<b>Uzum Dashboard bot</b>\n\n' +
      'Bot orqali siz quyidagilarni qila olasiz:\n' +
      '• 📊 Bugungi/haftalik/oylik savdo va <b>sof foyda</b>\n' +
      '• 📉 Xarajatlarni kiritish va boshqarish\n' +
      '• 🏪 Do\'konlar holati va sync\n' +
      '• 🔔 Yangi buyurtma bildirishnomalari\n\n' +
      '<b>Buyruqlar:</b>\n' +
      '/menu — bosh menyu\n' +
      '/logout — chiqish\n' +
      '/help — yordam';
    await this.render(ctx, text, this.backMenu(), edit);
  }

  private async handleLogout(ctx: Context) {
    const tu = await this.findTelegramUser(ctx);
    this.drafts.delete(String(ctx.chat?.id));
    if (!tu) {
      await ctx.reply('Siz allaqachon tizimga kirmagansiz.', {
        reply_markup: { remove_keyboard: true },
      } as any);
      return;
    }
    await this.prisma.telegramUser.delete({ where: { id: tu.id } });
    await ctx.reply(
      '👋 Tizimdan chiqdingiz. Qayta kirish uchun /start ni bosing.',
      { reply_markup: { remove_keyboard: true } } as any,
    );
  }

  // ─── Rendering helpers ─────────────────────────────────────────────────────

  /**
   * Render text + inline keyboard. When `edit` is true we edit the message the
   * button was attached to (keeps the chat clean); on failure we fall back to a
   * fresh reply.
   */
  private async render(
    ctx: Context,
    text: string,
    keyboard: ReturnType<typeof Markup.inlineKeyboard>,
    edit: boolean,
  ) {
    const extra: any = { parse_mode: 'HTML', ...keyboard };
    if (edit && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, extra);
        return;
      } catch (e) {
        const msg = (e as Error).message || '';
        // "message is not modified" is benign; anything else → fall through.
        if (msg.includes('not modified')) return;
      }
    }
    try {
      await ctx.reply(text, extra);
    } catch (e) {
      this.logger.warn(`reply failed, retrying plain: ${(e as Error).message}`);
      await ctx.reply(text.replace(/<[^>]+>/g, ''), keyboard as any);
    }
  }

  private async ack(ctx: Context, text?: string) {
    try {
      await ctx.answerCbQuery(text);
    } catch {
      // ignore stale callback queries
    }
  }

  // ─── State / lookup helpers ────────────────────────────────────────────────

  private getDraft(chatId: string): ExpenseDraft | undefined {
    const d = this.drafts.get(chatId);
    if (!d) return undefined;
    if (Date.now() - d.updatedAt > DRAFT_TTL_MS) {
      this.drafts.delete(chatId);
      return undefined;
    }
    return d;
  }

  private async requireAuth(
    ctx: Context,
    fn: (
      tu: NonNullable<Awaited<ReturnType<typeof this.findTelegramUser>>>,
    ) => Promise<void>,
  ): Promise<void> {
    const tu = await this.findTelegramUser(ctx);
    if (!tu) {
      await this.askPhone(ctx);
      return;
    }
    await fn(tu);
  }

  private async findTelegramUser(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    return this.prisma.telegramUser.findFirst({
      where: { chatId, isActive: true },
    });
  }

  private async findUserByPhone(phone: string) {
    const candidates = Array.from(
      new Set([phone, phone.replace(/^\+/, ''), '+' + phone.replace(/^\+/, '')]),
    );
    return this.prisma.user.findFirst({
      where: { phone: { in: candidates } },
      select: { id: true, phone: true, name: true },
    });
  }

  private normalizePhone(raw: string): string {
    let s = raw.replace(/[^\d+]/g, '');
    if (!s.startsWith('+')) s = '+' + s;
    return s;
  }
}

/** Parse "150 000", "150,000", "150000.50", "150k" → number (so'm). */
function parseAmount(raw: string): number | null {
  let s = raw.toLowerCase().replace(/\s/g, '').replace(/,/g, '.');
  let mult = 1;
  if (/(mln|million)$/.test(s)) {
    mult = 1_000_000;
    s = s.replace(/(mln|million)$/, '');
  } else if (/(k|ming)$/.test(s)) {
    mult = 1_000;
    s = s.replace(/(k|ming)$/, '');
  }
  // keep only the first numeric token
  const m = s.match(/[\d.]+/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * mult);
}

function money(n: number): string {
  return (
    Math.abs(Math.round(n)).toLocaleString('uz-UZ', {
      maximumFractionDigits: 0,
    }) + ' so\'m'
  );
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
