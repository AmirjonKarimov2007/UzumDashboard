import { SmartupService } from './smartup.service';

function fixture(initial: any[] = []) {
  const rows = new Map(initial.map((r) => [r.storeId + ':' + r.uzumOrderId, r]));
  const imports = {
    findUnique: jest.fn(async ({ where }) => rows.get(where.storeId_uzumOrderId.storeId + ':' + where.storeId_uzumOrderId.uzumOrderId)),
    findMany: jest.fn(async ({ where }) => [...rows.values()].filter((r) => r.storeId === where.storeId &&
      (!where.uzumOrderId || where.uzumOrderId.in.includes(r.uzumOrderId)) &&
      (!where.smartupExternalId || r.smartupExternalId === where.smartupExternalId))),
    upsert: jest.fn(async ({ create, update }) => {
      const key = create.storeId + ':' + create.uzumOrderId;
      const row = rows.has(key) ? { ...rows.get(key), ...update } : create;
      rows.set(key, row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      let count = 0;
      for (const [key, row] of rows) {
        if (row.storeId === where.storeId && row.smartupExternalId === where.smartupExternalId) {
          rows.set(key, { ...row, ...data });
          count += 1;
        }
      }
      return { count };
    }),
  };
  const db: any = { smartupOrderImport: imports, $queryRaw: jest.fn(),
    productMeta: { findMany: jest.fn().mockResolvedValue([{ skuId: 'sku-1', productId: 'p1', xid: 'X1' }]) } };
  let queue = Promise.resolve();
  db.$transaction = jest.fn((operation) => {
    const request = queue.then(() => operation(db));
    queue = request.catch(() => undefined);
    return request;
  });
  const catalog = { getAllProducts: jest.fn().mockResolvedValue([]) };
  const service = new SmartupService(
    { get: (key: string) => key === 'SMARTUP_PRICE_TYPE_CODE' ? 'P1' : 'test' } as any, db, catalog as any,
    {
      getStoreCredentials: jest.fn().mockResolvedValue({ apiKey: 'test', uzumShopId: 1 }),
      resolveSmartupClientId: jest.fn().mockResolvedValue('STORE-CLIENT'),
    } as any,
  );
  const priceResponse = { data: { inventory: [{ inventory_code: 'X1', price_type: [{ price_type_code: 'P1', price: '15000' }] }] } };
  const post = jest.fn().mockImplementation(async (url, body) => {
    if (url.includes('product_price')) return priceResponse;
    if (url.includes('order$export')) {
      const match = [...rows.values()].find((row: any) =>
        body?.deal_id != null
          ? String(row.smartupDealId) === String(body.deal_id)
          : body?.external_id
            ? row.smartupExternalId === body.external_id
            : false,
      );
      return { data: { order: match ? [{ deal_id: match.smartupDealId, external_id: match.smartupExternalId }] : [] } };
    }
    return { data: { successes: [{ code: 'deal-1' }] } };
  });
  jest.spyOn(service as any, 'client').mockReturnValue({ post });
  return { service, db, imports, rows, post, catalog, priceResponse };
}
const order = (id = '1', amount = 2) => ({ id, items: [{ skuId: 'sku-1', amount }], createdAt: '2026-09-06T10:00:00Z' });
const submissions = (post: jest.Mock) => post.mock.calls.filter(([url]) => url.includes('order$import'));

describe('Smartup import safety', () => {
  it('uses the current Smartup work day instead of an old Uzum order date', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-16T08:15:30Z'));
    try {
      const { service, post } = fixture();
      await service.importOrder('u', 's', {
        ...order(),
        createdAt: '2026-07-02T08:00:00Z',
        deliveryDate: '2026-07-02T12:00:00Z',
      });
      expect(submissions(post)[0][1].order[0]).toMatchObject({
        delivery_date: '16.09.2026',
        deal_time: '16.09.2026 13:15:30',
      });
    } finally {
      now.mockRestore();
    }
  });

  it('uses the active store Smartup client for single-order imports', async () => {
    const { service, post } = fixture();
    await service.importOrder('u', 's', order());
    expect(submissions(post)[0][1].order[0]).toMatchObject({
      person_code: 'STORE-CLIENT',
      owner_person_code: 'test',
    });
  });

  it('sends the whole invoice once and combines different SKU/color variants by shared XID', async () => {
    const { service, db, post, priceResponse } = fixture();
    db.productMeta.findMany.mockResolvedValue([
      { skuId: 'apple-red', productId: 'p1', xid: 'APPLE' },
      { skuId: 'apple-green', productId: 'p2', xid: 'APPLE' },
      { skuId: 'pear-yellow', productId: 'p3', xid: 'PEAR' },
      { skuId: 'pear-green', productId: 'p4', xid: 'PEAR' },
    ]);
    priceResponse.data.inventory = ['APPLE', 'PEAR'].map((inventory_code) => ({
      inventory_code, price_type: [{ price_type_code: 'P1', price: '15000' }],
    }));
    const orders = [
      { orderId: '1', items: [{ skuId: 'apple-red', amount: 1 }, { skuId: 'pear-yellow', amount: 2 }] },
      { orderId: '2', items: [{ skuId: 'apple-green', amount: 2 }, { skuId: 'pear-green', amount: 3 }] },
    ];
    const result = await service.importInvoiceOrders('u', 's', '42', orders);
    expect(result).toMatchObject({ ok: true, total: 2, success: 2, aggregatedProducts: 2 });
    expect(submissions(post)).toHaveLength(1);
    const payload = submissions(post)[0][1];
    expect(payload.order).toHaveLength(1);
    expect(payload.order[0].order_products).toEqual([
      expect.objectContaining({ product_code: 'APPLE', order_quant: '3' }),
      expect.objectContaining({ product_code: 'PEAR', order_quant: '5' }),
    ]);
    expect(payload.order[0].external_id).toHaveLength(20);
    expect(payload.order[0].note).toBe('Uzum invoice 42');
    expect(payload.order[0].note.length).toBeLessThanOrEqual(40);
    expect(payload.order[0].person_code).toBe('STORE-CLIENT');
    expect(payload.order[0].order_products.every((row: any) => row.external_id.length <= 20)).toBe(true);
    expect(new Set(payload.order[0].order_products.map((row: any) => row.external_id)).size).toBe(2);
    expect(new Set(result.results.map((r) => r.import.smartupExternalId)).size).toBe(1);
    expect(result.results.every((r) => r.import.uzumInvoiceId === '42')).toBe(true);
    expect(result.results.every((r) => r.import.smartupDealId === 'deal-1')).toBe(true);
    expect((await service.importInvoiceOrders('u', 's', '42', orders)).alreadyImported).toBe(true);
    expect(submissions(post)).toHaveLength(1);
    expect(post.mock.calls.filter(([url]) => url.includes('order$export'))).toHaveLength(1);
  });
  it('deduplicates invoice orders before summing quantities', async () => {
    const { service, post } = fixture();
    expect((await service.importInvoiceOrders('u', 's', '42', [order(), order()])).total).toBe(1);
    expect(submissions(post)[0][1].order[0].order_products[0].order_quant).toBe('2');
  });
  it('returns newly saved rows on retry and keeps legacy external IDs', async () => {
    const { service } = fixture([{ storeId: 's', uzumOrderId: '1', status: 'ERROR', smartupExternalId: 'OLD' }]);
    const result = await service.importInvoiceOrders('u', 's', '42', [order()]);
    expect(result.results[0].import.status).toBe('SUCCESS');
    expect(result.import.smartupExternalId).toBe('OLD');
  });
  it('replaces oversized rejected external IDs before retrying Smartup', async () => {
    const oversized = 'UZI' + 'A'.repeat(24);
    const { service, post } = fixture([{ storeId: 's', uzumOrderId: '1', status: 'ERROR', smartupExternalId: oversized }]);
    await service.importInvoiceOrders('u', 's', '42', [order()]);
    expect(submissions(post)[0][1].order[0].external_id).toHaveLength(20);
    expect(submissions(post)[0][1].order[0].external_id).not.toBe(oversized);
  });
  it('regroups definitively rejected orders left under different import IDs', async () => {
    const { service, post } = fixture([
      { storeId: 's', uzumOrderId: '1', status: 'ERROR', smartupExternalId: 'OLD-GROUP-1' },
      { storeId: 's', uzumOrderId: '2', status: 'ERROR', smartupExternalId: 'OLD-GROUP-2' },
    ]);

    const result = await service.importInvoiceOrders('u', 's', '42', [order('1'), order('2')]);

    expect(result).toMatchObject({ ok: true, total: 2, success: 2, failed: 0 });
    expect(submissions(post)).toHaveLength(1);
    const externalId = submissions(post)[0][1].order[0].external_id;
    expect(externalId).toHaveLength(20);
    expect(externalId).not.toBe('OLD-GROUP-1');
    expect(externalId).not.toBe('OLD-GROUP-2');
    expect(result.results.every((row) => row.import.smartupExternalId === externalId)).toBe(true);
  });
  it('keeps deleted legacy groups blocked when Smartup cannot confirm absence', async () => {
    const { service, post } = fixture([
      { storeId: 's', uzumOrderId: '1', status: 'NOT_FOUND', smartupExternalId: 'OLD-GROUP-1' },
      { storeId: 's', uzumOrderId: '2', status: 'NOT_FOUND', smartupExternalId: 'OLD-GROUP-2' },
    ]);
    post.mockResolvedValue({ data: { successes: [] } });

    await expect(service.importInvoiceOrders('u', 's', '42', [order('1'), order('2')]))
      .rejects.toThrow('formatda');
    expect(submissions(post)).toHaveLength(0);
  });
  it('regroups deleted legacy batches with new orders only after live absence checks', async () => {
    const { service, post, priceResponse } = fixture([
      { storeId: 's', uzumOrderId: '1', status: 'NOT_FOUND', smartupExternalId: 'OLD-1', smartupDealId: null },
      { storeId: 's', uzumOrderId: '2', status: 'NOT_FOUND', smartupExternalId: 'OLD-2', smartupDealId: '72' },
    ]);
    post.mockImplementation(async (url) => url.includes('order$export')
      ? { data: { order: [] } }
      : url.includes('product_price') ? priceResponse : { data: { successes: [{ code: 'new-deal' }] } });
    const result = await service.importInvoiceOrders('u', 's', '42', [order('1'), order('2'), order('3')]);
    expect(result).toMatchObject({ success: 3, failed: 0 });
    expect(post.mock.calls.filter(([url]) => url.includes('order$export'))).toHaveLength(2);
    expect(post).toHaveBeenCalledWith('/b/trade/txs/tdeal/order$export', {});
    expect(post).toHaveBeenCalledWith('/b/trade/txs/tdeal/order$export', { deal_id: 72 });
    expect(submissions(post)).toHaveLength(1);
    expect(submissions(post)[0][1].order[0].external_id).not.toMatch(/^OLD-/);
  });
  it('blocks the whole supply when a previously missing legacy document exists again', async () => {
    const { service, post } = fixture([
      { storeId: 's', uzumOrderId: '1', status: 'NOT_FOUND', smartupExternalId: 'OLD-1', smartupDealId: '71' },
    ]);
    post.mockResolvedValue({ data: { order: [{ deal_id: 71, external_id: 'OLD-1', status: 'B' }] } });

    await expect(service.importInvoiceOrders('u', 's', '42', [order('1'), order('2')]))
      .rejects.toThrow('Qolgan buyurtmalar alohida nakladnoy qilib yuborilmadi');
    expect(submissions(post)).toHaveLength(0);
  });
  it('blocks regrouping if the live deletion check is unavailable', async () => {
    const { service, post } = fixture([
      { storeId: 's', uzumOrderId: '1', status: 'NOT_FOUND', smartupExternalId: 'OLD-1', smartupDealId: '71' },
    ]);
    post.mockRejectedValue(new Error('Smartup unavailable'));
    await expect(service.importInvoiceOrders('u', 's', '42', [order('1'), order('2')]))
      .rejects.toThrow('Smartup unavailable');
    expect(submissions(post)).toHaveLength(0);
  });
  it('never resends success after order status configuration changes', async () => {
    const { service, post } = fixture([{
      storeId: 's', uzumOrderId: '1', status: 'SUCCESS', smartupDealId: 'deal', smartupExternalId: 'UZI-OLD',
      payload: { order: [{ status: 'OLD' }] },
    }]);
    expect((await service.importOrder('u', 's', order())).alreadyImported).toBe(true);
    expect(submissions(post)).toHaveLength(0);
    expect(post).toHaveBeenCalledWith('/b/trade/txs/tdeal/order$export', { deal_id: 'deal' });
  });

  it('reimports the complete invoice when its locally successful Smartup document was deleted', async () => {
    const initial = ['1', '2'].map((uzumOrderId) => ({
      storeId: 's', uzumOrderId, uzumInvoiceId: '42', status: 'SUCCESS',
      smartupExternalId: 'UZI-DELETED', smartupDealId: '77',
    }));
    const { service, post, priceResponse, rows } = fixture(initial);
    post.mockImplementation(async (url) => {
      if (url.includes('order$export')) return { data: { order: [] } };
      if (url.includes('product_price')) return priceResponse;
      return { data: { successes: [{ code: 'new-deal' }] } };
    });

    const result = await service.importInvoiceOrders('u', 's', '42', [order('1'), order('2')]);

    expect(result).toMatchObject({ ok: true, total: 2, success: 2, failed: 0 });
    expect(result.alreadyImported).not.toBe(true);
    expect(post.mock.calls.filter(([url]) => url.includes('order$export'))).toHaveLength(1);
    expect(submissions(post)).toHaveLength(1);
    expect(rows.get('s:1')).toMatchObject({ status: 'SUCCESS', smartupDealId: 'new-deal' });
    expect(rows.get('s:2')).toMatchObject({ status: 'SUCCESS', smartupDealId: 'new-deal' });
  });

  it('never creates a second Smartup document for a partially imported supply', async () => {
    const { service, post } = fixture([{
      storeId: 's', uzumOrderId: '1', uzumInvoiceId: '42', status: 'SUCCESS',
      smartupExternalId: 'UZI-EXISTS', smartupDealId: '77',
    }]);
    post.mockResolvedValue({ data: { order: [{ deal_id: 77, external_id: 'UZI-EXISTS', status: 'B' }] } });

    await expect(service.importInvoiceOrders('u', 's', '42', [order('1'), order('2')]))
      .rejects.toThrow('Qolgan buyurtmalar alohida nakladnoy qilib yuborilmadi');
    expect(submissions(post)).toHaveLength(0);
  });
  it('coordinates concurrent invoice and single-order imports', async () => {
    const { service, post } = fixture();
    await Promise.allSettled([service.importInvoiceOrders('u', 's', '42', [order()]), service.importOrder('u', 's', order())]);
    expect(submissions(post)).toHaveLength(1);
  });
  it('blocks retries after a timeout with uncertain remote outcome', async () => {
    const { service, post, rows, priceResponse } = fixture();
    post.mockImplementation(async (url) => { if (url.includes('order$import')) throw new Error('timeout'); return priceResponse; });
    await expect(service.importOrder('u', 's', order())).rejects.toThrow('Natija noaniq');
    expect(rows.get('s:1').status).toBe('REVIEW_REQUIRED');
    await expect(service.importOrder('u', 's', order())).rejects.toThrow();
    expect(submissions(post)).toHaveLength(1);
  });
  it('confirms a single order created by Smartup despite an origin-header HTTP 500', async () => {
    const { service, post, rows, priceResponse } = fixture();
    let externalId = '';
    post.mockImplementation(async (url, body) => {
      if (url.includes('product_price')) return priceResponse;
      if (url.includes('order$import')) {
        externalId = body.order[0].external_id;
        throw {
          response: { data: 'Z:#z:mdeal_origin_headers dup val on index company_id=1061 deal_id=77\n' },
          message: 'Request failed with status code 500',
        };
      }
      if (url.includes('order$export')) {
        const submitted = submissions(post)[0][1].order[0];
        return { data: { order: [{
          deal_id: '77', external_id: externalId, status: 'B#N',
          person_code: submitted.person_code,
          order_products: submitted.order_products,
        }] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(service.importOrder('u', 's', order())).resolves.toMatchObject({ ok: true });
    expect(rows.get('s:1')).toMatchObject({ status: 'SUCCESS', smartupDealId: '77' });
    expect(post).toHaveBeenCalledWith('/b/trade/txs/tdeal/order$export', { deal_id: 77 });
    expect(submissions(post)).toHaveLength(1);
  });
  it('confirms an entire invoice created by Smartup despite an origin-header HTTP 500', async () => {
    const { service, post, rows, priceResponse } = fixture();
    let externalId = '';
    post.mockImplementation(async (url, body) => {
      if (url.includes('product_price')) return priceResponse;
      if (url.includes('order$import')) {
        externalId = body.order[0].external_id;
        throw {
          response: { data: 'Z:#z:mdeal_origin_headers dup val on index company_id=1061 deal_id=88\n' },
          message: 'Request failed with status code 500',
        };
      }
      if (url.includes('order$export')) {
        const submitted = submissions(post)[0][1].order[0];
        return { data: { order: [{
          deal_id: '88', external_id: externalId, status: 'B#N',
          person_code: submitted.person_code,
          order_products: submitted.order_products,
        }] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await service.importInvoiceOrders('u', 's', '42', [order('1'), order('2')]);
    expect(result).toMatchObject({ ok: true, total: 2, success: 2, failed: 0 });
    expect(rows.get('s:1')).toMatchObject({ status: 'SUCCESS', smartupDealId: '88' });
    expect(rows.get('s:2')).toMatchObject({ status: 'SUCCESS', smartupDealId: '88' });
    expect(post).toHaveBeenCalledWith('/b/trade/txs/tdeal/order$export', { deal_id: 88 });
    expect(submissions(post)).toHaveLength(1);
  });
  it('does not confirm an origin-header HTTP 500 when Smartup products are incomplete', async () => {
    const { service, post, rows, priceResponse } = fixture();
    let externalId = '';
    post.mockImplementation(async (url, body) => {
      if (url.includes('product_price')) return priceResponse;
      if (url.includes('order$import')) {
        externalId = body.order[0].external_id;
        throw {
          response: { data: 'Z:#z:mdeal_origin_headers dup val on index company_id=1061 deal_id=99\n' },
          message: 'Request failed with status code 500',
        };
      }
      if (url.includes('order$export')) {
        return { data: { order: [{
          deal_id: '99', external_id: externalId, status: 'B#N', person_code: 'STORE-CLIENT',
          order_products: [{ product_code: 'X1', order_quant: '1', product_price: '15000' }],
        }] } };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(service.importInvoiceOrders('u', 's', '42', [order('1', 2)]))
      .rejects.toThrow('Natija noaniq');
    expect(rows.get('s:1')).toMatchObject({ status: 'REVIEW_REQUIRED', smartupDealId: null });
    expect(submissions(post)).toHaveLength(1);
  });
  it('does not fabricate a deal ID from an empty success object', async () => {
    const { service, post, rows } = fixture();
    jest.spyOn(service as any, 'buildOrderProducts').mockResolvedValue([]);
    post.mockResolvedValue({ data: { successes: [{}] } });
    await expect(service.importOrder('u', 's', order())).rejects.toThrow('Natija noaniq');
    expect(rows.get('s:1').status).toBe('REVIEW_REQUIRED');
  });
  it('stores explicit business rejection as retryable ERROR', async () => {
    const { service, post, rows } = fixture();
    jest.spyOn(service as any, 'buildOrderProducts').mockResolvedValue([]);
    post.mockResolvedValue({ data: { errors: [{ message: 'Mahsulot topilmadi' }] } });
    await expect(service.importOrder('u', 's', order())).rejects.toThrow('Mahsulot topilmadi');
    expect(rows.get('s:1').status).toBe('ERROR');
  });
  it('quarantines a mixed Smartup response and never retries the supply automatically', async () => {
    const { service, post, rows, priceResponse } = fixture();
    post.mockImplementation(async (url) => {
      if (url.includes('product_price')) return priceResponse;
      if (url.includes('order$import')) return {
        data: { successes: [{ code: 'partial-deal' }], errors: [{ message: 'Bitta mahsulot qabul qilinmadi' }] },
      };
      return { data: { order: [] } };
    });

    await expect(service.importInvoiceOrders('u', 's', '42', [order()]))
      .rejects.toThrow('Bitta mahsulot qabul qilinmadi');
    expect(rows.get('s:1')).toMatchObject({
      status: 'REVIEW_REQUIRED',
      smartupDealId: 'partial-deal',
      response: {
        successes: [{ code: 'partial-deal' }],
        errors: [{ message: 'Bitta mahsulot qabul qilinmadi' }],
      },
    });
    await expect(service.importInvoiceOrders('u', 's', '42', [order()]))
      .rejects.toThrow('Natija noaniq');
    expect(submissions(post)).toHaveLength(1);
  });
  it('treats ORA-06502 as a retryable rejection and resends it with compact IDs', async () => {
    const ora = 'ORA-06502: PL/SQL: numeric or value error: character string buffer too small';
    const { service, post, rows, priceResponse } = fixture([{
      storeId: 's', uzumOrderId: '1', status: 'REVIEW_REQUIRED',
      smartupExternalId: 'UZI' + 'A'.repeat(24), errorMessage: ora,
    }]);
    post.mockImplementation(async (url) => {
      if (url.includes('product_price')) return priceResponse;
      throw { response: { data: { message: ora } }, message: 'Bad Gateway' };
    });

    await expect(service.importInvoiceOrders('u', 's', '42', [order()])).rejects.toThrow('ORA-06502');

    expect(rows.get('s:1').status).toBe('ERROR');
    expect(rows.get('s:1').smartupExternalId).toHaveLength(20);
  });
  it('keeps a remote success non-retryable when local persistence fails', async () => {
    const { service, imports, rows } = fixture();
    const original = imports.upsert.getMockImplementation()!;
    imports.upsert.mockImplementation(async (input) => { if (input.create.status === 'SUCCESS') throw new Error('db unavailable'); return original(input); });
    await expect(service.importOrder('u', 's', order())).rejects.toThrow('Natija noaniq');
    expect(rows.get('s:1').status).toBe('REVIEW_REQUIRED');
  });
  it('refuses partial replacement of an earlier invoice batch', async () => {
    const { service, post } = fixture(['1', '2'].map((id) => ({ storeId: 's', uzumOrderId: id, status: 'ERROR', smartupExternalId: 'batch' })));
    await expect(service.importOrder('u', 's', order())).rejects.toThrow('qisman');
    expect(submissions(post)).toHaveLength(0);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid quantity %s before submitting', async (amount) => {
    const { service, post, rows } = fixture();
    await expect(service.importOrder('u', 's', order('1', amount))).rejects.toThrow('miqdori');
    expect(submissions(post)).toHaveLength(0);
    expect(rows.size).toBe(0);
  });
  it('refuses an invoice containing an order without items', async () => {
    const { service, post } = fixture();
    await expect(service.importInvoiceOrders('u', 's', 1, [order(), { id: '2' }])).rejects.toThrow('mahsulotlar yo‘q');
    expect(post).not.toHaveBeenCalled();
  });
  it('never resolves an unmapped explicit SKU by another variant title', async () => {
    const { service, catalog, post } = fixture();
    catalog.getAllProducts.mockResolvedValue([{ title: 'Shirt', skuList: [{ skuId: 'sku-1', skuTitle: 'Blue' }] }]);
    await expect(service.importOrder('u', 's', { id: '1', items: [{ skuId: 'unknown', title: 'Shirt', amount: 1 }] })).rejects.toThrow('XID');
    expect(submissions(post)).toHaveLength(0);
  });
  it('rejects the whole order before Smartup when just one of several products is invalid', async () => {
    const { service, db, post, priceResponse } = fixture();
    db.productMeta.findMany.mockResolvedValue([
      { skuId: 'sku-ready', productId: 'p1', xid: 'READY' },
    ]);
    priceResponse.data.inventory = [{
      inventory_code: 'READY', price_type: [{ price_type_code: 'P1', price: '15000' }],
    }];

    await expect(service.importOrder('u', 's', {
      id: 'mixed',
      items: [
        { skuId: 'sku-ready', title: 'Tayyor mahsulot', amount: 1 },
        { skuId: 'sku-missing', title: 'XID yo‘q mahsulot', amount: 1 },
      ],
    })).rejects.toThrow('Smartupga yuborilmadi');

    expect(submissions(post)).toHaveLength(0);
    expect(db.smartupOrderImport.upsert).not.toHaveBeenCalled();
  });
  it('avoids catalog fetching when all SKU mappings exist', async () => {
    const { service, catalog } = fixture();
    await service.importOrder('u', 's', order());
    expect(catalog.getAllProducts).not.toHaveBeenCalled();
  });
});

describe('Smartup read-only validation', () => {
  it('checks a saved deal ID against Smartup and confirms the whole grouped import', async () => {
    const initial = ['1', '2'].map((uzumOrderId) => ({
      storeId: 's', uzumOrderId, status: 'SUCCESS', smartupExternalId: 'UZI123', smartupDealId: '77',
    }));
    const { service, post, rows, imports } = fixture(initial);
    post.mockImplementation(async (url, body) => url.includes('order$export')
      ? { data: { order: [{ deal_id: 77, external_id: 'UZI123', status: 'B#N' }] } }
      : { data: {} });

    await expect(service.checkOrder('s', '1')).resolves.toMatchObject({
      exists: true,
      state: 'FOUND',
      smartupDealId: '77',
      remoteStatus: 'B#N',
    });
    expect(post).toHaveBeenCalledWith('/b/trade/txs/tdeal/order$export', { deal_id: 77 });
    expect(imports.updateMany).toHaveBeenCalled();
    expect(rows.get('s:2').status).toBe('SUCCESS');
  });

  it('marks every row in a deleted Smartup deal as NOT_FOUND', async () => {
    const initial = ['1', '2'].map((uzumOrderId) => ({
      storeId: 's', uzumOrderId, status: 'SUCCESS', smartupExternalId: 'UZI123', smartupDealId: '77',
    }));
    const { service, post, rows } = fixture(initial);
    post.mockResolvedValue({ data: { order: [] } });

    await expect(service.checkOrder('s', '1')).resolves.toMatchObject({
      exists: false,
      state: 'NOT_FOUND',
      smartupDealId: '77',
    });
    expect(rows.get('s:1').status).toBe('NOT_FOUND');
    expect(rows.get('s:2').status).toBe('NOT_FOUND');
  });

  it('checks each imported FBS document once and reports deleted invoices', async () => {
    const initial = [
      { storeId: 's', uzumOrderId: '1', uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupExternalId: 'UZI-A', smartupDealId: '71' },
      { storeId: 's', uzumOrderId: '2', uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupExternalId: 'UZI-A', smartupDealId: '71' },
      { storeId: 's', uzumOrderId: '3', uzumInvoiceId: 'invoice-2', status: 'SUCCESS', smartupExternalId: 'UZI-B', smartupDealId: '72' },
      { storeId: 's', uzumOrderId: '4', uzumInvoiceId: 'FBO:90', status: 'SUCCESS', smartupExternalId: 'FBO-A', smartupDealId: '90' },
    ];
    const { service, post, rows } = fixture(initial);
    post.mockImplementation(async (url, body) => {
      if (!url.includes('order$export')) return { data: {} };
      return body.deal_id === 71
        ? { data: { order: [{ deal_id: 71, external_id: 'UZI-A', status: 'B#N' }] } }
        : { data: { order: [] } };
    });

    await expect(service.checkInvoiceImports('s')).resolves.toMatchObject({
      ok: true,
      checkedDocuments: 2,
      foundDocuments: 1,
      missingDocuments: 1,
      affectedInvoices: 1,
      failedDocuments: 0,
      deletedInvoices: [{
        invoiceId: 'invoice-2',
        smartupDealId: '72',
        smartupExternalId: 'UZI-B',
      }],
    });
    expect(post.mock.calls.filter(([url]) => url.includes('order$export'))).toHaveLength(2);
    expect(rows.get('s:1').status).toBe('SUCCESS');
    expect(rows.get('s:2').status).toBe('SUCCESS');
    expect(rows.get('s:3').status).toBe('NOT_FOUND');
    expect(rows.get('s:4').status).toBe('SUCCESS');
  });

  it('continues checking other invoices when one Smartup request fails', async () => {
    const initial = [
      { storeId: 's', uzumOrderId: '1', uzumInvoiceId: 'invoice-1', status: 'SUCCESS', smartupExternalId: 'UZI-A', smartupDealId: '71' },
      { storeId: 's', uzumOrderId: '2', uzumInvoiceId: 'invoice-2', status: 'SUCCESS', smartupExternalId: 'UZI-B', smartupDealId: '72' },
    ];
    const { service, post, rows } = fixture(initial);
    post.mockImplementation(async (_url, body) => {
      if (body.deal_id === 71) throw new Error('Smartup timeout');
      return { data: { order: [] } };
    });

    await expect(service.checkInvoiceImports('s')).resolves.toMatchObject({
      ok: false,
      checkedDocuments: 2,
      missingDocuments: 1,
      failedDocuments: 1,
      affectedInvoices: 1,
    });
    expect(rows.get('s:1').status).toBe('SUCCESS');
    expect(rows.get('s:2').status).toBe('NOT_FOUND');
  });

  it('does not call Smartup when an order has never been imported', async () => {
    const { service, post } = fixture();
    await expect(service.checkOrder('s', 'new-order')).resolves.toMatchObject({
      exists: false,
      state: 'NOT_IMPORTED',
      smartupDealId: null,
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('does not overwrite the saved state when Smartup validation fails', async () => {
    const initial = [{ storeId: 's', uzumOrderId: '1', status: 'SUCCESS', smartupExternalId: 'UZI123', smartupDealId: '77' }];
    const { service, post, rows, imports } = fixture(initial);
    post.mockResolvedValue({ data: { errors: [{ message: 'Export denied' }] } });
    await expect(service.checkOrder('s', '1')).rejects.toThrow('Export denied');
    expect(imports.updateMany).not.toHaveBeenCalled();
    expect(rows.get('s:1').status).toBe('SUCCESS');
  });

  it('coalesces concurrent price requests', async () => {
    const { service, post } = fixture();
    await Promise.all([(service as any).getSmartupPrices(), (service as any).getSmartupPrices()]);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed prices and permits a fresh fetch', async () => {
    const { service, post } = fixture();
    post.mockResolvedValueOnce({ data: {} });
    await expect((service as any).getSmartupPrices()).rejects.toThrow('formatda');
    await (service as any).getSmartupPrices();
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('reports missing mappings and prices without creating orders', async () => {
    const { service, catalog, post, db } = fixture();
    catalog.getAllProducts.mockResolvedValue([{ productId: 'p1', title: 'Product', skuList: [{ skuId: 'sku-1' }, { skuId: 'sku-2' }, { skuId: 'sku-3' }] }]);
    db.productMeta.findMany.mockResolvedValue([{ skuId: 'sku-1', xid: 'X1' }, { skuId: 'sku-2', xid: 'X2' }]);
    expect(await service.checkProducts('u', 's')).toMatchObject({ total: 3, ready: 1, missingXid: 1, missingPrice: 1 });
    expect(submissions(post)).toHaveLength(0);
  });
  it('uses store-scoped full IDs and formats second timestamps in Tashkent time', () => {
    const s = fixture().service as any;
    expect(s.externalId('s1:123456789')).not.toBe(s.externalId('s2:123456789'));
    expect(s.externalId('s1:123456789')).not.toBe(s.externalId('s1:923456789'));
    expect(s.dateTime(Date.parse('2026-09-05T21:30:00Z') / 1000)).toBe('06.09.2026 02:30:00');
    expect(() => s.dateOnly('invalid')).toThrow();
  });
  it('rejects mixed and uncorrelated success responses', () => {
    const s = fixture().service as any;
    expect(s.matchSuccess({ successes: [{ code: '1' }], errors: [{}] }, 'x')).toBeNull();
    expect(s.matchSuccess({ successes: [{ external_id: 'other' }] }, 'x')).toBeNull();
  });
  it('extracts the actual deal ID from supported Smartup success shapes', () => {
    const s = fixture().service as any;
    expect(s.smartupSuccessId({ deal_id: 123 }, 'external')).toBe('123');
    expect(s.smartupSuccessId({ data: { dealId: 'deal-7' } }, 'external')).toBe('deal-7');
    expect(s.smartupSuccessId('deal-8', 'external')).toBe('deal-8');
    expect(s.smartupSuccessId({ external_id: 'external' }, 'external')).toBe('');
  });
});
