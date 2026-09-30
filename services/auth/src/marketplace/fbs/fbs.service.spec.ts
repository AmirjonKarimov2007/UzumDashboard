import { FbsService } from './fbs.service';

describe('FbsService authoritative Smartup source', () => {
  function fixture() {
    const authoritative = { orderId: '42', items: [{ skuId: 'sku-1', amount: 2 }] };
    const uzum = {
      getFbsInvoiceById: jest.fn().mockResolvedValue({
        id: 'invoice', number: '100', numberOrders: 1, numberAcceptedOrders: 1, dateCreated: Date.now(),
      }),
      getFbsInvoiceOrders: jest.fn().mockResolvedValue([authoritative]),
      getOrderById: jest.fn().mockResolvedValue({ id: '42', status: 'COMPLETED', invoiceNumber: 100 }),
    };
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test', uzumShopId: 'shop' }) };
    const smartup = { importOrder: jest.fn().mockResolvedValue({ ok: true }) };
    const service = new FbsService(uzum as any, stores as any, {} as any, smartup as any);
    jest.spyOn(service as any, 'waitForAcceptedOrderLookup').mockResolvedValue(undefined);
    return { authoritative, uzum, stores, smartup, service };
  }
  it('loads order contents from the requested invoice on the server', async () => {
    const { service, authoritative, smartup, uzum } = fixture();
    await service.importOrderToSmartup('user', 'store', '42', 'invoice');
    expect(uzum.getFbsInvoiceOrders).toHaveBeenCalledWith('store', 'test', 'invoice');
    expect(smartup.importOrder).toHaveBeenCalledWith('user', 'store', authoritative, 'invoice');
  });
  it('refuses orders that do not belong to the invoice', async () => {
    const { service, smartup } = fixture();
    await expect(service.importOrderToSmartup('user', 'store', 'missing', 'invoice')).rejects.toThrow('topilmadi');
    expect(smartup.importOrder).not.toHaveBeenCalled();
  });
  it('checks store access before fetching or importing', async () => {
    const { service, stores, uzum, smartup } = fixture();
    stores.getStoreCredentials.mockRejectedValue(new Error('Forbidden'));
    await expect(service.importOrderToSmartup('user', 'store', '42', 'invoice')).rejects.toThrow('Forbidden');
    expect(uzum.getFbsInvoiceOrders).not.toHaveBeenCalled();
    expect(smartup.importOrder).not.toHaveBeenCalled();
  });
});

