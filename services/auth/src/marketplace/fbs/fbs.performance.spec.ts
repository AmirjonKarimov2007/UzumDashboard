import { FbsService } from './fbs.service';

function fixture() {
  const products = [
    { productId: 1, title: 'First', skuList: [{ skuId: 'a' }, { skuId: 'b' }] },
    { productId: 2, title: 'Free', skuList: [{ skuId: 'c' }] },
    { productId: 3, title: 'Missing', skuList: [{ skuId: 'd' }] },
  ];
  const client = {
    getProducts: jest.fn().mockResolvedValue({ products, total: 3 }),
    getFbsOrders: jest.fn().mockResolvedValue({ orders: [{ id: 1 }] }),
    getFbsInvoices: jest.fn().mockResolvedValue({ invoices: Array.from({ length: 20 }, (_, id) => ({ id })) }),
    getFbsLabelPdfFast: jest.fn().mockResolvedValue('pdf'),
    confirmFbsOrder: jest.fn().mockResolvedValue({ ok: true }),
  };
  const stores = { getStoreCredentials: jest.fn().mockResolvedValue({ uzumShopId: 1, apiKey: 'fixture' }) };
  const db = { productMeta: { findMany: jest.fn().mockResolvedValue([
    { skuId: 'a', costPrice: 10 }, { skuId: 'b', costPrice: null, xid: 'variant-code' }, { skuId: 'c', costPrice: 0 },
  ]) } };
  const service = new FbsService(client as any, stores as any, {} as any, {} as any, db as any);
  return { service, client, stores, db };
}

describe('FBS performance and metadata filters', () => {
  it('filters missing costs across the catalog before pagination; zero is entered', async () => {
    const { service } = fixture();
    const first = await service.getLiveProducts('u', 's', 0, 1, 'ALL', '', 'ID', 'DESC', 'MISSING');
    const second = await service.getLiveProducts('u', 's', 1, 1, 'ALL', '', 'ID', 'DESC', 'MISSING');
    expect(first.total).toBe(2);
    expect(first.products.map((p: any) => p.productId)).toEqual([3]);
    expect(second.products.map((p: any) => p.productId)).toEqual([1]);
  });
  it('reflects freshly saved costs while reusing the catalog', async () => {
    const { service, client, db } = fixture();
    await service.getLiveProducts('u', 's', 0, 24, 'ALL', '', 'ID', 'DESC', 'MISSING');
    db.productMeta.findMany.mockResolvedValue(['a', 'b', 'c', 'd'].map((skuId) => ({ skuId, costPrice: 0 })));
    expect((await service.getLiveProducts('u', 's', 0, 24, 'ALL', '', 'ID', 'DESC', 'MISSING')).total).toBe(0);
    expect(client.getProducts).toHaveBeenCalledTimes(1);
  });
  it('searches metadata on secondary SKU variants', async () => {
    const { service } = fixture();
    const result = await service.getLiveProducts('u', 's', 0, 24, 'ALL', 'variant-code');
    expect(result.products.map((p: any) => p.productId)).toEqual([1]);
  });
  it('fetches only the requested invoice page, not an entire history', async () => {
    const { service, client } = fixture();
    const result = await service.getInvoices('u', 's', undefined, 7, 20);
    expect(client.getFbsInvoices).toHaveBeenCalledTimes(1);
    expect(client.getFbsInvoices).toHaveBeenCalledWith('s', 'fixture', undefined, 7, 20);
    expect(result).toMatchObject({ page: 7, hasNext: true });
    expect(result).not.toHaveProperty('total');
  });
  it('coalesces order reads but invalidates them after an action', async () => {
    const { service, client } = fixture();
    await Promise.all([service.getOrders('u', 's'), service.getOrders('u', 's')]);
    expect(client.getFbsOrders).toHaveBeenCalledTimes(1);
    await service.confirmOrder('u', 's', 1);
    await service.getOrders('u', 's');
    expect(client.getFbsOrders).toHaveBeenCalledTimes(2);
  });
  it('rechecks store ownership even when a cached result exists', async () => {
    const { service, stores } = fixture();
    await service.getOrders('u', 's');
    stores.getStoreCredentials.mockRejectedValue(new Error('forbidden'));
    await expect(service.getOrders('u', 's')).rejects.toThrow('forbidden');
  });
  it('reuses successful label reads and retries a temporarily empty label before returning it', async () => {
    const { service, client } = fixture();
    await service.getBatchLabelsPdf('u', 's', [1, 1]);
    expect(client.getFbsLabelPdfFast).toHaveBeenCalledTimes(1);
    jest.spyOn(service as any, 'waitForLabelRetry').mockResolvedValue(undefined);
    client.getFbsLabelPdfFast.mockResolvedValueOnce(null).mockResolvedValueOnce('pdf-2');
    const result = await service.getBatchLabelsPdf('u', 's', [2]);
    expect(result).toMatchObject({ success: 1, failed: 0, failedOrderIds: [] });
    expect(client.getFbsLabelPdfFast).toHaveBeenCalledTimes(3);
  });
  it('identifies every order that still has no label after the safety retries', async () => {
    const { service, client } = fixture();
    jest.spyOn(service as any, 'waitForLabelRetry').mockResolvedValue(undefined);
    client.getFbsLabelPdfFast.mockResolvedValue(null);
    const result = await service.getBatchLabelsPdf('u', 's', ['lost-1', 'lost-2']);
    expect(result).toMatchObject({ success: 0, failed: 2, failedOrderIds: ['lost-1', 'lost-2'] });
    expect(client.getFbsLabelPdfFast).toHaveBeenCalledTimes(8);
  });
});
