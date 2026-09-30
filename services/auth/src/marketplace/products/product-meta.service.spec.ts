import { ProductMetaService } from './product-meta.service';

describe('ProductMetaService partial updates', () => {
  function fixture(owned = true) {
    const upsert = jest.fn().mockResolvedValue({ skuId: 'sku', xid: 'X1', costPrice: 10, articleCode: 'A1' });
    const db = { store: { findFirst: jest.fn().mockResolvedValue(owned ? { id: 's' } : null) }, productMeta: { upsert } };
    return { service: new ProductMetaService(db as any), upsert };
  }
  it('preserves cost and article when only XID is supplied', async () => {
    const { service, upsert } = fixture();
    await service.upsert('u', 's', 'sku', { xid: ' X1 ' });
    expect(upsert.mock.calls[0][0].update).toEqual({ xid: 'X1' });
  });
  it('allows the same XID on different SKU IDs and product listings', async () => {
    const { service, upsert } = fixture();
    await service.upsert('u', 's', 'red', { productId: 'p1', xid: 'SHARED' });
    await service.upsert('u', 's', 'blue', { productId: 'p2', xid: 'SHARED' });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls.map(([input]) => input.where)).toEqual([
      { storeId_skuId: { storeId: 's', skuId: 'red' } },
      { storeId_skuId: { storeId: 's', skuId: 'blue' } },
    ]);
    expect(upsert.mock.calls.every(([input]) => input.create.xid === 'SHARED')).toBe(true);
  });
  it('supports explicit clearing and zero cost', async () => {
    const { service, upsert } = fixture();
    await service.upsert('u', 's', 'sku', { articleCode: null, costPrice: 0 });
    expect(upsert.mock.calls[0][0].update).toEqual({ articleCode: null, costPrice: 0 });
  });
  it.each([-1, NaN, Infinity])('rejects invalid cost %s', async (costPrice) => {
    const { service, upsert } = fixture();
    await expect(service.upsert('u', 's', 'sku', { costPrice })).rejects.toThrow('Tan narx');
    expect(upsert).not.toHaveBeenCalled();
  });
  it('checks store ownership before writes', async () => {
    const { service, upsert } = fixture(false);
    await expect(service.upsert('u', 's', 'sku', { xid: 'X1' })).rejects.toThrow('Store not found');
    expect(upsert).not.toHaveBeenCalled();
  });
});