describe('FbsService accepted invoice Smartup filtering', () => {
  function fixture(acceptedCount = 2, prisma?: any) {
    const invoice = {
      id: 'invoice-1',
      number: '120001078557',
      numberOrders: 3,
      numberAcceptedOrders: acceptedCount,
      dateCreated: Date.parse('2026-09-01T10:00:00Z'),
    };
    const invoiceOrders = [
      { orderId: '1', items: [{ skuId: 'sku-1', amount: 1 }] },
      { orderId: '2', items: [{ skuId: 'sku-2', amount: 1 }] },
      { orderId: '3', items: [{ skuId: 'sku-3', amount: 1 }] },
    ];
    const uzum = {
      getFbsInvoiceById: jest.fn().mockResolvedValue(invoice),
      getFbsInvoiceOrders: jest.fn().mockResolvedValue(invoiceOrders),
      getOrderById: jest.fn(async (_store, _key, orderId) => {
        if (String(orderId) === '1') return { id: '1', status: 'COMPLETED', invoiceNumber: 120001078557 };
        if (String(orderId) === '2') return { id: '2', status: 'RETURNED', invoiceNumber: 120001078557 };
        return { id: String(orderId), status: 'PACKING', invoiceNumber: 120001078557 };
      }),
    };
    const stores = {
      getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test', uzumShopId: 'shop-1' }),
    };
    const smartup = {
      importInvoiceOrders: jest.fn().mockResolvedValue({
        ok: true, total: acceptedCount, success: acceptedCount, failed: 0, results: [],
      }),
      importOrder: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new FbsService(uzum as any, stores as any, {} as any, smartup as any, prisma);
    jest.spyOn(service as any, 'waitForAcceptedOrderLookup').mockResolvedValue(undefined);
    return { service, uzum, smartup, invoice, invoiceOrders };
  }

  function savedLinks() {
    const rows = [
      { storeId: 'store', uzumOrderId: '1', uzumInvoiceId: 'old-invoice', status: 'SUCCESS', smartupDealId: 'deal-1' },
      { storeId: 'store', uzumOrderId: '2', uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupDealId: 'deal-2' },
      { storeId: 'store', uzumOrderId: '3', uzumInvoiceId: 'invoice-1', status: 'NOT_FOUND', smartupDealId: 'old-deal' },
      { storeId: 'other-store', uzumOrderId: '3', uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupDealId: 'other-deal' },
    ];
    const updateMany = jest.fn(({ where, data }) => async () => {
      for (const row of rows) {
        if (row.storeId !== where.storeId) continue;
        if (where.uzumInvoiceId && row.uzumInvoiceId !== where.uzumInvoiceId) continue;
        if (where.status && row.status !== where.status) continue;
        if (where.uzumOrderId.in && !where.uzumOrderId.in.includes(row.uzumOrderId)) continue;
        if (where.uzumOrderId.notIn && where.uzumOrderId.notIn.includes(row.uzumOrderId)) continue;
        Object.assign(row, data);
      }
    });
    const prisma = {
      smartupOrderImport: { updateMany },
      $transaction: jest.fn(async (operations) => { for (const operation of operations) await operation(); }),
    };
    return { prisma, rows };
  }

  it('relinks successful accepted orders and removes stale supply links without losing deal history', async () => {
    const { prisma, rows } = savedLinks();
    const { service } = fixture(2, prisma);
    await service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1');
    expect(rows[0].uzumInvoiceId).toBe('invoice-1');
    expect(rows[1].uzumInvoiceId).toBe('invoice-1');
    expect(rows[2]).toMatchObject({ uzumInvoiceId: null, status: 'NOT_FOUND', smartupDealId: 'old-deal' });
    expect(rows[3]).toMatchObject({ uzumInvoiceId: 'invoice-1', smartupDealId: 'other-deal' });
  });

  it('preserves invoice links when the import fails', async () => {
    const { prisma, rows } = savedLinks();
    const { service, smartup } = fixture(2, prisma);
    smartup.importInvoiceOrders.mockRejectedValue(new Error('Smartup rejected'));
    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1')).rejects.toThrow('Smartup rejected');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(rows[0].uzumInvoiceId).toBe('old-invoice');
    expect(rows[2].uzumInvoiceId).toBe('invoice-1');
  });

  it('sends only orders that Uzum has accepted from a partial supply', async () => {
    const { service, smartup, invoice } = fixture(2);

    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1')).resolves.toMatchObject({
      invoiceOrders: 3,
      acceptedOrders: 2,
      skippedOrders: 1,
    });
    expect(smartup.importInvoiceOrders).toHaveBeenCalledWith(
      'user',
      'store',
      'invoice-1',
      [
        expect.objectContaining({ orderId: '1' }),
        expect.objectContaining({ orderId: '2' }),
      ],
      invoice,
    );
  });

  it('marks accepted and unaccepted orders explicitly in the supply detail', async () => {
    const { service } = fixture(2);

    await expect(service.getInvoiceOrders('user', 'store', 'invoice-1')).resolves.toMatchObject({
      acceptanceSummary: { total: 3, accepted: 2, notAccepted: 1 },
      orders: [
        expect.objectContaining({ orderId: '1', acceptedInThisInvoice: true, supplyAcceptanceStatus: 'ACCEPTED' }),
        expect.objectContaining({ orderId: '2', acceptedInThisInvoice: true, supplyAcceptanceStatus: 'ACCEPTED' }),
        expect.objectContaining({ orderId: '3', acceptedInThisInvoice: false, supplyAcceptanceStatus: 'NOT_ACCEPTED' }),
      ],
    });
  });

  it('does not call Smartup when the supply has zero accepted orders', async () => {
    const { service, uzum, smartup } = fixture(0);

    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1'))
      .rejects.toThrow("topshirilgan buyurtma yo‘q");
    expect(uzum.getOrderById).not.toHaveBeenCalled();
    expect(smartup.importInvoiceOrders).not.toHaveBeenCalled();
  });

  it('aborts the whole import when Uzum accepted count cannot be resolved exactly', async () => {
    const { service, uzum, smartup } = fixture(2);
    uzum.getOrderById.mockImplementation(async (_store, _key, orderId) => ({
      id: String(orderId),
      status: String(orderId) === '1' ? 'COMPLETED' : 'PACKING',
      invoiceNumber: 120001078557,
    }));

    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1'))
      .rejects.toThrow('Smartupga hech narsa yuborilmadi');
    expect(smartup.importInvoiceOrders).not.toHaveBeenCalled();
  });

  it('includes an order cancelled after Uzum accepted it into the same supply', async () => {
    const { service, uzum, smartup, invoice, invoiceOrders } = fixture(2);
    uzum.getOrderById.mockImplementation(async (_store, _key, orderId) => {
      if (String(orderId) === '1') return {
        id: '1', status: 'CANCELED', invoiceNumber: 120001078557,
        acceptedDate: Date.parse('2026-02-19T08:00:00Z'),
        dateCancelled: Date.parse('2026-02-23T08:00:00Z'),
      };
      if (String(orderId) === '2') return {
        id: '2', status: 'COMPLETED', invoiceNumber: 120001078557,
        acceptedDate: Date.parse('2026-02-19T08:00:00Z'),
      };
      return { id: '3', status: 'PACKING', invoiceNumber: 120001078557 };
    });

    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1'))
      .resolves.toMatchObject({ acceptedOrders: 2, skippedOrders: 1 });
    expect(smartup.importInvoiceOrders).toHaveBeenCalledWith(
      'user', 'store', 'invoice-1', invoiceOrders.slice(0, 2), invoice,
    );
  });

  it('does not include a cancelled order without Uzum acceptance evidence', async () => {
    const { service, uzum, smartup } = fixture(2);
    uzum.getOrderById.mockImplementation(async (_store, _key, orderId) => ({
      id: String(orderId),
      status: String(orderId) === '1' ? 'COMPLETED' : 'CANCELED',
      invoiceNumber: 120001078557,
      acceptedDate: null,
    }));

    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1'))
      .rejects.toThrow('Smartupga hech narsa yuborilmadi');
    expect(smartup.importInvoiceOrders).not.toHaveBeenCalled();
  });

  it('blocks the single-order action for an order that was not accepted', async () => {
    const { service, smartup } = fixture(1);

    await expect(service.importOrderToSmartup('user', 'store', '3', 'invoice-1'))
      .rejects.toThrow('hali Uzumga topshirilmagan');
    expect(smartup.importOrder).not.toHaveBeenCalled();
  });

  it('excludes the three orders handed over under another invoice from a 26/29 supply', async () => {
    const { service, smartup, uzum, invoice } = fixture(26);
    invoice.numberOrders = 29;
    const contents = Array.from({ length: 29 }, (_, index) => ({
      orderId: String(index + 1), items: [{ skuId: 'sku-1', amount: 1 }],
    }));
    uzum.getFbsInvoiceOrders.mockResolvedValue(contents);
    uzum.getOrderById.mockImplementation(async (_store, _key, orderId) => {
      const index = Number(orderId) - 1;
      return {
        id: String(orderId), status: 'COMPLETED',
        invoiceNumber: index < 26 ? 120001078557 : 120001087433,
      };
    });

    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1'))
      .resolves.toMatchObject({ acceptedOrders: 26, skippedOrders: 3 });
    expect(smartup.importInvoiceOrders.mock.calls[0].slice(2, 4))
      .toEqual(['invoice-1', contents.slice(0, 26)]);
  });

  it('keeps scanning when a moved order would otherwise make the accepted count appear complete', async () => {
    const { service, smartup, uzum, invoiceOrders } = fixture(2);
    uzum.getOrderById.mockImplementation(async (_store, _key, orderId) => {
      if (String(orderId) === '1') return { id: '1', status: 'COMPLETED', invoiceNumber: 120001078557 };
      if (String(orderId) === '2') return { id: '2', status: 'RETURNED', invoiceNumber: 120001078557 };
      return { id: '3', status: 'COMPLETED', invoiceNumber: 120001087433 };
    });

    await service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1');
    expect(smartup.importInvoiceOrders.mock.calls[0][3]).toEqual(invoiceOrders.slice(0, 2));
    await expect(service.importOrderToSmartup('user', 'store', '3', 'invoice-1'))
      .rejects.toThrow('hali Uzumga topshirilmagan');
    expect(smartup.importOrder).not.toHaveBeenCalled();
  });

  it('does not count live orders whose invoice association is absent', async () => {
    const { service, smartup, uzum } = fixture(1);
    uzum.getOrderById.mockResolvedValue({ id: '1', status: 'COMPLETED' } as any);
    await expect(service.importInvoiceOrdersToSmartup('user', 'store', 'invoice-1'))
      .rejects.toThrow('Smartupga hech narsa yuborilmadi');
    expect(smartup.importInvoiceOrders).not.toHaveBeenCalled();
  });
});

