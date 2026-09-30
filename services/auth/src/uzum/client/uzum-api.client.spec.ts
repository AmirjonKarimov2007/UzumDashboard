import { UzumApiClient } from './uzum-api.client';

describe('UzumApiClient FBO invoice formats', () => {
  function fixture(response: any) {
    const client = new UzumApiClient({} as any, {} as any);
    jest.spyOn(client as any, 'executeWithRetry').mockResolvedValue(response);
    return client;
  }

  it('accepts the documented direct-array invoice response', async () => {
    const response = [{ id: 11, invoiceNumber: 1011 }];
    const client = fixture(response);
    await expect(client.getSellerInvoices('store', 'key', 77, { page: 2, size: 20 })).resolves.toEqual(response);
    expect((client as any).executeWithRetry).toHaveBeenCalledWith(
      'store', 'key', '/v1/shop/77/invoice', 'GET', expect.any(Function),
    );
  });

  it('accepts direct-array product rows and safe wrapper variants', async () => {
    const direct = [{ id: 22, skuForInvoiceDtoList: [{ id: 33 }] }];
    const client = fixture({ payload: direct });
    await expect(client.getSellerInvoiceProducts('store', 'key', 77, 11)).resolves.toEqual(direct);
  });
});

describe('UzumApiClient FBS order date filters', () => {
  it('unwraps the authoritative single-order payload', async () => {
    const liveOrder = { id: 42, status: 'COMPLETED', invoiceNumber: 120001234567 };
    const client = new UzumApiClient({} as any, {} as any);
    jest.spyOn(client as any, 'executeWithRetry').mockResolvedValue({ payload: liveOrder, timestamp: Date.now() });

    await expect(client.getOrderById('store', 'api-key', '42')).resolves.toEqual(liveOrder);
  });

  it('converts invoice millisecond timestamps to the epoch seconds required by Uzum', async () => {
    const client = new UzumApiClient({} as any, {} as any);
    const get = jest.fn().mockResolvedValue({ data: { payload: { orders: [] } } });
    jest.spyOn(client as any, 'executeWithRetry').mockImplementation(
      async (_storeId: string, _apiKey: string, _endpoint: string, _method: string, request: (http: any) => Promise<any>) => {
        const response = await request({ get });
        return response.data;
      },
    );
    const fromMs = Date.parse('2026-07-01T00:00:00Z');
    const toMs = Date.parse('2026-08-31T23:59:59Z');

    await client.getFbsOrders('store', 'api-key', 93715, 'COMPLETED', 0, 50, {
      dateFrom: fromMs,
      dateTo: toMs,
    });

    expect(get).toHaveBeenCalledWith('/v2/fbs/orders', {
      params: {
        shopIds: 93715,
        status: 'COMPLETED',
        page: 0,
        size: 50,
        dateFrom: Math.floor(fromMs / 1000),
        dateTo: Math.floor(toMs / 1000),
      },
      timeout: 10_000,
    });
  });
});

describe('UzumApiClient expense pagination', () => {
  it('reads every dated expense page even when the final page is short', async () => {
    const client = new UzumApiClient({} as any, {} as any);
    const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
    const getExpenses = jest.spyOn(client, 'getExpenses')
      .mockResolvedValueOnce({ payments: firstPage, totalElements: 101 })
      .mockResolvedValueOnce({ payments: [{ id: 101 }], totalElements: 101 });
    jest.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    const result = await client.getAllExpenses(
      'store',
      'api-key',
      [93715],
      Date.UTC(2020, 0, 1),
      Date.UTC(2026, 8, 23),
      true,
    );

    expect(result).toHaveLength(101);
    expect(getExpenses).toHaveBeenCalledTimes(2);
    expect(getExpenses).toHaveBeenNthCalledWith(2, 'store', 'api-key', [93715], expect.objectContaining({ page: 1 }));
  });

  it('does not return a partial financial ledger in strict mode', async () => {
    const client = new UzumApiClient({} as any, {} as any);
    jest.spyOn(client, 'getExpenses')
      .mockResolvedValueOnce({
        payments: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })),
        totalElements: 200,
      })
      .mockRejectedValueOnce(new Error('Uzum page failed'));
    jest.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    await expect(client.getAllExpenses(
      'store',
      'api-key',
      [93715],
      Date.UTC(2020, 0, 1),
      Date.UTC(2026, 8, 23),
      true,
    )).rejects.toThrow('Uzum page failed');
  });
});
