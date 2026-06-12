"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TelegramBotService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramBotService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const telegraf_1 = require("telegraf");
const filters_1 = require("telegraf/filters");
const prisma_service_1 = require("../../common/database/prisma.service");
const uzum_api_client_1 = require("../../uzum/client/uzum-api.client");
const stores_service_1 = require("../stores/stores.service");
const telegram_stats_service_1 = require("./telegram-stats.service");
const DRAFT_TTL_MS = 15 * 60 * 1000;
let TelegramBotService = TelegramBotService_1 = class TelegramBotService {
    constructor(config, prisma, stats, uzum, stores) {
        this.config = config;
        this.prisma = prisma;
        this.stats = stats;
        this.uzum = uzum;
        this.stores = stores;
        this.logger = new common_1.Logger(TelegramBotService_1.name);
        this.bot = null;
        this.botUsername = null;
        this.drafts = new Map();
    }
    async onModuleInit() {
        const token = this.config.get('TELEGRAM_BOT_TOKEN');
        if (!token) {
            this.logger.warn('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled');
            return;
        }
        this.bot = new telegraf_1.Telegraf(token);
        this.registerHandlers();
        try {
            const me = await this.bot.telegram.getMe();
            this.botUsername = me.username || null;
            this.logger.log(`Telegram bot @${me.username} authorized (id=${me.id})`);
        }
        catch (e) {
            this.logger.error(`Failed to authorize Telegram bot: ${e.message}`);
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
            }
            catch (e) {
                this.logger.warn(`Bot stop failed: ${e.message}`);
            }
        }
    }
    getBot() {
        return this.bot;
    }
    getBotUsername() {
        return this.botUsername;
    }
    async notifyAdminStartup() {
        const adminId = this.config.get('TELEGRAM_ADMIN_ID');
        if (!adminId || !this.bot)
            return;
        try {
            await this.bot.telegram.sendMessage(adminId, `🤖 <b>Uzum Dashboard bot ishga tushdi</b>\n` +
                `🔗 @${this.botUsername || ''}\n` +
                `🕒 ${new Date().toLocaleString('uz-UZ')}`, { parse_mode: 'HTML' });
            this.logger.log(`Startup notice sent to admin chat ${adminId}`);
        }
        catch (e) {
            this.logger.warn(`Failed to notify admin ${adminId}: ${e.message}`);
        }
    }
    registerHandlers() {
        if (!this.bot)
            return;
        this.bot.use(async (ctx, next) => {
            const text = ctx.message?.text;
            const cb = ctx.callbackQuery?.data;
            if (text || cb) {
                this.logger.log(`IN chat=${ctx.chat?.id} ${cb ? `cb=${JSON.stringify(cb)}` : `text=${JSON.stringify(text)}`}`);
            }
            try {
                await next();
            }
            catch (e) {
                this.logger.error(`Handler threw for chat=${ctx.chat?.id}: ${e.message}`, e.stack);
                try {
                    await ctx.reply('⚠️ Texnik xato yuz berdi. Birozdan keyin urinib ko\'ring.');
                }
                catch {
                }
            }
        });
        this.bot.catch((e, ctx) => {
            this.logger.error(`Uncaught bot error chat=${ctx.chat?.id}: ${e.message}`, e.stack);
        });
        this.bot.start(async (ctx) => this.handleStart(ctx));
        this.bot.command('menu', async (ctx) => this.requireAuth(ctx, () => this.showHome(ctx, false)));
        this.bot.command('logout', async (ctx) => this.handleLogout(ctx));
        this.bot.command('help', async (ctx) => this.sendHelp(ctx));
        this.bot.on((0, filters_1.message)('contact'), async (ctx) => this.handleContact(ctx));
        this.bot.on('callback_query', async (ctx) => this.handleCallback(ctx));
        this.bot.on((0, filters_1.message)('text'), async (ctx) => this.handleText(ctx));
    }
    async handleStart(ctx) {
        const tu = await this.findTelegramUser(ctx);
        if (tu) {
            await this.showHome(ctx, false);
            return;
        }
        await this.askPhone(ctx);
    }
    async askPhone(ctx) {
        await ctx.reply('👋 <b>Uzum Dashboard botiga xush kelibsiz!</b>\n\n' +
            'Kabinetingizga kirish uchun pastdagi tugma orqali telefon raqamingizni yuboring.\n\n' +
            '<i>Eslatma: telefon raqamingiz saytdan ro\'yxatdan o\'tgan raqam bilan bir xil bo\'lishi kerak.</i>', {
            parse_mode: 'HTML',
            ...telegraf_1.Markup.keyboard([
                [telegraf_1.Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
            ])
                .resize()
                .oneTime(),
        });
    }
    async handleContact(ctx) {
        const contact = ctx.message?.contact;
        if (!contact)
            return;
        if (contact.user_id && contact.user_id !== ctx.from?.id) {
            await ctx.reply('⚠️ Iltimos, faqat o\'zingizning telefon raqamingizni yuboring.');
            return;
        }
        const phone = this.normalizePhone(String(contact.phone_number || ''));
        const user = await this.findUserByPhone(phone);
        if (!user) {
            await ctx.reply(`❌ <b>${escapeHtml(phone)}</b> raqami tizimda topilmadi.\n\n` +
                'Avval saytdan ro\'yxatdan o\'ting, keyin shu botga qayta kiring.', {
                parse_mode: 'HTML',
                link_preview_options: { is_disabled: true },
                reply_markup: { remove_keyboard: true },
            });
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
        await ctx.reply(greeting, {
            parse_mode: 'HTML',
            reply_markup: { remove_keyboard: true },
        });
        await this.showHome(ctx, false);
        if (isNew) {
            await this.notifyAdminNewLink(user, ctx);
        }
    }
    async notifyAdminNewLink(user, ctx) {
        const adminId = this.config.get('TELEGRAM_ADMIN_ID');
        if (!adminId || !this.bot)
            return;
        try {
            await this.bot.telegram.sendMessage(adminId, `🆕 <b>Yangi foydalanuvchi botga kirdi</b>\n` +
                `👤 ${escapeHtml(user.name || '—')}\n` +
                `📞 ${escapeHtml(user.phone)}\n` +
                (ctx.from?.username ? `🔗 @${ctx.from.username}\n` : '') +
                `🕒 ${new Date().toLocaleString('uz-UZ')}`, { parse_mode: 'HTML' });
        }
        catch {
        }
    }
    async handleCallback(ctx) {
        const data = ctx.callbackQuery?.data;
        if (!data)
            return;
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
                    await this.showStats(ctx, tu.userId, rest[0]);
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
                    await this.ack(ctx, tu.notifyOrders
                        ? '🔕 Bildirishnomalar o\'chirildi'
                        : '🔔 Bildirishnomalar yoqildi');
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
        }
        catch (e) {
            this.logger.error(`callback ${data} failed: ${e.message}`, e.stack);
            await this.ack(ctx, '⚠️ Xato');
        }
    }
    async showHome(ctx, edit) {
        const tu = await this.findTelegramUser(ctx);
        if (!tu) {
            await this.askPhone(ctx);
            return;
        }
        const text = await this.stats.formatProfitCard(tu.userId, 'today');
        await this.render(ctx, text, this.mainMenu(tu.notifyOrders), edit);
    }
    async showStats(ctx, userId, range) {
        const safeRange = ['today', 'week', 'month'].includes(range)
            ? range
            : 'today';
        const tu = await this.findTelegramUser(ctx);
        const text = await this.stats.formatProfitCard(userId, safeRange);
        await this.render(ctx, text, this.mainMenu(tu?.notifyOrders ?? true, safeRange), true);
    }
    async showStores(ctx, userId) {
        const text = await this.stats.formatStoresList(userId);
        await this.render(ctx, text, this.backMenu(), true);
    }
    async toggleNotify(ctx, telegramUserId, current) {
        const next = !current;
        await this.prisma.telegramUser.update({
            where: { id: telegramUserId },
            data: { notifyOrders: next },
        });
        await this.showHome(ctx, true);
    }
    async handleConfirmOrder(ctx, userId, storeId, orderId) {
        if (!storeId || !orderId) {
            await this.ack(ctx, '⚠️ Ma\'lumot yetarli emas');
            return;
        }
        if (!(await this.stats.userOwnsStore(userId, storeId))) {
            await this.ack(ctx, '⚠️ Do\'kon topilmadi');
            return;
        }
        await this.ack(ctx, '⏳ Tasdiqlanmoqda…');
        let result;
        try {
            const { apiKey } = await this.stores.getStoreCredentials(userId, storeId);
            result = await this.uzum.confirmFbsOrder(storeId, apiKey, orderId);
        }
        catch (e) {
            result = { ok: false, error: e.message };
        }
        if (result.ok) {
            await this.appendToCard(ctx, '\n\n✅ Tasdiqlandi · yig\'ishda', true);
            await this.ack(ctx, '✅ Tasdiqlandi');
        }
        else {
            const reason = result.error ? `: ${result.error}` : '';
            await this.appendToCard(ctx, `\n\n⚠️ Tasdiqlanmadi${reason}`, false);
            await this.ack(ctx, '⚠️ Tasdiqlanmadi');
        }
    }
    async appendToCard(ctx, suffix, removeButton) {
        const msg = ctx.callbackQuery?.message;
        const markup = removeButton ? { inline_keyboard: [] } : msg?.reply_markup;
        try {
            if (msg?.caption != null) {
                await ctx.editMessageCaption((msg.caption || '') + suffix, {
                    reply_markup: markup,
                });
            }
            else if (msg?.text != null) {
                await ctx.editMessageText((msg.text || '') + suffix, {
                    reply_markup: markup,
                });
            }
            else if (removeButton) {
                await ctx.editMessageReplyMarkup(markup);
            }
        }
        catch (e) {
            this.logger.warn(`appendToCard failed: ${e.message}`);
        }
    }
    async showExpenses(ctx, userId, page) {
        const { text, items, page: p, totalPages } = await this.stats.formatExpensesList(userId, page);
        const rows = [];
        rows.push([
            telegraf_1.Markup.button.callback('➕ Xarajat qo\'shish', 'exp:add'),
        ]);
        for (const it of items) {
            rows.push([telegraf_1.Markup.button.callback(`🗑 ${it.label}`, `exp:del:${it.id}`)]);
        }
        if (totalPages > 1) {
            const nav = [];
            if (p > 0)
                nav.push(telegraf_1.Markup.button.callback('⬅️', `fin:page:${p - 1}`));
            nav.push(telegraf_1.Markup.button.callback(`${p + 1}/${totalPages}`, 'noop'));
            if (p < totalPages - 1)
                nav.push(telegraf_1.Markup.button.callback('➡️', `fin:page:${p + 1}`));
            rows.push(nav);
        }
        rows.push([telegraf_1.Markup.button.callback('🏠 Bosh menyu', 'home')]);
        await this.render(ctx, text, telegraf_1.Markup.inlineKeyboard(rows), true);
    }
    async handleExpenseCallback(ctx, userId, rest) {
        const action = rest[0];
        const chatId = String(ctx.chat?.id);
        if (action === 'add') {
            await this.ack(ctx);
            const stores = await this.stats.getStoresForUser(userId);
            if (!stores.length) {
                await this.render(ctx, '🏪 Avval saytdan do\'kon qo\'shing.', this.backMenu(), true);
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
            }
            else {
                const rows = stores.map((s) => [
                    telegraf_1.Markup.button.callback(`🏪 ${s.name}`, `exp:store:${s.id}`),
                ]);
                rows.push([telegraf_1.Markup.button.callback('✖️ Bekor', 'fin:page:0')]);
                await this.render(ctx, 'Qaysi do\'kon uchun xarajat?', telegraf_1.Markup.inlineKeyboard(rows), true);
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
            const cat = (0, telegram_stats_service_1.categoryDef)(draft.category);
            await this.render(ctx, `${cat.emoji} <b>${escapeHtml(cat.label)}</b>\n🏪 ${escapeHtml(draft.storeName)}\n\n` +
                '💵 Xarajat summasini yuboring (faqat raqam, so\'mda).\nMisol: <code>150000</code>', telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('✖️ Bekor', 'exp:cancel')],
            ]), true);
            return;
        }
        if (action === 'skipdesc') {
            await this.ack(ctx);
            const draft = this.getDraft(chatId);
            if (!draft || draft.amount == null) {
                await this.showExpenses(ctx, userId, 0);
                return;
            }
            await this.saveDraft(ctx, userId, draft, (0, telegram_stats_service_1.categoryDef)(draft.category).label);
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
    async askCategory(ctx) {
        const rows = [];
        for (let i = 0; i < telegram_stats_service_1.EXPENSE_CATEGORIES.length; i += 2) {
            rows.push(telegram_stats_service_1.EXPENSE_CATEGORIES.slice(i, i + 2).map((c) => telegraf_1.Markup.button.callback(`${c.emoji} ${c.label}`, `exp:cat:${c.key}`)));
        }
        rows.push([telegraf_1.Markup.button.callback('✖️ Bekor', 'exp:cancel')]);
        await this.render(ctx, '🏷 Xarajat turini tanlang:', telegraf_1.Markup.inlineKeyboard(rows), true);
    }
    async handleText(ctx) {
        const tu = await this.findTelegramUser(ctx);
        if (!tu) {
            await this.askPhone(ctx);
            return;
        }
        const chatId = String(ctx.chat?.id);
        const draft = this.getDraft(chatId);
        const text = (ctx.message?.text || '').trim();
        if (!draft) {
            await this.showHome(ctx, false);
            return;
        }
        if (draft.step === 'amount') {
            const amount = parseAmount(text);
            if (amount == null || amount <= 0) {
                await ctx.reply('⚠️ Summani to\'g\'ri kiriting (faqat raqam).\nMisol: <code>150000</code>', { parse_mode: 'HTML' });
                return;
            }
            draft.amount = amount;
            draft.step = 'description';
            draft.updatedAt = Date.now();
            await ctx.reply(`💵 ${money(amount)}\n\n📝 Izoh yozing yoki o'tkazib yuboring:`, telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('⏭ O\'tkazib yuborish', 'exp:skipdesc')],
                [telegraf_1.Markup.button.callback('✖️ Bekor', 'exp:cancel')],
            ]));
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
    async saveDraft(ctx, userId, draft, description) {
        const chatId = String(ctx.chat?.id);
        if (!(await this.stats.userOwnsStore(userId, draft.storeId))) {
            this.drafts.delete(chatId);
            await ctx.reply('⚠️ Do\'kon topilmadi, xarajat saqlanmadi.');
            return;
        }
        await this.stats.addExpense({
            storeId: draft.storeId,
            category: draft.category || 'OTHER',
            amount: draft.amount,
            description: description || (0, telegram_stats_service_1.categoryDef)(draft.category).label,
        });
        this.drafts.delete(chatId);
        const cat = (0, telegram_stats_service_1.categoryDef)(draft.category);
        await ctx.reply(`✅ <b>Xarajat saqlandi</b>\n` +
            `${cat.emoji} ${escapeHtml(cat.label)} · ${money(draft.amount)}\n` +
            `🏪 ${escapeHtml(draft.storeName)}`, {
            parse_mode: 'HTML',
            ...telegraf_1.Markup.inlineKeyboard([
                [telegraf_1.Markup.button.callback('📉 Xarajatlar', 'fin:page:0')],
                [telegraf_1.Markup.button.callback('🏠 Bosh menyu', 'home')],
            ]),
        });
    }
    mainMenu(notifyOrders, active) {
        const mark = (r, label) => active === r ? `· ${label} ·` : label;
        return telegraf_1.Markup.inlineKeyboard([
            [
                telegraf_1.Markup.button.callback(mark('today', '📊 Bugun'), 'stats:today'),
                telegraf_1.Markup.button.callback(mark('week', '📈 Hafta'), 'stats:week'),
                telegraf_1.Markup.button.callback(mark('month', '🗓 Oy'), 'stats:month'),
            ],
            [
                telegraf_1.Markup.button.callback('📉 Xarajatlar', 'fin:page:0'),
                telegraf_1.Markup.button.callback('➕ Xarajat', 'exp:add'),
            ],
            [telegraf_1.Markup.button.callback('🏪 Do\'konlar', 'stores')],
            [
                telegraf_1.Markup.button.callback(notifyOrders
                    ? '🔔 Bildirishnoma: yoniq'
                    : '🔕 Bildirishnoma: o\'chiq', 'notify:toggle'),
            ],
            [telegraf_1.Markup.button.callback('ℹ️ Yordam', 'help')],
        ]);
    }
    backMenu() {
        return telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback('🏠 Bosh menyu', 'home')],
        ]);
    }
    async sendHelp(ctx, edit = false) {
        const text = '<b>Uzum Dashboard bot</b>\n\n' +
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
    async handleLogout(ctx) {
        const tu = await this.findTelegramUser(ctx);
        this.drafts.delete(String(ctx.chat?.id));
        if (!tu) {
            await ctx.reply('Siz allaqachon tizimga kirmagansiz.', {
                reply_markup: { remove_keyboard: true },
            });
            return;
        }
        await this.prisma.telegramUser.delete({ where: { id: tu.id } });
        await ctx.reply('👋 Tizimdan chiqdingiz. Qayta kirish uchun /start ni bosing.', { reply_markup: { remove_keyboard: true } });
    }
    async render(ctx, text, keyboard, edit) {
        const extra = { parse_mode: 'HTML', ...keyboard };
        if (edit && ctx.callbackQuery) {
            try {
                await ctx.editMessageText(text, extra);
                return;
            }
            catch (e) {
                const msg = e.message || '';
                if (msg.includes('not modified'))
                    return;
            }
        }
        try {
            await ctx.reply(text, extra);
        }
        catch (e) {
            this.logger.warn(`reply failed, retrying plain: ${e.message}`);
            await ctx.reply(text.replace(/<[^>]+>/g, ''), keyboard);
        }
    }
    async ack(ctx, text) {
        try {
            await ctx.answerCbQuery(text);
        }
        catch {
        }
    }
    getDraft(chatId) {
        const d = this.drafts.get(chatId);
        if (!d)
            return undefined;
        if (Date.now() - d.updatedAt > DRAFT_TTL_MS) {
            this.drafts.delete(chatId);
            return undefined;
        }
        return d;
    }
    async requireAuth(ctx, fn) {
        const tu = await this.findTelegramUser(ctx);
        if (!tu) {
            await this.askPhone(ctx);
            return;
        }
        await fn(tu);
    }
    async findTelegramUser(ctx) {
        const chatId = String(ctx.chat?.id);
        return this.prisma.telegramUser.findFirst({
            where: { chatId, isActive: true },
        });
    }
    async findUserByPhone(phone) {
        const candidates = Array.from(new Set([phone, phone.replace(/^\+/, ''), '+' + phone.replace(/^\+/, '')]));
        return this.prisma.user.findFirst({
            where: { phone: { in: candidates } },
            select: { id: true, phone: true, name: true },
        });
    }
    normalizePhone(raw) {
        let s = raw.replace(/[^\d+]/g, '');
        if (!s.startsWith('+'))
            s = '+' + s;
        return s;
    }
};
exports.TelegramBotService = TelegramBotService;
exports.TelegramBotService = TelegramBotService = TelegramBotService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        telegram_stats_service_1.TelegramStatsService,
        uzum_api_client_1.UzumApiClient,
        stores_service_1.StoresService])
], TelegramBotService);
function parseAmount(raw) {
    let s = raw.toLowerCase().replace(/\s/g, '').replace(/,/g, '.');
    let mult = 1;
    if (/(mln|million)$/.test(s)) {
        mult = 1_000_000;
        s = s.replace(/(mln|million)$/, '');
    }
    else if (/(k|ming)$/.test(s)) {
        mult = 1_000;
        s = s.replace(/(k|ming)$/, '');
    }
    const m = s.match(/[\d.]+/);
    if (!m)
        return null;
    const n = Number(m[0]);
    if (!Number.isFinite(n))
        return null;
    return Math.round(n * mult);
}
function money(n) {
    return (Math.abs(Math.round(n)).toLocaleString('uz-UZ', {
        maximumFractionDigits: 0,
    }) + ' so\'m');
}
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
//# sourceMappingURL=telegram-bot.service.js.map