describe('FbsService Smartup supply status', () => {
  it('adds the saved Smartup deal ID to the matching supply row', async () => {
    const uzum = {
      getFbsInvoices: jest.fn().mockResolvedValue({
        invoices: [{ id: 'invoice-1', number: '100' }, { id: 'invoice-2', number: '200' }],
      }),
    };
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const prisma = {
      smartupOrderImport: {
        findMany: jest.fn().mockResolvedValue([{
          uzumInvoiceId: 'invoice-1',
          smartupExternalId: 'UZI123',
          smartupDealId: 'deal-77',
          status: 'SUCCESS',
          errorMessage: null,
          importedAt: new Date('2026-09-15T10:00:00Z'),
        }]),
      },
    };
    const service = new FbsService(uzum as any, stores as any, {} as any, {} as any, prisma as any);

    const result = await service.getInvoices('user', 'store');

    expect(result.invoices[0].smartupImport).toMatchObject({
      status: 'SUCCESS',
      smartupDealId: 'deal-77',
      smartupDealIds: ['deal-77'],
    });
    expect(result.invoices[1].smartupImport).toBeNull();
  });

  it('counts Smartup states across every Uzum invoice page, not just the visible page', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({ id: `invoice-${index + 1}` }));
    const secondPage = [{ id: 'invoice-21' }, { id: 'invoice-22' }, { id: 'invoice-23' }];
    const uzum = {
      getFbsInvoices: jest.fn(async (_storeId, _apiKey, _statuses, page) => ({
        invoices: page === 0 ? firstPage : page === 1 ? secondPage : [],
      })),
    };
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const prisma = {
      smartupOrderImport: {
        findMany: jest.fn().mockResolvedValue([
          { uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupDealId: 'deal-1' },
          { uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupDealId: 'deal-1' },
          { uzumInvoiceId: 'invoice-21', status: 'SUCCESS', smartupDealId: 'deal-21' },
          { uzumInvoiceId: 'outside-current-statuses', status: 'SUCCESS', smartupDealId: 'deal-other' },
        ]),
      },
    };
    const service = new FbsService(uzum as any, stores as any, {} as any, {} as any, prisma as any);

    await expect(service.getInvoiceSmartupCounts('user', 'store')).resolves.toMatchObject({
      all: 23,
      imported: 2,
      notImported: 21,
      missing: 0,
      scannedPages: 2,
    });
    expect(uzum.getFbsInvoices).toHaveBeenCalledTimes(2);
  });

  it('delegates live order verification only after checking store access', async () => {
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const smartup = { checkOrder: jest.fn().mockResolvedValue({ exists: true, state: 'FOUND' }) };
    const service = new FbsService({} as any, stores as any, {} as any, smartup as any);

    await expect(service.checkOrderInSmartup('user', 'store', '42')).resolves.toMatchObject({ exists: true });
    expect(stores.getStoreCredentials).toHaveBeenCalledWith('user', 'store');
    expect(smartup.checkOrder).toHaveBeenCalledWith('store', '42');
  });

  it('delegates the all-supplies Smartup verification after checking store access', async () => {
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const smartup = { checkInvoiceImports: jest.fn().mockResolvedValue({ checkedDocuments: 3, missingDocuments: 1 }) };
    const service = new FbsService({} as any, stores as any, {} as any, smartup as any);

    await expect(service.checkInvoiceImportsInSmartup('user', 'store')).resolves.toMatchObject({
      checkedDocuments: 3,
      missingDocuments: 1,
    });
    expect(stores.getStoreCredentials).toHaveBeenCalledWith('user', 'store');
    expect(smartup.checkInvoiceImports).toHaveBeenCalledWith('store');
  });

  it('counts deleted Smartup supplies separately from never-imported supplies', async () => {
    const uzum = {
      getFbsInvoices: jest.fn(async (_storeId, _apiKey, _statuses, page) => ({
        invoices: page === 0
          ? [{ id: 'invoice-1' }, { id: 'invoice-2' }, { id: 'invoice-3' }]
          : [],
      })),
    };
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const prisma = {
      smartupOrderImport: {
        findMany: jest.fn().mockResolvedValue([
          { uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupDealId: 'deal-1' },
          { uzumInvoiceId: 'invoice-2', status: 'NOT_FOUND' },
        ]),
      },
    };
    const service = new FbsService(uzum as any, stores as any, {} as any, {} as any, prisma as any);

    await expect(service.getInvoiceSmartupCounts('user', 'store')).resolves.toMatchObject({
      all: 3,
      imported: 1,
      missing: 1,
      notImported: 1,
    });
  });
});

