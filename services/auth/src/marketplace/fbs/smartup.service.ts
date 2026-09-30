import { Injectable, BadRequestException, ConflictException, BadGatewayException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../../common/database/prisma.service';
import { UzumApiClient } from '../../uzum/client/uzum-api.client';
import { StoresService } from '../stores/stores.service';

type SmartupPriceCache = {
  fetchedAt: number;
  prices: Map<string, { code: string; price: string }>;
};

type UzumProductsCache = {
  fetchedAt: number;
  products: any[];
};

type SmartupImportResult = {
  ok: boolean;
  alreadyImported?: boolean;
  import?: any;
};

type SmartupInvoiceImportResult = {
  ok: boolean;
  alreadyImported?: boolean;
  total: number;
  success: number;
  failed: number;
  aggregatedProducts: number;
  import?: any;
  results: Array<{ orderId: string; ok: boolean; alreadyImported?: boolean; error?: string; import?: any }>;
};

@Injectable()
export class SmartupService {
  private readonly logger = new Logger(SmartupService.name);
  private priceCache: SmartupPriceCache | null = null;
  private priceInflight: Promise<Map<string, { code: string; price: string }>> | null = null;
  private uzumProductsCache = new Map<string, UzumProductsCache>();
  private uzumProductsInflight = new Map<string, Promise<any[]>>();
  private readonly PRICE_TTL_MS = 10 * 60 * 1000;
  private readonly UZUM_PRODUCTS_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly uzumClient: UzumApiClient,
    private readonly storesService: StoresService,
  ) {}

  async getImportStatus(storeId: string, orderIds: Array<string | number>) {
    const ids = [...new Set(orderIds.filter((id) => id != null).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) return {};
    const rows = await this.prisma.smartupOrderImport.findMany({
      where: { storeId, uzumOrderId: { in: ids } },
      select: {
        uzumOrderId: true,
        smartupExternalId: true,
        smartupDealId: true,
        status: true,
        errorMessage: true,
        importedAt: true,
        updatedAt: true,
        payload: true,
      },
    });
    return rows.reduce<Record<string, any>>((acc, row) => {
      acc[row.uzumOrderId] = row;
      return acc;
    }, {});
  }

  async checkOrder(storeId: string, orderId: string | number) {
    const uzumOrderId = String(orderId ?? '').trim();
    if (!uzumOrderId) throw new BadRequestException('Order ID topilmadi');

    const existing = await this.prisma.smartupOrderImport.findUnique({
      where: { storeId_uzumOrderId: { storeId, uzumOrderId } },
    });
    const checkedAt = new Date();
    if (!existing) {
      return {
        ok: true,
        exists: false,
        state: 'NOT_IMPORTED' as const,
        uzumOrderId,
        smartupDealId: null,
        smartupExternalId: null,
        remoteStatus: null,
        checkedAt: checkedAt.toISOString(),
        message: 'Bu order hali Smartupga ko‘chirilmagan',
      };
    }

    const dealId = String(existing.smartupDealId ?? '').trim();
    const externalId = String(existing.smartupExternalId ?? '').trim();
    const filter = dealId ? { deal_id: this.smartupDealQueryValue(dealId) } : {};
    let data: any;
    try {
      const response = await this.client().post('/b/trade/txs/tdeal/order$export', filter);
      data = response.data;
    } catch (err: any) {
      throw new BadGatewayException(this.smartupErrorMessage(
        err?.response?.data,
        err?.message || 'Smartup orderini tekshirib bo‘lmadi',
      ));
    }
    if (Array.isArray(data?.errors) && data.errors.length) {
      throw new BadGatewayException(this.smartupErrorMessage(data, 'Smartup orderini tekshirib bo‘lmadi'));
    }
    if (!Array.isArray(data?.order)) {
      throw new BadGatewayException('Smartup order tekshiruvi noto‘g‘ri formatda javob berdi');
    }

    // deal_id is the only exact filter supported by the deployed Smartup API.
    // For uncertain legacy rows without a deal ID the export is scanned once
    // and matched by the short external ID generated during the import.
    const remoteOrder = data.order.find((row: any) => {
      if (dealId) {
        return String(row?.deal_id ?? '').trim() === dealId
          && (!externalId || String(row?.external_id ?? '').trim() === externalId);
      }
      return externalId && String(row?.external_id ?? '').trim() === externalId;
    });
    const remoteDealId = String(remoteOrder?.deal_id ?? '').trim();
    const exists = Boolean(remoteOrder && remoteDealId);
    const message = exists
      ? 'Order Smartupda mavjud'
      : 'Order Smartupda topilmadi yoki o‘chirilgan';

    await this.prisma.smartupOrderImport.updateMany({
      where: { storeId, smartupExternalId: existing.smartupExternalId },
      data: exists ? {
        status: 'SUCCESS',
        smartupDealId: remoteDealId,
        errorMessage: null,
      } : {
        status: 'NOT_FOUND',
        errorMessage: `${message}. Oxirgi tekshiruv: ${checkedAt.toISOString()}`,
      },
    });

    return {
      ok: true,
      exists,
      state: exists ? 'FOUND' as const : 'NOT_FOUND' as const,
      uzumOrderId,
      smartupDealId: exists ? remoteDealId : existing.smartupDealId,
      smartupExternalId: existing.smartupExternalId,
      remoteStatus: exists ? String(remoteOrder?.status ?? '').trim() || null : null,
      checkedAt: checkedAt.toISOString(),
      message,
    };
  }

  /**
   * Re-check every FBS invoice deal previously saved for this store.
   *
   * One invoice import is persisted once per Uzum order, so checking every DB
   * row would hit Smartup repeatedly for the same deal. Grouping by the shared
   * external ID keeps the operation bounded to one request per Smartup document.
   * A failure for one document is isolated and reported without hiding results
   * from the other documents.
   */
  async checkInvoiceImports(storeId: string) {
    const rows = await this.prisma.smartupOrderImport.findMany({
      where: { storeId },
      select: {
        uzumOrderId: true,
        uzumInvoiceId: true,
        smartupExternalId: true,
        smartupDealId: true,
        status: true,
      },
    });
    const candidates = rows.filter((row) => {
      const invoiceId = String(row.uzumInvoiceId ?? '').trim();
      return invoiceId
        && !invoiceId.startsWith('FBO:')
        && Boolean(String(row.smartupExternalId ?? '').trim())
        && Boolean(String(row.smartupDealId ?? '').trim())
        && ['SUCCESS', 'NOT_FOUND'].includes(String(row.status ?? ''));
    });
    const groups = new Map<string, typeof candidates>();
    for (const row of candidates) {
      const key = String(row.smartupExternalId).trim();
      const groupedRows = groups.get(key) || [];
      groupedRows.push(row);
      groups.set(key, groupedRows);
    }

    let foundDocuments = 0;
    let missingDocuments = 0;
    let failedDocuments = 0;
    const deletedByInvoice = new Map<string, {
      invoiceId: string;
      smartupDealId: string | null;
      smartupExternalId: string;
    }>();
    const errors: Array<{ invoiceId: string; message: string }> = [];
    const entries = [...groups.entries()];

    // A small amount of concurrency keeps a large history practical without
    // creating a burst of requests against the Smartup export endpoint.
    for (let offset = 0; offset < entries.length; offset += 4) {
      const batch = entries.slice(offset, offset + 4);
      await Promise.all(batch.map(async ([smartupExternalId, groupRows]) => {
        const representative = groupRows[0];
        const invoiceIds = [...new Set(groupRows
          .map((row) => String(row.uzumInvoiceId ?? '').trim())
          .filter(Boolean))];
        try {
          const result = await this.checkOrder(storeId, representative.uzumOrderId);
          if (result.exists) {
            foundDocuments += 1;
            return;
          }
          missingDocuments += 1;
          for (const invoiceId of invoiceIds) {
            deletedByInvoice.set(invoiceId, {
              invoiceId,
              smartupDealId: representative.smartupDealId
                ? String(representative.smartupDealId)
                : null,
              smartupExternalId,
            });
          }
        } catch (err: any) {
          failedDocuments += 1;
          errors.push({
            invoiceId: invoiceIds[0] || 'Noma’lum',
            message: String(err?.response?.message || err?.message || 'Smartup tekshiruvi bajarilmadi'),
          });
        }
      }));
    }

    const deletedInvoices = [...deletedByInvoice.values()]
      .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId, undefined, { numeric: true }));
    return {
      ok: failedDocuments === 0,
      checkedDocuments: entries.length,
      foundDocuments,
      missingDocuments,
      affectedInvoices: deletedInvoices.length,
      failedDocuments,
      skippedRows: rows.length - candidates.length,
      deletedInvoices,
      errors,
      checkedAt: new Date().toISOString(),
    };
  }

  async checkProducts(userId: string, storeId: string) {
    const [products, meta, prices] = await Promise.all([
      this.getCachedUzumProducts(userId, storeId),
      this.prisma.productMeta.findMany({ where: { storeId }, select: { skuId: true, xid: true } }),
      this.getSmartupPrices(true),
    ]);
    const xids = new Map(meta.map((row) => [row.skuId, row.xid?.trim()]));
    const rows = products.flatMap((product: any) => (product.skuList || []).map((sku: any) => {
      const skuId = String(sku.skuId ?? '');
      const xid = xids.get(skuId) || null;
      const price = xid ? this.priceForXid(prices, xid) : null;
      return { skuId, productId: String(product.productId ?? ''), title: String(sku.skuFullTitle || product.title || sku.skuTitle || 'Nomsiz'),
        xid, price: price?.price ?? null, status: !xid ? 'MISSING_XID' : !price ? 'MISSING_PRICE' : 'READY' };
    }));
    return { checkedAt: new Date().toISOString(), priceCheckedAt: new Date(this.priceCache!.fetchedAt).toISOString(),
      priceType: this.required('SMARTUP_PRICE_TYPE_CODE'), total: rows.length,
      ready: rows.filter((row) => row.status === 'READY').length,
      missingXid: rows.filter((row) => row.status === 'MISSING_XID').length,
      missingPrice: rows.filter((row) => row.status === 'MISSING_PRICE').length,
      rows };
  }

  async importOrder(
    userId: string,
    storeId: string,
    order: any,
    invoiceId?: number | string,
  ): Promise<SmartupImportResult> {
    const uzumOrderId = String(order?.orderId ?? order?.id ?? '');
    if (!uzumOrderId) throw new BadRequestException('Order ID topilmadi');

    let existing = await this.prisma.smartupOrderImport.findUnique({
      where: { storeId_uzumOrderId: { storeId, uzumOrderId } },
    });
    if (existing?.status === 'SUCCESS' && existing.smartupDealId && this.isSuccessfulImport(existing)) {
      // Local SUCCESS is only a cache. The Smartup document may have been
      // deleted by an operator, in which case this click must restore it rather
      // than permanently returning "already imported".
      const live = await this.checkOrder(storeId, uzumOrderId);
      if (live.exists) return { ok: true, alreadyImported: true, import: existing };
      existing = await this.prisma.smartupOrderImport.findUnique({
        where: { storeId_uzumOrderId: { storeId, uzumOrderId } },
      });
    }

    const items = order?.items || order?.orderItems || [];
    if (!items.length) throw new BadRequestException('Order mahsulotlari topilmadi');
    this.assertRetryable(existing);
    const generatedExternalId = this.externalId(`${storeId}:${uzumOrderId}`);
    const externalId = this.compatibleExternalId(existing?.smartupExternalId)
      ? existing.smartupExternalId
      : generatedExternalId;
    const invoiceKey = invoiceId == null ? null : String(invoiceId).trim() || null;

    let payload: any = null;
    let reserved = false;
    let definitiveRejection = false;
    let responseData: any = null;
    let ambiguousDealId: string | null = null;
    try {
      const smartupClientId = await this.storesService.resolveSmartupClientId(userId, storeId);
      const orderProducts = await this.buildOrderProducts(userId, storeId, items, externalId);
      // Smartup's KAUTH policy accepts a document only inside the operator's
      // current work-day window. Uzum orders may be imported months later, so
      // their historical creation/delivery dates cannot be document dates.
      const documentTimestamp = Date.now();

      payload = {
        order: [{
        filial_code: this.required('SMARTUP_FILIAL_CODE'),
        external_id: externalId,
        subfilial_code: '',
        delivery_number: externalId,
        delivery_date: this.dateOnly(documentTimestamp),
        room_code: this.required('SMARTUP_ROOM_CODE'),
        robot_code: this.required('SMARTUP_ROBOT_CODE'),
        deal_time: this.dateTime(documentTimestamp),
        status: this.orderStatus(),
        sales_manager_code: this.required('SMARTUP_SALES_MANAGER_CODE'),
        person_code: smartupClientId,
        currency_code: this.required('SMARTUP_CURRENCY_CODE'),
        owner_person_code: this.config.get<string>('SMARTUP_OWNER_PERSON_CODE') || smartupClientId,
        van_code: '',
        contract_code: '',
        note: this.compactNote('Uzum order', uzumOrderId),
        self_shipment: this.config.get<string>('SMARTUP_SELF_SHIPMENT') || 'Y',
        delivery_address_short: '',
        delivery_address_full: '',
        marking_attaching_method: '',
        invoice_number: externalId,
        expeditor_code: '',
        payment_type_code: '',
        order_products: orderProducts,
        order_gifts: [],
        order_actions: [],
        order_consignments: [],
        }],
      };

      const client = this.client();
      await this.reserveImports(storeId, [uzumOrderId], externalId, payload, invoiceKey);
      reserved = true;
      const response = await client.post('/b/trade/txs/tdeal/order$import', payload);
      const data = response.data;
      responseData = data;
      const success = this.matchSuccess(data, externalId);
      const dealId = success ? this.smartupSuccessId(success, externalId) : null;
      if (!success || !dealId) {
        definitiveRejection = Array.isArray(data?.errors) && data.errors.length > 0 && !data?.successes?.length;
        if (!definitiveRejection && Array.isArray(data?.successes) && data.successes.length) {
          ambiguousDealId = this.smartupSuccessId(data.successes[0], externalId) || null;
        }
        const message = this.smartupErrorMessage(data, 'Smartup order yaratildi degan javob qaytmadi');
        throw new BadRequestException(message);
      }

      const saved = await this.saveImport(
        storeId,
        uzumOrderId,
        invoiceKey,
        externalId,
        'SUCCESS',
        dealId,
        null,
        payload,
        data,
      );
      return { ok: true, import: saved };
    } catch (err: any) {
      const message = this.smartupErrorMessage(err?.response?.data, err?.message || 'Smartup import xatosi');
      if (reserved) {
        const confirmedDealId = await this.confirmDealFromFailedImport(err?.response?.data, externalId, payload);
        if (confirmedDealId) {
          const saved = await this.saveImport(
            storeId,
            uzumOrderId,
            invoiceKey,
            externalId,
            'SUCCESS',
            confirmedDealId,
            null,
            payload,
            responseData ?? err?.response?.data ?? null,
          );
          return { ok: true, import: saved };
        }
        const rejected = definitiveRejection || this.isOracleBufferError(message);
        const status = rejected ? 'ERROR' : 'REVIEW_REQUIRED';
        const safeMessage = rejected ? message : `Natija noaniq. Smartupda ${externalId} hujjatini tekshiring; avtomatik qayta yuborish bloklandi. ${message}`;
        await this.saveImport(
          storeId,
          uzumOrderId,
          invoiceKey,
          externalId,
          status,
          status === 'REVIEW_REQUIRED' ? ambiguousDealId : null,
          safeMessage,
          payload,
          responseData ?? err?.response?.data ?? null,
        ).catch(() => null);
        throw new BadGatewayException(safeMessage);
      }
      throw err;
    }
  }

  async importInvoiceOrders(
    userId: string,
    storeId: string,
    invoiceId: number | string,
    orders: any[],
    invoice?: any,
  ): Promise<SmartupInvoiceImportResult> {
    const invoiceKey = String(invoiceId ?? '').trim();
    if (!invoiceKey) throw new BadRequestException('Ta\'minlash ID topilmadi');

    const orderIds = (orders || [])
      .map((order: any) => String(order?.orderId ?? order?.id ?? ''))
      .filter(Boolean);
    if (!orderIds.length) throw new BadRequestException('Ta\'minlash ichida buyurtmalar topilmadi');

    const uniqueOrderIds = [...new Set(orderIds)];
    let existingRows = await this.prisma.smartupOrderImport.findMany({
      where: { storeId, uzumOrderId: { in: uniqueOrderIds } },
    });

    // Reconcile every previously submitted Smartup document before deciding
    // that an accepted Uzum order is already imported. This is intentionally
    // part of the send action: clearing a document in Smartup must make the
    // complete supply retryable without requiring a separate manual check.
    existingRows = await this.reconcileRemoteImports(storeId, existingRows, uniqueOrderIds);
    const existingByOrderId = new Map(existingRows.map((row) => [row.uzumOrderId, row]));
    const allAlreadyImported = uniqueOrderIds.every((orderId) => {
      const existing = existingByOrderId.get(orderId);
      return existing?.status === 'SUCCESS' && existing.smartupDealId && this.isSuccessfulImport(existing);
    });
    if (allAlreadyImported) {
      return {
        ok: true,
        alreadyImported: true,
        total: uniqueOrderIds.length,
        success: uniqueOrderIds.length,
        failed: 0,
        aggregatedProducts: this.countAggregatedImportedProducts(existingRows),
        import: existingRows[0],
        results: uniqueOrderIds.map((orderId) => ({
          orderId,
          ok: true,
          alreadyImported: true,
          import: existingByOrderId.get(orderId),
        })),
      };
    }

    const isAlreadyImported = (orderId: string): boolean => {
      const existing = existingByOrderId.get(orderId);
      return Boolean(existing?.status === 'SUCCESS' && existing.smartupDealId && this.isSuccessfulImport(existing));
    };
    for (const row of existingRows) this.assertRetryable(row);

    const remotelyImportedIds = uniqueOrderIds.filter(isAlreadyImported);
    if (remotelyImportedIds.length > 0 && remotelyImportedIds.length < uniqueOrderIds.length) {
      // Never split one Uzum supply across a live Smartup document and a new
      // document. The operator must remove/reset the old association first so
      // every accepted order can be validated and sent as one atomic payload.
      const documents = new Set(remotelyImportedIds
        .map((id) => existingByOrderId.get(id)?.smartupExternalId)
        .filter(Boolean));
      throw new ConflictException(
        `Ta’minlashning bir qismi Smartupda mavjud (${remotelyImportedIds.length}/${uniqueOrderIds.length}, ${documents.size} ta hujjat). `
        + 'Qolgan buyurtmalar alohida nakladnoy qilib yuborilmadi. Avval mavjud Smartup hujjatlarini o‘chiring yoki bog‘lanishlarni to‘liq reset qiling.',
      );
    }
    const uniqueOrders = new Map((orders || []).map((order: any) => [String(order?.orderId ?? order?.id ?? ''), order]));
    const ordersToImport = uniqueOrderIds.filter((id) => !isAlreadyImported(id)).map((id) => uniqueOrders.get(id));
    const importOrderIds = [...new Set(ordersToImport
      .map((order: any) => String(order?.orderId ?? order?.id ?? ''))
      .filter(Boolean))];

    const items = ordersToImport.flatMap((order: any) => order?.items || order?.orderItems || []);
    if (ordersToImport.some((order: any) => !(order?.items || order?.orderItems)?.length)) {
      throw new BadRequestException('Ta’minlashdagi ayrim buyurtmalarda mahsulotlar yo‘q. Uzum ma’lumotlarini yangilang.');
    }
    if (!items.length) throw new BadRequestException('Ta\'minlash mahsulotlari topilmadi');

    // A definitively rejected ERROR never created a Smartup document, so rows
    // left by older single-order or partial attempts may safely be regrouped
    // into one fresh invoice external ID. Ambiguous/remote states must retain
    // the strict guard to prevent duplicate Smartup documents.
    const retryIds = [...new Set(importOrderIds
      .map((id) => existingByOrderId.get(id)?.smartupExternalId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0))];
    const hasNewOrders = importOrderIds.some((id) => !existingByOrderId.has(id));
    const hasMismatchedGroups = retryIds.length > 1 || (retryIds.length > 0 && hasNewOrders);
    const existingRetryRows = importOrderIds
      .map((id) => existingByOrderId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const canRegroupRejectedRows = existingRetryRows.length > 0
      && existingRetryRows.every((row) => row.status === 'ERROR');
    const canRecheckDeletedRows = existingRetryRows.length > 0
      && existingRetryRows.every((row) => row.status === 'ERROR'
        || (row.status === 'NOT_FOUND' && Boolean(row.smartupExternalId?.trim())));
    if (hasMismatchedGroups && !canRegroupRejectedRows && !canRecheckDeletedRows) {
      throw new ConflictException('Avvalgi import guruhlari mos emas. Buyurtmalarni alohida tekshiring.');
    }
    // NOT_FOUND rows above were refreshed from Smartup in this same request,
    // so deleted legacy groups can now be safely regrouped under one invoice
    // external ID. A live document would have been restored to SUCCESS and
    // rejected by the partial-import guard before reaching this point.
    const generatedExternalId = this.externalInvoiceId(`${storeId}:${invoiceKey}:${[...importOrderIds].sort().join(',')}`);
    const retryId = retryIds[0];
    const externalId = !hasMismatchedGroups && this.compatibleExternalId(retryId)
      ? retryId
      : generatedExternalId;
    let payload: any = null;
    let reserved = false;
    let definitiveRejection = false;
    let responseData: any = null;
    let ambiguousDealId: string | null = null;
    let aggregatedProducts = 0;
    try {
      const smartupClientId = await this.storesService.resolveSmartupClientId(userId, storeId);
      const orderProducts = await this.buildOrderProducts(userId, storeId, items, externalId);
      aggregatedProducts = orderProducts.length;
      const documentTimestamp = Date.now();

      payload = {
        order: [{
        filial_code: this.required('SMARTUP_FILIAL_CODE'),
        external_id: externalId,
        subfilial_code: '',
        delivery_number: externalId,
        delivery_date: this.dateOnly(documentTimestamp),
        room_code: this.required('SMARTUP_ROOM_CODE'),
        robot_code: this.required('SMARTUP_ROBOT_CODE'),
        deal_time: this.dateTime(documentTimestamp),
        status: this.orderStatus(),
        sales_manager_code: this.required('SMARTUP_SALES_MANAGER_CODE'),
        person_code: smartupClientId,
        currency_code: this.required('SMARTUP_CURRENCY_CODE'),
        owner_person_code: this.config.get<string>('SMARTUP_OWNER_PERSON_CODE') || smartupClientId,
        van_code: '',
        contract_code: '',
        // Keep optional text deliberately short and ASCII-only. Some Smartup
        // installations copy this value into a small PL/SQL VARCHAR2 buffer.
        note: this.compactNote('Uzum invoice', invoiceKey),
        self_shipment: this.config.get<string>('SMARTUP_SELF_SHIPMENT') || 'Y',
        delivery_address_short: '',
        delivery_address_full: '',
        marking_attaching_method: '',
        invoice_number: externalId,
        expeditor_code: '',
        payment_type_code: '',
        order_products: orderProducts,
        order_gifts: [],
        order_actions: [],
        order_consignments: [],
        }],
      };

      const client = this.client();
      await this.reserveImports(storeId, importOrderIds, externalId, payload, invoiceKey);
      reserved = true;
      const response = await client.post('/b/trade/txs/tdeal/order$import', payload);
      const data = response.data;
      responseData = data;
      const success = this.matchSuccess(data, externalId);
      const dealId = success ? this.smartupSuccessId(success, externalId) : null;
      if (!success || !dealId) {
        definitiveRejection = Array.isArray(data?.errors) && data.errors.length > 0 && !data?.successes?.length;
        if (!definitiveRejection && Array.isArray(data?.successes) && data.successes.length) {
          ambiguousDealId = this.smartupSuccessId(data.successes[0], externalId) || null;
        }
        const message = this.smartupErrorMessage(data, 'Smartup order yaratildi degan javob qaytmadi');
        throw new BadRequestException(message);
      }

      const savedRows = await this.prisma.$transaction(async (tx) => Promise.all(importOrderIds.map((orderId) =>
        this.saveImport(storeId, orderId, invoiceKey, externalId, 'SUCCESS', dealId, null, payload, data, tx),
      )));
      const savedByOrderId = new Map(importOrderIds.map((orderId, index) => [orderId, savedRows[index]] as const));

      return {
        ok: true,
        total: uniqueOrderIds.length,
        success: uniqueOrderIds.length,
        failed: 0,
        aggregatedProducts: orderProducts.length,
        import: savedRows[0],
        results: uniqueOrderIds.map((orderId) => ({
          orderId,
          ok: true,
          alreadyImported: isAlreadyImported(orderId),
          import: savedByOrderId.get(orderId) || existingByOrderId.get(orderId),
        })),
      };
    } catch (err: any) {
      const message = this.smartupErrorMessage(err?.response?.data, err?.message || 'Smartup import xatosi');
      if (reserved) {
        const confirmedDealId = await this.confirmDealFromFailedImport(err?.response?.data, externalId, payload);
        if (confirmedDealId) {
          const savedRows = await this.prisma.$transaction(async (tx) => Promise.all(importOrderIds.map((orderId) =>
            this.saveImport(
              storeId,
              orderId,
              invoiceKey,
              externalId,
              'SUCCESS',
              confirmedDealId,
              null,
              payload,
              responseData ?? err?.response?.data ?? null,
              tx,
            ),
          )));
          const savedByOrderId = new Map(importOrderIds.map((orderId, index) => [orderId, savedRows[index]] as const));
          return {
            ok: true,
            total: uniqueOrderIds.length,
            success: uniqueOrderIds.length,
            failed: 0,
            aggregatedProducts,
            import: savedRows[0],
            results: uniqueOrderIds.map((orderId) => ({
              orderId,
              ok: true,
              alreadyImported: isAlreadyImported(orderId),
              import: savedByOrderId.get(orderId) || existingByOrderId.get(orderId),
            })),
          };
        }
        const rejected = definitiveRejection || this.isOracleBufferError(message);
        const status = rejected ? 'ERROR' : 'REVIEW_REQUIRED';
        const safeMessage = rejected ? message : `Natija noaniq. Smartupda ${externalId} hujjatini tekshiring; avtomatik qayta yuborish bloklandi. ${message}`;
        await Promise.all(importOrderIds.map((orderId) =>
          this.saveImport(
            storeId,
            orderId,
            invoiceKey,
            externalId,
            status,
            status === 'REVIEW_REQUIRED' ? ambiguousDealId : null,
            safeMessage,
            payload,
            responseData ?? err?.response?.data ?? null,
          ).catch(() => null),
        ));
        throw new BadGatewayException(safeMessage);
      }
      throw err;
    }
  }

  private async buildOrderProducts(userId: string, storeId: string, items: any[], lineExternalPrefix: string) {
    const productCodes = await this.resolveProductCodes(userId, storeId, items);
    const prices = await this.getSmartupPrices();
    const groups = new Map<string, { productCode: string; price: string; quantity: number }>();
    const failures: string[] = [];

    for (const item of items) {
      const productId = String(item?.productId ?? '');
      const skuId = String(item?.skuId ?? item?.productSkuId ?? '');
      const skuTitle = String(item?.skuTitle ?? '');
      const title = String(item?.title ?? '');
      const barcode = String(item?.barcode ?? item?.barCode ?? '');
      const productCode =
        (skuId ? productCodes.bySkuId.get(skuId) : undefined) ||
        (barcode ? productCodes.byBarcode.get(barcode) : undefined) ||
        (!skuId && !barcode ? (
          this.lookupTitle(productCodes.byTitle, `${title} ${skuTitle}`) ||
          this.lookupTitle(productCodes.byTitle, skuTitle) ||
          this.lookupTitle(productCodes.byTitle, title)
        ) : undefined);
      if (!productCode) {
        failures.push(`${item?.title || skuTitle || productId || 'Mahsulot'}: SKU XID kiritilmagan`);
        continue;
      }
      const priceEntry = this.priceForXid(prices, productCode);
      if (!priceEntry) {
        failures.push(`${productCode}: Smartup narxi topilmadi`);
        continue;
      }

      const key = priceEntry.code;
      const existing = groups.get(key);
      const quantity = Number(item?.amount ?? item?.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        failures.push(`${productCode}: mahsulot miqdori musbat son bo‘lishi kerak`);
        continue;
      }
      if (existing) {
        existing.quantity += quantity;
      } else {
        groups.set(key, { productCode: priceEntry.code, price: priceEntry.price, quantity });
      }
    }

    // Atomic preflight: Smartup is not called unless every Uzum order line is
    // resolvable and valid. This prevents a document from being created with a
    // silently omitted product when just one SKU cannot be prepared.
    if (failures.length) {
      const details = failures.slice(0, 5).join('; ');
      const more = failures.length > 5 ? `; yana ${failures.length - 5} ta xato` : '';
      throw new BadRequestException(
        `Smartupga yuborilmadi: ${failures.length} ta mahsulotda xato. ${details}${more}. Barcha xatolarni tuzatib, qayta yuboring.`,
      );
    }
    if (!groups.size) throw new BadRequestException('Smartupga yuborilmadi: yuboriladigan mahsulot topilmadi');

    return [...groups.values()].map((group, index) => ({
      // Do not append to the document id: that previously produced 28+ char
      // values and triggers ORA-06502 on Smartup installations with a small
      // PL/SQL external-id buffer.
      external_id: this.compactExternalId('UL', `${lineExternalPrefix}:${index + 1}`),
      product_unit_id: '',
      inventory_kind: 'G',
      warehouse_code: this.required('SMARTUP_WAREHOUSE_CODE'),
      product_code: group.productCode,
      serial_number: '',
      card_code: '',
      expiry_date: '',
      on_balance: '',
      order_quant: String(group.quantity),
      price_type_code: this.required('SMARTUP_PRICE_TYPE_CODE'),
      product_price: group.price,
      margin_kind: '',
      margin_value: '',
      margin_amount: '',
      vat_percent: '',
    }));
  }

  /**
   * Refresh locally final-looking rows against Smartup and return fresh DB
   * state. Requests are grouped by external ID, therefore a 20-order invoice
   * still needs only one Smartup lookup.
   */
  private async reconcileRemoteImports(storeId: string, rows: any[], orderIds: string[]): Promise<any[]> {
    const candidates = rows.filter((row) => {
      const status = String(row?.status ?? '');
      // REVIEW_REQUIRED is deliberately quarantined. An ambiguous/mixed
      // Smartup response may already have created a remote document, so the
      // send action must never turn it into NOT_FOUND and retry automatically.
      // It can only be resolved through the explicit read-only check flow.
      const shouldCheck = status === 'SUCCESS' || status === 'NOT_FOUND';
      return shouldCheck && Boolean(String(row?.smartupExternalId ?? '').trim());
    });
    const representatives = new Map<string, any>();
    for (const row of candidates) {
      const externalId = String(row.smartupExternalId).trim();
      if (!representatives.has(externalId)) representatives.set(externalId, row);
    }

    // Keep pressure on the Smartup export endpoint bounded while still making
    // multi-document legacy invoices practical to repair.
    const entries = [...representatives.values()];
    for (let offset = 0; offset < entries.length; offset += 4) {
      await Promise.all(entries.slice(offset, offset + 4).map((row) =>
        this.checkOrder(storeId, row.uzumOrderId),
      ));
    }

    if (!entries.length) return rows;
    return this.prisma.smartupOrderImport.findMany({
      where: { storeId, uzumOrderId: { in: orderIds } },
    });
  }

  private saveImport(
    storeId: string,
    uzumOrderId: string,
    uzumInvoiceId: string | null,
    externalId: string,
    status: 'SUCCESS' | 'ERROR' | 'PROCESSING' | 'REVIEW_REQUIRED',
    dealId: string | null,
    errorMessage: string | null,
    payload: any,
    response: any,
    db: Pick<PrismaService, 'smartupOrderImport'> = this.prisma,
  ) {
    return db.smartupOrderImport.upsert({
      where: { storeId_uzumOrderId: { storeId, uzumOrderId } },
      create: {
        storeId,
        uzumOrderId,
        uzumInvoiceId,
        smartupExternalId: externalId,
        smartupDealId: dealId,
        status,
        errorMessage,
        payload,
        response,
      },
      update: {
        uzumInvoiceId,
        smartupExternalId: externalId,
        smartupDealId: dealId,
        status,
        errorMessage,
        payload,
        response,
        importedAt: new Date(),
      },
    });
  }

  private isSuccessfulImport(row: any): boolean {
    return row?.status === 'SUCCESS' && Boolean(row?.smartupDealId);
  }

  private assertRetryable(row: any) {
    if (row?.status === 'REVIEW_REQUIRED' && this.isOracleBufferError(row?.errorMessage)) return;
    if (row && ['PROCESSING', 'REVIEW_REQUIRED'].includes(row.status)) {
      throw new ConflictException(row.errorMessage || `Smartup ${row.smartupExternalId}: import bajarilmoqda yoki tekshiruv kutilmoqda. Qayta yubormang.`);
    }
  }

  private async reserveImports(
    storeId: string,
    orderIds: string[],
    externalId: string,
    payload: any,
    invoiceId: string | null,
  ) {
    // A short PostgreSQL transaction coordinates all app instances. No HTTP
    // request runs while the lock is held; persisted PROCESSING rows survive crashes.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('smartup-import'), hashtext(${storeId}))::text`;
      const rows = await tx.smartupOrderImport.findMany({ where: { storeId, uzumOrderId: { in: orderIds } } });
      for (const row of rows) {
        this.assertRetryable(row);
        if (this.isSuccessfulImport(row)) throw new ConflictException('Buyurtma allaqachon import qilingan. Ro‘yxatni yangilang.');
      }
      const related = await tx.smartupOrderImport.findMany({ where: { storeId, smartupExternalId: externalId } });
      if (related.some((row) => !orderIds.includes(row.uzumOrderId))) {
        throw new ConflictException('Avvalgi nakladnoy tarkibini qisman qayta yuborish mumkin emas. Smartup hujjatini tekshiring.');
      }
      for (const id of orderIds) await this.saveImport(storeId, id, invoiceId, externalId, 'PROCESSING', null, null, payload, null, tx);
    }, { timeout: 15_000 });
  }

  private matchSuccess(data: any, externalId: string) {
    if (!Array.isArray(data?.successes) || data.successes.length !== 1 || data?.errors?.length) return null;
    const success = data.successes[0];
    if (success?.external_id != null && String(success.external_id) !== externalId) return null;
    return success;
  }

  private orderStatus(): string {
    const value = this.config.get<string>('SMARTUP_ORDER_STATUS');
    return !value || value === 'B' ? 'B#N' : value;
  }

  private async resolveProductCodes(userId: string, storeId: string, items: any[]) {
    const rows = await this.prisma.productMeta.findMany({
      where: { storeId, xid: { not: null } },
      select: { skuId: true, productId: true, xid: true },
    });
    const xidBySkuId = new Map(rows.filter((row) => row.xid?.trim()).map((row) => [row.skuId, row.xid!.trim()] as const));
    if (items.every((item) => xidBySkuId.has(String(item?.skuId ?? item?.productSkuId ?? '')))) {
      return { bySkuId: xidBySkuId, byBarcode: new Map<string, string>(), byTitle: new Map<string, string>() };
    }
    const products = await this.getCachedUzumProducts(userId, storeId).catch((err: any) => {
      this.logger.warn(`Smartup product title map failed: ${err?.message}`);
      return [] as any[];
    });
    const bySkuId = new Map<string, string>();
    const byBarcode = new Map<string, string>();
    const barcodeCandidates = new Map<string, Set<string>>();
    const titleCandidates = new Map<string, Set<string>>();
    const byProductCandidates = new Map<string, Set<string>>();
    const addTitle = (title: any, xid: string) => {
      const key = this.normalizeText(title);
      if (!key) return;
      if (!titleCandidates.has(key)) titleCandidates.set(key, new Set());
      titleCandidates.get(key)!.add(xid);
    };
    for (const row of rows) {
      if (!row.xid?.trim()) continue;
      bySkuId.set(row.skuId, row.xid.trim());
      if (row.productId) {
        if (!byProductCandidates.has(row.productId)) byProductCandidates.set(row.productId, new Set());
        byProductCandidates.get(row.productId)!.add(row.xid);
      }
    }
    for (const product of products) {
      const productTitle = product?.title ?? product?.productTitle ?? product?.name;
      for (const sku of product?.skuList || []) {
        const sid = sku?.skuId != null ? String(sku.skuId) : '';
        // Include unmapped variants in ambiguity checks, so a shared product
        // title can never silently select the only configured variant.
        const xid = (sid ? xidBySkuId.get(sid) : undefined) || '';
        for (const barcode of [sku?.barcode, sku?.barCode].filter(Boolean)) {
          const key = String(barcode);
          if (!barcodeCandidates.has(key)) barcodeCandidates.set(key, new Set());
          barcodeCandidates.get(key)!.add(xid);
        }
        if (sid && xid) bySkuId.set(sid, xid);
        addTitle(sku?.skuFullTitle, xid);
        addTitle(sku?.skuTitle, xid);
        addTitle(productTitle, xid);
        addTitle(`${productTitle || ''} ${sku?.skuTitle || ''}`, xid);
      }
    }
    for (const item of items) {
      const sid = String(item?.skuId ?? item?.productSkuId ?? '');
      const xid = sid ? bySkuId.get(sid) : undefined;
      if (!xid) continue;
      addTitle(item?.skuTitle, xid);
      addTitle(item?.title, xid);
      addTitle(`${item?.title || ''} ${item?.skuTitle || ''}`, xid);
    }
    const byProductId = new Map<string, string>();
    for (const [productId, set] of byProductCandidates) {
      if (set.size === 1) byProductId.set(productId, [...set][0]);
    }
    const byTitle = new Map<string, string>();
    for (const [title, set] of titleCandidates) {
      if (set.size === 1 && [...set][0]) byTitle.set(title, [...set][0]);
    }
    for (const [barcode, set] of barcodeCandidates) {
      if (set.size === 1 && [...set][0]) byBarcode.set(barcode, [...set][0]);
    }
    return { bySkuId, byBarcode, byTitle, byProductId };
  }

  private lookupTitle(map: Map<string, string>, value: any) {
    const key = this.normalizeText(value);
    return key ? map.get(key) : undefined;
  }

  private normalizeText(value: any): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[’'`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeCode(value: any): string {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[’'`]/g, "'")
      .replace(/\s+/g, '');
  }

  private async getCachedUzumProducts(userId: string, storeId: string): Promise<any[]> {
    const key = `${userId}:${storeId}`;
    const cached = this.uzumProductsCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < this.UZUM_PRODUCTS_TTL_MS) return cached.products;

    const inflight = this.uzumProductsInflight.get(key);
    if (inflight) return inflight;

    const request = (async () => {
      const { uzumShopId, apiKey } = await this.storesService.getStoreCredentials(userId, storeId);
      const products = await this.uzumClient.getAllProducts(storeId, apiKey, uzumShopId);
      this.uzumProductsCache.set(key, { fetchedAt: Date.now(), products });
      return products;
    })().finally(() => this.uzumProductsInflight.delete(key));

    this.uzumProductsInflight.set(key, request);
    return request;
  }

  /** Accept known response identifiers, never manufacture one for an empty response. */
  private smartupSuccessId(success: any, _externalId: string): string {
    if (typeof success === 'string' || typeof success === 'number') return String(success).trim();
    const value = success?.deal_id
      ?? success?.dealId
      ?? success?.deal?.id
      ?? success?.data?.deal_id
      ?? success?.data?.dealId
      ?? success?.code
      ?? success?.id;
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }

  private smartupErrorMessage(data: any, fallback: string): string {
    const error = data?.errors?.[0];
    return String(error?.message || error?.code || data?.message || fallback);
  }

  /**
   * Some Smartup imports create the deal successfully and then return HTTP 500
   * while inserting an auxiliary mdeal_origin_headers row. The raw Oracle
   * message contains the newly created deal_id. Confirm that exact deal and
   * external_id through the read-only export endpoint before recording success.
   * Never infer success from the error text alone.
   */
  private async confirmDealFromFailedImport(data: any, externalId: string, payload: any): Promise<string | null> {
    const raw = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    if (!/mdeal_origin_headers\s+dup\s+val/i.test(raw)) return null;
    const match = raw.match(/\bdeal_id\s*=\s*(\d+)\b/i);
    const candidateDealId = String(match?.[1] ?? '').trim();
    if (!candidateDealId) return null;

    try {
      const response = await this.client().post('/b/trade/txs/tdeal/order$export', {
        deal_id: this.smartupDealQueryValue(candidateDealId),
      });
      if (Array.isArray(response.data?.errors) && response.data.errors.length) return null;
      const remote = Array.isArray(response.data?.order)
        ? response.data.order.find((row: any) =>
          String(row?.deal_id ?? '').trim() === candidateDealId
          && String(row?.external_id ?? '').trim() === externalId,
        )
        : null;
      return remote && this.smartupOrderMatchesPayload(remote, payload, externalId)
        ? candidateDealId
        : null;
    } catch {
      return null;
    }
  }

  /**
   * A matching header is not enough for accounting: Smartup must contain the
   * same client and every requested product code, quantity and price. This
   * prevents an incomplete remote document from being promoted to SUCCESS.
   */
  private smartupOrderMatchesPayload(remote: any, payload: any, externalId: string): boolean {
    const expected = Array.isArray(payload?.order)
      ? payload.order.find((row: any) => String(row?.external_id ?? '').trim() === externalId)
      : null;
    if (!expected || String(remote?.external_id ?? '').trim() !== externalId) return false;
    if (String(remote?.person_code ?? '').trim() !== String(expected?.person_code ?? '').trim()) return false;

    const signature = (rows: any): string[] | null => {
      if (!Array.isArray(rows) || !rows.length) return null;
      const grouped = new Map<string, { quantity: number; price: number }>();
      for (const row of rows) {
        const code = String(row?.product_code ?? '').trim();
        const quantity = Number(row?.order_quant ?? row?.quantity);
        const price = Number(row?.product_price ?? row?.price);
        if (!code || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) return null;
        const current = grouped.get(code);
        if (current && Math.abs(current.price - price) > 0.000001) return null;
        grouped.set(code, { quantity: (current?.quantity ?? 0) + quantity, price });
      }
      return [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([code, value]) => `${code}\u0000${value.quantity}\u0000${value.price}`);
    };

    const expectedProducts = signature(expected.order_products);
    const remoteProducts = signature(remote.order_products);
    return Boolean(expectedProducts && remoteProducts
      && expectedProducts.length === remoteProducts.length
      && expectedProducts.every((value, index) => value === remoteProducts[index]));
  }

  private isOracleBufferError(value: any): boolean {
    return /ORA-06502|character string buffer too small/i.test(String(value ?? ''));
  }

  private smartupDealQueryValue(value: string): string | number {
    const numeric = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(numeric) ? numeric : value;
  }

  private async getSmartupPrices(force = false) {
    const now = Date.now();
    if (!force && this.priceCache && now - this.priceCache.fetchedAt < this.PRICE_TTL_MS) {
      return this.priceCache.prices;
    }
    if (this.priceInflight) return this.priceInflight;
    this.priceInflight = this.fetchSmartupPrices().catch((err) => {
      if (err instanceof BadRequestException || err instanceof BadGatewayException) throw err;
      throw new BadGatewayException('Smartup narxlarini olib bo‘lmadi. Ulanish va API ruxsatlarini tekshiring.');
    }).finally(() => { this.priceInflight = null; });
    return this.priceInflight;
  }

  private async fetchSmartupPrices() {
    const priceType = this.required('SMARTUP_PRICE_TYPE_CODE');
    const response = await this.client().post('/b/anor/api/v2/mkf/product_price$export', {
      price_type_codes: [priceType],
    });
    if (!Array.isArray(response.data?.inventory) || response.data?.errors?.length) {
      throw new BadGatewayException(this.smartupErrorMessage(response.data, 'Smartup narxlar javobi noto‘g‘ri formatda'));
    }
    const prices = new Map<string, { code: string; price: string }>();
    const aliases = new Map<string, Array<{ code: string; price: string }>>();
    for (const item of response.data.inventory) {
      const code = String(item?.inventory_code || '').trim();
      if (!Array.isArray(item?.price_type)) continue;
      const priceRow = (item?.price_type || []).find((p: any) => String(p?.price_type_code) === priceType);
      if (code && priceRow?.price != null && String(priceRow.price).trim() && Number.isFinite(Number(priceRow.price)) && Number(priceRow.price) >= 0) {
        const entry = { code, price: String(priceRow.price) };
        prices.set(code, entry);
        const normalized = this.normalizeCode(code);
        if (!aliases.has(normalized)) aliases.set(normalized, []);
        aliases.get(normalized)!.push(entry);
      }
    }
    for (const [key, entries] of aliases) {
      if (entries.length === 1) prices.set(`alias:${key}`, entries[0]);
    }
    this.priceCache = { fetchedAt: Date.now(), prices };
    return prices;
  }

  private priceForXid(prices: Map<string, { code: string; price: string }>, xid: string) {
    return prices.get(xid) || prices.get(`alias:${this.normalizeCode(xid)}`);
  }

  private client(): AxiosInstance {
    const username = this.required('SMARTUP_USERNAME');
    const password = this.required('SMARTUP_PASSWORD');
    return axios.create({
      baseURL: this.config.get<string>('SMARTUP_BASE_URL') || 'https://smartup.online',
      timeout: 60_000,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        project_code: this.required('SMARTUP_PROJECT_CODE'),
        filial_id: this.required('SMARTUP_FILIAL_ID'),
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });
  }

  private required(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new BadRequestException(`${key} sozlanmagan`);
    return value;
  }

  private externalId(orderId: string): string {
    return this.compactExternalId('UZ', orderId);
  }

  private externalInvoiceId(invoiceId: string): string {
    return this.compactExternalId('UZI', invoiceId);
  }

  /** Smartup's import package uses short PL/SQL buffers on some deployments. */
  private compactExternalId(prefix: string, seed: string): string {
    const maxLength = 20;
    const digestLength = maxLength - prefix.length;
    return `${prefix}${createHash('sha256').update(seed).digest('hex').slice(0, digestLength).toUpperCase()}`;
  }

  private compatibleExternalId(value: any): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(value);
  }

  private compactNote(prefix: string, value: any): string {
    const safeValue = String(value ?? '').replace(/[^\x20-\x7E]/g, '').trim();
    return `${prefix} ${safeValue}`.slice(0, 40);
  }

  private countAggregatedImportedProducts(rows: any[]): number {
    const products = rows.find((row) => Array.isArray(row?.payload?.order?.[0]?.order_products))
      ?.payload?.order?.[0]?.order_products;
    return Array.isArray(products) ? products.length : 0;
  }

  private dateOnly(value: any): string {
    const parts = this.dateParts(value);
    return `${parts.day}.${parts.month}.${parts.year}`;
  }

  private dateTime(value: any): string {
    const parts = this.dateParts(value);
    return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
  }

  private dateParts(value: any): Record<string, string> {
    const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value));
    const timestamp = numeric ? Number(value) : value;
    const d = new Date(numeric && timestamp < 1e12 ? timestamp * 1000 : timestamp);
    if (value == null || !Number.isFinite(d.getTime())) throw new BadRequestException('Smartup uchun sana noto‘g‘ri');
    return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((part) => [part.type, part.value]));
  }
}
