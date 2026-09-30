import { SyncService } from './sync.service';

describe('Sync status availability', () => {
  it('returns connection status when the queue stalls and does not duplicate queue reads', async () => {
    jest.useFakeTimers();
    const queue = { getWaiting: jest.fn(() => new Promise(() => {})), getActive: jest.fn(() => new Promise(() => {})) };
    const stores = { getConnectionInfo: jest.fn().mockResolvedValue({ isConnected: true }) };
    const db = { syncLog: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new SyncService(queue as any, db as any, stores as any);
    const first = service.getSyncStatus('store');
    await jest.advanceTimersByTimeAsync(751);
    expect(await first).toMatchObject({ isConnected: true, queueStatusAvailable: false });
    const second = service.getSyncStatus('store');
    await jest.advanceTimersByTimeAsync(751);
    expect(await second).toMatchObject({ isConnected: true });
    expect(queue.getWaiting).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
