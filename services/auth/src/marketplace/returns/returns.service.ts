import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';
import { FinanceSyncService } from '../finance/finance-sync.service';

type ReturnStatus = 'RETURNED' | 'READY_FOR_PICKUP' | 'RECEIVED' | 'LOST';

export interface ReturnsFilters {
  dateFrom?: number;
  dateTo?: number;
  product?: string;
  sku?: string;
  status?: string;
  force?: boolean;
}

/**
 * Returns Analytics — biznes boshidan beri BARCHA qaytarilgan mahsulotlarni
 * doimiy saqlaydi (hech qachon o'chirmaydi) va yo'qolgan qaytarishlarni aniqlaydi.
 *
 * Manba: FBS RETURNED buyurtmalar (asosiy) + /v1/return nakladnoylari (qabul/
 * tayyor statusini aniqlash uchun). Uzum eski yozuvlarni qaytarmay qo'ysa ham
 * DB'dagi tarix saqlanadi; 15+ kun qabul qilinmagan qaytarish "LOST" bo'ladi.
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);
  private readonly LOST_DAYS = 15;
  private readonly SYNC_TTL_MS = 10 * 60 * 1000;
  private lastSync = new Map<string, number>();
  private inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
    private readonly storesService: StoresService,
    private readonly financeSync: FinanceSyncService,
  ) {}

  // ─── Sync: Uzum → DB (hech narsa o'chirilmaydi) ────────────────────────
  async syncReturns(userId: string, storeId: string): Promise<void> {
    const existing = this.inflight.get(storeId);
    if (existing) return existing;
    const work = this.doSync(userId, storeId).finally(() => this.inflight.delete(storeId));
    this.inflight.set(storeId, work);
    return work;
  }

  private async doSync(userId: string, storeId: string): Promise<void> {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);

    // 0) Qo'lda belgilangan "qabul qilindi" yorliqlarini tozalaymiz — status
    // endi faqat Uzum ma'lumotidan hisoblanadi. Manual belgilanganlar RETURNED'ga
    // qaytariladi, keyin pastdagi loop Uzum nakladnoylariga qarab qayta baholaydi.
    await this.prisma.productReturn.updateMany({
      where: { storeId, manualReceived: true },
      data: { manualReceived: false, status: 'RETURNED', receivedAt: null },
    });

    // 1) FBS RETURNED buyurtmalar — to'liq tarix (sana filtrisiz)
    const returnedOrders = await this.uzumClient
      .getAllFbsOrders(storeId, apiKey, uzumShopId, ['RETURNED'])
      .catch((e) => {
        this.logger.warn(`getAllFbsOrders(RETURNED) failed: ${e?.message}`);
        return [] as any[];
      });

    // 2) /v1/shop/{shopId}/return nakladnoylari — qabul qilinganlar ro'yxati
    // COMPLETED status = qabul qilingan (receivedDate = completedDate)
    const returnsInvoices = await this.uzumClient
      .getSellerReturns(storeId, apiKey, uzumShopId, { size: 100 })
      .catch(() => [] as any[]);

    // Har bir COMPLETED nakladnoy ichidagi mahsulotlar = haqiqatan qabul
    // qilingan. SKU bo'yicha JAMI packedAmount'ni hisoblaymiz — keyin shu
    // miqdorni eng eski RETURNED yozuvlarga taqsimlaymiz (oldest-first).
    // Bu — bitta nakladnoyda 1 dona kelgan SKU butun shu SKU bo'yicha
    // barcha qaytarishlarni RECEIVED qilib qo'yishining oldini oladi.
    const receivedQtyBySku = new Map<string, number>();

    for (const inv of returnsInvoices) {
      const invId = inv?.id;
      if (!invId) continue;
      if (inv.status !== 'COMPLETED' || !inv.completedDate) continue;
      try {
        const detail = await this.uzumClient.getSellerReturnById(storeId, apiKey, uzumShopId, invId);
        for (const it of detail?.returnItems || []) {
          const title = it?.skuTitle ? String(it.skuTitle).trim() : '';
          if (!title) continue;
          const qty = Number(it?.packedAmount ?? it?.amount) || 0;
          receivedQtyBySku.set(title, (receivedQtyBySku.get(title) || 0) + qty);
        }
      } catch (e) {
        this.logger.warn(`getSellerReturnById ${invId} failed: ${e?.message}`);
      }
    }

    // 3) Tan narx (USD) xaritasi — dashboard bilan bir manba
    const cost = await this.financeSync.resolveCosts(userId, storeId).catch(() => null);
    const byTitle: Record<string, number> = cost?.costByFullTitle || {};
    const byPid: Record<string, number> = cost?.costByProductId || {};

    // Eng eski qaytarishlarga oldin qabul-qilingan slot beramiz (oldest-first
    // taqsimot). Shuning uchun returnedAt bo'yicha o'sish tartibida saralaymiz.
    const sortedOrders = [...returnedOrders].sort((a: any, b: any) => {
      const ad = a?.returnDate ?? a?.dateCancelled ?? a?.dateCreated ?? 0;
      const bd = b?.returnDate ?? b?.dateCancelled ?? b?.dateCreated ?? 0;
      return ad - bd;
    });

    const now = new Date();
    let upserts = 0;
    for (const o of sortedOrders) {
      const returnedMs = o?.returnDate ?? o?.dateCancelled ?? o?.dateCreated ?? null;
      const orderedMs = o?.dateCreated ?? null;
      const reason = o?.cancelReason || null;
      for (const it of o?.orderItems || []) {
        const skuTitle = it?.skuTitle ? String(it.skuTitle).trim() : '';
        const productId = it?.productId != null ? String(it.productId) : null;
        const costUsd =
          (skuTitle && byTitle[skuTitle] != null ? byTitle[skuTitle] : undefined) ??
          (productId && byPid[productId] != null ? byPid[productId] : undefined) ??
          null;

        // Qabul qilingan slot mavjudmi: SKU bo'yicha qolgan miqdor ≥ shu yozuv
        // miqdori bo'lsa — RECEIVED. Aks holda RETURNED (yoki LOST).
        const itemQty = Number(it?.amount) || 1;
        const remaining = skuTitle ? (receivedQtyBySku.get(skuTitle) || 0) : 0;
        const wasReceived = skuTitle && remaining >= itemQty;
        if (wasReceived) {
          receivedQtyBySku.set(skuTitle, remaining - itemQty);
        }

        const key = { storeId, uzumOrderId: String(o.id), skuTitle };
        const prev = await this.prisma.productReturn.findUnique({
          where: { storeId_uzumOrderId_skuTitle: key },
        });

        // Status faqat Uzum'dan: nakladnoyda (COMPLETED) slot bor → RECEIVED,
        // aks holda RETURNED. Sync har safar qayta hisoblaydi.
        const status: ReturnStatus = wasReceived ? 'RECEIVED' : 'RETURNED';

        await this.prisma.productReturn.upsert({
          where: { storeId_uzumOrderId_skuTitle: key },
          create: {
            storeId,
            uzumOrderId: String(o.id),
            publicId: o?.publicId ? String(o.publicId) : null,
            skuTitle: skuTitle || null,
            productId,
            productName: it?.title || skuTitle || "Noma'lum",
            barcode: it?.barcode != null ? String(it.barcode) : null,
            quantity: Number(it?.amount) || 1,
            costUsd: costUsd != null ? costUsd : null,
            salePrice: it?.price != null ? Number(it.price) : null,
            reason,
            status: status as any,
            orderedAt: orderedMs ? new Date(orderedMs) : null,
            returnedAt: returnedMs ? new Date(returnedMs) : null,
            lastSeenAt: now,
          },
          update: {
            publicId: o?.publicId ? String(o.publicId) : prev?.publicId,
            productName: it?.title || skuTitle || prev?.productName,
            barcode: it?.barcode != null ? String(it.barcode) : prev?.barcode,
            quantity: Number(it?.amount) || prev?.quantity || 1,
            ...(costUsd != null ? { costUsd } : {}),
            ...(it?.price != null ? { salePrice: Number(it.price) } : {}),
            ...(reason ? { reason } : {}),
            status: status as any,
            ...(returnedMs ? { returnedAt: new Date(returnedMs) } : {}),
            lastSeenAt: now,
          },
        });
        upserts++;
      }
    }

    await this.detectLost(storeId);
    this.lastSync.set(storeId, Date.now());
    this.logger.log(`Returns sync: ${upserts} item(s) upserted for store ${storeId}`);
  }

  /** 15+ kun Uzum tomonidan qabul qilinmagan (RETURNED) qaytarishlarni
   *  LOST deb belgilaydi. RECEIVED/tayyor bo'lganlarga tegmaydi. */
  private async detectLost(storeId: string): Promise<void> {
    const cutoff = new Date(Date.now() - this.LOST_DAYS * 86_400_000);
    await this.prisma.productReturn.updateMany({
      where: {
        storeId,
        status: 'RETURNED',
        returnedAt: { lt: cutoff },
      },
      data: { status: 'LOST' },
    });
  }

  // ─── Qaytarilganlar ro'yxati (Uzum nakladnoylari) ─────────────────────
  /** /v1/shop/{shopId}/return — qaytarilgan nakladnoylar ro'yxati (jonli). */
  async listInvoices(
    userId: string,
    storeId: string,
    page = 0,
    size = 20,
  ) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const invoices = await this.uzumClient.getSellerReturns(storeId, apiKey, uzumShopId, { page, size });
    return { invoices, page, size };
  }

  /** /v1/return?returnId=X — nakladnoy ichidagi qaytarilgan mahsulotlar. */
  async getInvoice(userId: string, storeId: string, returnId: string | number) {
    const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
    const invoice = await this.uzumClient.getSellerReturnById(storeId, apiKey, uzumShopId, returnId);
    return { invoice };
  }

  // ─── Analytics + filtrlangan ro'yxat ───────────────────────────────────
  async getAnalytics(userId: string, storeId: string, filters: ReturnsFilters = {}) {
    // Eskirgan bo'lsa (yoki force) sync qilamiz; aks holda DB'dan o'qiymiz
    const last = this.lastSync.get(storeId) || 0;
    if (filters.force || Date.now() - last > this.SYNC_TTL_MS) {
      await this.syncReturns(userId, storeId).catch((e) =>
        this.logger.warn(`Returns sync failed (serving DB): ${e?.message}`),
      );
    } else {
      await this.detectLost(storeId); // arzon — har doim yangilab turamiz
    }

    // Sana oralig'i (returnedAt bo'yicha) — sarlavha ko'rsatkichlari shu oraliqda
    const rangeWhere: any = { storeId };
    if (filters.dateFrom != null || filters.dateTo != null) {
      rangeWhere.returnedAt = {};
      if (filters.dateFrom != null) rangeWhere.returnedAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo != null) rangeWhere.returnedAt.lte = new Date(filters.dateTo);
    }

    const all = await this.prisma.productReturn.findMany({
      where: rangeWhere,
      orderBy: { returnedAt: 'desc' },
    });

    // Jadval uchun to'liq filtrlangan ro'yxat (product/sku/status ham)
    const list = all.filter((r) => {
      if (filters.status && r.status !== filters.status) return false;
      if (filters.product && !(r.productName || '').toLowerCase().includes(filters.product.toLowerCase())) return false;
      if (filters.sku && !(r.skuTitle || '').toLowerCase().includes(filters.sku.toLowerCase()) && !(r.barcode || '').includes(filters.sku)) return false;
      return true;
    });

    const num = (d: any) => (d == null ? 0 : Number(d));
    const lost = all.filter((r) => r.status === 'LOST');

    const totalItems = all.length;
    const totalQty = all.reduce((s, r) => s + (r.quantity || 0), 0);
    const totalSaleValue = all.reduce((s, r) => s + num(r.salePrice) * (r.quantity || 1), 0);
    const totalCostUsd = all.reduce((s, r) => s + num(r.costUsd) * (r.quantity || 1), 0);
    const lostItems = lost.length;
    const lostQty = lost.reduce((s, r) => s + (r.quantity || 0), 0);
    const lostCostUsd = lost.reduce((s, r) => s + num(r.costUsd) * (r.quantity || 1), 0);
    const lostSaleValue = lost.reduce((s, r) => s + num(r.salePrice) * (r.quantity || 1), 0);

    // Status bo'yicha taqsimot
    const byStatus: Record<string, number> = { RETURNED: 0, READY_FOR_PICKUP: 0, RECEIVED: 0, LOST: 0 };
    for (const r of all) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

    // Eng ko'p qaytarilgan mahsulotlar (qty bo'yicha)
    const prodMap = new Map<string, { name: string; sku: string; qty: number; saleValue: number }>();
    for (const r of all) {
      const k = (r.skuTitle || r.productName || r.uzumOrderId) as string;
      const e = prodMap.get(k) || { name: r.productName || '—', sku: r.skuTitle || '', qty: 0, saleValue: 0 };
      e.qty += r.quantity || 0;
      e.saleValue += num(r.salePrice) * (r.quantity || 1);
      prodMap.set(k, e);
    }
    const mostReturned = [...prodMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

    // Oylik dinamika (YYYY-MM)
    const monthMap = new Map<string, { qty: number; saleValue: number; lost: number }>();
    for (const r of all) {
      if (!r.returnedAt) continue;
      const d = new Date(r.returnedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const e = monthMap.get(key) || { qty: 0, saleValue: 0, lost: 0 };
      e.qty += r.quantity || 0;
      e.saleValue += num(r.salePrice) * (r.quantity || 1);
      if (r.status === 'LOST') e.lost += r.quantity || 0;
      monthMap.set(key, e);
    }
    const byMonth = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v }));

    // Qaytarish foizi: davrdagi sotilgan dona (lokal Order jadvalidan)
    const soldWhere: any = { order: { storeId } };
    if (rangeWhere.returnedAt) {
      soldWhere.order = { storeId, orderedAt: rangeWhere.returnedAt };
    }
    const soldAgg = await this.prisma.orderItem
      .aggregate({ _sum: { quantity: true }, where: soldWhere })
      .catch(() => ({ _sum: { quantity: null } }) as any);
    const soldQty = Number(soldAgg?._sum?.quantity || 0);
    const returnRate = soldQty > 0 ? (totalQty / soldQty) * 100 : null;

    return {
      analytics: {
        totalItems,
        totalQty,
        totalSaleValue,
        totalCostUsd,
        lostItems,
        lostQty,
        lostCostUsd,
        lostSaleValue,
        returnRate,
        soldQty,
        byStatus,
        mostReturned,
        byMonth,
      },
      // Jadval (filtrlangan) + alohida lost ro'yxati
      returns: list.map(this.toDto),
      lostReport: lost.map(this.toDto),
      lastSyncedAt: this.lastSync.get(storeId) || null,
    };
  }

  private toDto = (r: any) => ({
    id: r.id,
    returnId: r.publicId || r.uzumOrderId,
    publicId: r.publicId || null,
    uzumOrderId: r.uzumOrderId,
    productName: r.productName,
    skuTitle: r.skuTitle,
    barcode: r.barcode,
    quantity: r.quantity,
    costUsd: r.costUsd != null ? Number(r.costUsd) : null,
    salePrice: r.salePrice != null ? Number(r.salePrice) : null,
    reason: r.reason,
    status: r.status,
    manualReceived: r.manualReceived,
    orderedAt: r.orderedAt ? new Date(r.orderedAt).getTime() : null,
    returnedAt: r.returnedAt ? new Date(r.returnedAt).getTime() : null,
    receivedAt: r.receivedAt ? new Date(r.receivedAt).getTime() : null,
    daysWaiting: r.returnedAt ? Math.floor((Date.now() - new Date(r.returnedAt).getTime()) / 86_400_000) : null,
  });
}