describe('FbsService consistent invoice summary', () => {
  it('filters across all upstream pages before paginating and shares the catalog with counts', async () => {
    const invoices = Array.from({ length: 23 }, (_, index) => ({ id: String(index), numberAcceptedOrders: 1 }));
    const uzum = { getFbsInvoices: jest.fn(async (_store, _key, _statuses, page) => ({ invoices: invoices.slice(page * 20, (page + 1) * 20) })) };
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const rows = [20, 21, 22].map((id) => ({ uzumInvoiceId: String(id), status: 'SUCCESS', smartupDealId: 'deal' }));
    const prisma = { smartupOrderImport: { findMany: jest.fn().mockResolvedValue(rows) } };
    const service = new FbsService(uzum as any, stores as any, {} as any, {} as any, prisma as any);
    const first = await service.getInvoices('user', 'store', undefined, 0, 2, 'IMPORTED');
    expect(first).toMatchObject({ total: 3, hasNext: true });
    expect(first.invoices.map((invoice) => invoice.id)).toEqual(['20', '21']);
    const second = await service.getInvoices('user', 'store', undefined, 1, 2, 'IMPORTED');
    expect(second).toMatchObject({ total: 3, hasNext: false });
    expect(second.invoices.map((invoice) => invoice.id)).toEqual(['22']);
    expect(await service.getInvoiceSmartupCounts('user', 'store')).toMatchObject({ all: 23, imported: 3, notImported: 20 });
    expect(uzum.getFbsInvoices).toHaveBeenCalledTimes(2);
  });

  it('does not present imported invoices as unimported when the database lookup fails', async () => {
    const uzum = { getFbsInvoices: jest.fn().mockResolvedValue({ invoices: [{ id: '1' }] }) };
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const prisma = { smartupOrderImport: { findMany: jest.fn().mockRejectedValue(new Error('Database offline')) } };
    const service = new FbsService(uzum as any, stores as any, {} as any, {} as any, prisma as any);
    await expect(service.getInvoices('user', 'store', undefined, 0, 20, 'NOT_IMPORTED')).rejects.toThrow('bazadan');
  });

  it('never labels a partial import, error or missing deal as fully imported in counts or rows', async () => {
    const invoices = [
      { id: 'full', numberAcceptedOrders: 2 },
      { id: 'partial', numberAcceptedOrders: 2 },
      { id: 'failed', numberAcceptedOrders: 2 },
      { id: 'no-deal', numberAcceptedOrders: 1 },
      { id: 'deleted', numberAcceptedOrders: 1 },
    ];
    const rows = [
      { uzumInvoiceId: 'full', status: 'SUCCESS', smartupDealId: '1' },
      { uzumInvoiceId: 'full', status: 'SUCCESS', smartupDealId: '1' },
      { uzumInvoiceId: 'partial', status: 'SUCCESS', smartupDealId: '2' },
      { uzumInvoiceId: 'failed', status: 'SUCCESS', smartupDealId: '3' },
      { uzumInvoiceId: 'failed', status: 'ERROR', smartupDealId: null },
      { uzumInvoiceId: 'no-deal', status: 'SUCCESS', smartupDealId: null },
      { uzumInvoiceId: 'deleted', status: 'NOT_FOUND', smartupDealId: '4' },
    ];
    const uzum = { getFbsInvoices: jest.fn().mockResolvedValue({ invoices }) };
    const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test' }) };
    const prisma = { smartupOrderImport: { findMany: jest.fn().mockResolvedValue(rows) } };
    const service = new FbsService(uzum as any, stores as any, {} as any, {} as any, prisma as any);
    expect(await service.getInvoiceSmartupCounts('user', 'store')).toMatchObject({
      all: 5, imported: 1, missing: 1, notImported: 3,
    });
    const result = await service.getInvoices('user', 'store');
    expect(result.invoices.map((invoice) => invoice.smartupImport.status)).toEqual([
      'SUCCESS', 'ERROR', 'ERROR', 'REVIEW_REQUIRED', 'NOT_FOUND',
    ]);
    expect(result.invoices[1].smartupImport).toMatchObject({ importedOrders: 1, errorMessage: expect.stringContaining('1/2') });
  });
});

