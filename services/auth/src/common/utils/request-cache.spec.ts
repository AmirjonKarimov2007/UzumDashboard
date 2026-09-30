import { RequestCache } from './request-cache';

describe('RequestCache', () => {
  it('coalesces concurrent reads and caches the successful result', async () => {
    const cache = new RequestCache();
    const load = jest.fn().mockResolvedValue({ total: 4 });
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.get<{ total: number }>('s:orders', 1000, load)));
    expect(results.every((r) => r.total === 4)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('does not let a pre-mutation request repopulate an invalidated cache', async () => {
    const cache = new RequestCache();
    let resolve!: (value: string) => void;
    const pending = cache.get('s:orders', 1000, () => new Promise<string>((done) => { resolve = done; }));
    await Promise.resolve();
    cache.invalidate('s:');
    resolve('old');
    await pending;
    expect(await cache.get('s:orders', 1000, async () => 'new')).toBe('new');
  });
  it('never caches a failed request or an absent label', async () => {
    const cache = new RequestCache();
    await expect(cache.get('k', 1000, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(await cache.get('k', 1000, async () => null)).toBeNull();
    expect(await cache.get('k', 1000, async () => 'label')).toBe('label');
  });
  it('expires old entries and bounds retained values', async () => {
    const cache = new RequestCache(1);
    await cache.get('a', 1000, async () => 1);
    await cache.get('b', 0, async () => 2);
    expect(await cache.get('a', 1000, async () => 3)).toBe(3);
    expect(await cache.get('b', 1000, async () => 4)).toBe(4);
  });
});