describe('FbsService FBO invoices', () => {
  function fixture() {
    const products = [{
      id: 701,
      productTitle: 'Chinni tarelka',
      skuForInvoiceDtoList: [
        { id: 801, skuTitle: 'Oq 24 sm', quantityToStock: 4, quantityAccepted: 2, purchasePrice: 12000 },
        { id: 802, skuTitle: 'Qora 24 sm', quantityToStock: 3, quantityAccepted: 3, purchasePrice: 13000 },
      ],
    }];
    const uzum = {
      getSellerInvoices: jest.fn().mockResolvedValue([{ id: 99, invoiceNumber: 120099 }]),
      getSellerInvoiceProducts: jest.fn().mockResolvedValue(products),
    };
    const stores = {
      getStoreCredentials: jest.fn().mockResolvedValue({ uzumShopId: 77, apiKey: 'api-key' }),
    };
    const smartup = {
      getImportStatus: jest.fn().mockResolvedValue({
        'FBO:99': { status: 'SUCCESS', smartupDealId: 'deal-fbo-99' },
      }),
      importOrder: jest.fn().mockResolvedValue({ ok: true }),
      checkOrder: jest.fn().mockResolvedValue({ exists: true }),
    };
    const prisma = {
      productMeta: {
        findMany: jest.fn().mockResolvedValue([
          { skuId: '801', xid: 'XID-801' },
          { skuId: '802', xid: null },
        ]),
      },
    };
    return {
      products, uzum, stores, smartup, prisma,
      service: new FbsService(uzum as any, stores as any, {} as any, smartup as any, prisma as any),
    };
  }

  it('loads the selected shop page and enriches it with an isolated FBO Smartup key', async () => {
    const { service, uzum } = fixture();
    const result = await service.getFboInvoices('user', 'store', 2, 20);
    expect(uzum.getSellerInvoices).toHaveBeenCalledWith('store', 'api-key', 77, { page: 2, size: 20 });
    expect(result.invoices[0].smartupImport).toMatchObject({ smartupDealId: 'deal-fbo-99' });
    expect(result.hasNext).toBe(false);
  });

  it('shows invoice products with each saved SKU XID', async () => {
    const { service } = fixture();
    const result = await service.getFboInvoiceProducts('user', 'store', '99');
    expect(result.products[0].skuForInvoiceDtoList[0].xid).toBe('XID-801');
    expect(result.products[0].skuForInvoiceDtoList[1].xid).toBeNull();
    expect(result.smartupImport.smartupDealId).toBe('deal-fbo-99');
  });

  it('sends only accepted FBO quantities through the atomic Smartup order preflight', async () => {
    const { service, smartup } = fixture();
    await service.importFboInvoiceToSmartup('user', 'store', '99');
    expect(smartup.importOrder).toHaveBeenCalledWith(
      'user',
      'store',
      expect.objectContaining({
        id: 'FBO:99',
        orderId: 'FBO:99',
        items: [
          expect.objectContaining({ skuId: '801', amount: 2 }),
          expect.objectContaining({ skuId: '802', amount: 3 }),
        ],
      }),
      'FBO:99',
    );
  });

  it('excludes FBO goods with zero accepted quantity', async () => {
    const { service, smartup, products } = fixture();
    products[0].skuForInvoiceDtoList[0].quantityAccepted = 0;
    await service.importFboInvoiceToSmartup('user', 'store', '99');
    expect(smartup.importOrder.mock.calls[0][2].items).toEqual([
      expect.objectContaining({ skuId: '802', amount: 3 }),
    ]);
  });

  it.each([undefined, null, '', -1, 1.5, 'invalid'])('blocks the whole FBO import for invalid accepted quantity %s', async (value) => {
    const { service, smartup, products } = fixture();
    (products[0].skuForInvoiceDtoList[0] as any).quantityAccepted = value;
    await expect(service.importFboInvoiceToSmartup('user', 'store', '99')).rejects.toThrow('aniqlanmadi');
    expect(smartup.importOrder).not.toHaveBeenCalled();
  });

  it('does not import an empty or wholly unaccepted FBO invoice', async () => {
    const { service, smartup, products, uzum } = fixture();
    products[0].skuForInvoiceDtoList.forEach((sku) => { sku.quantityAccepted = 0; });
    await expect(service.importFboInvoiceToSmartup('user', 'store', '99')).rejects.toThrow('mahsulot yo‘q');
    uzum.getSellerInvoiceProducts.mockResolvedValue([]);
    await expect(service.importFboInvoiceToSmartup('user', 'store', '99')).rejects.toThrow('mahsulot yo‘q');
    expect(smartup.importOrder).not.toHaveBeenCalled();
  });

  it('checks Smartup using the FBO namespace so it cannot collide with an FBS order', async () => {
    const { service, smartup } = fixture();
    await service.checkFboInvoiceInSmartup('user', 'store', '99');
    expect(smartup.checkOrder).toHaveBeenCalledWith('store', 'FBO:99');
  });
});

describe('FbsService live products', () => {
  const products = [
    { productId: 2211712, title: 'Eski mahsulot' },
    { productId: 3450001, title: 'Yangi mahsulot' },
    { productId: 2811100, title: 'O\'rta mahsulot' },
  ];

  function createService() {
    const uzumClient = {
      getProducts: jest.fn().mockResolvedValue({ products, total: products.length }),
    };
    const storesService = {
      getStoreCredentials: jest.fn().mockResolvedValue({ uzumShopId: 1, apiKey: 'test' }),
    };
    const service = new FbsService(
      uzumClient as any,
      storesService as any,
      {} as any,
      {} as any,
    );
    return { service, uzumClient };
  }

  it.each(['CREATED_AND_TITLE', 'ID'])('puts the newest product first for %s DESC even when upstream ignores it', async (sortBy) => {
    const { service, uzumClient } = createService();

    const result = await service.getLiveProducts(
      'user-1',
      'store-1',
      0,
      24,
      'ALL',
      undefined,
      sortBy,
      'DESC',
    );

    expect(result.products.map((product: any) => product.productId)).toEqual([
      3450001,
      2811100,
      2211712,
    ]);
    expect(result.total).toBe(3);
    expect(uzumClient.getProducts).toHaveBeenCalledTimes(1);
  });

  it('keeps the oldest product first when ASC is explicitly selected', async () => {
    const { service } = createService();

    const result = await service.getLiveProducts(
      'user-1',
      'store-1',
      0,
      24,
      'ALL',
      undefined,
      'CREATED_AND_TITLE',
      'ASC',
    );

    expect(result.products.map((product: any) => product.productId)).toEqual([
      2211712,
      2811100,
      3450001,
    ]);
  });

  it('filters products with at least one missing SKU XID before pagination', async () => {
    const catalog = [
      { productId: 101, title: 'XID to\'liq', skuList: [{ skuId: 1 }] },
      { productId: 102, title: 'Bitta XID yo\'q', skuList: [{ skuId: 2 }, { skuId: 3 }] },
      { productId: 103, title: 'Meta yo\'q', skuList: [{ skuId: 4 }] },
    ];
    const uzumClient = {
      getProducts: jest.fn().mockResolvedValue({ products: catalog, total: catalog.length }),
    };
    const storesService = {
      getStoreCredentials: jest.fn().mockResolvedValue({ uzumShopId: 1, apiKey: 'test' }),
    };
    const prisma = {
      productMeta: {
        findMany: jest.fn().mockResolvedValue([
          { skuId: '1', costPrice: null, articleCode: null, xid: 'XID-1' },
          { skuId: '2', costPrice: null, articleCode: null, xid: 'XID-2' },
          { skuId: '3', costPrice: null, articleCode: null, xid: '   ' },
        ]),
      },
    };
    const service = new FbsService(uzumClient as any, storesService as any, {} as any, {} as any, prisma as any);

    const result = await service.getLiveProducts(
      'user-1', 'store-1', 0, 1, 'ALL', undefined, 'CREATED_AND_TITLE', 'ASC', undefined, 'MISSING',
    );

    expect(result.total).toBe(2);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].productId).toBe(102);
    expect(prisma.productMeta.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store-1' } }));
  });
});
