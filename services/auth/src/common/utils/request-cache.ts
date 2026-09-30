/** Bounded, short-lived cache for identical upstream reads. Errors are never cached. */
export class RequestCache {
  private values = new Map<string, { value: any; expiresAt: number }>();
  private pending = new Map<string, Promise<any>>();
  constructor(private readonly maxEntries = 300) {}

  get<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    if (this.pending.has(key)) return this.pending.get(key)!;
    const request = Promise.resolve().then(load).then((value) => {
      if (this.pending.get(key) === request && value != null) {
        this.values.delete(key);
        this.values.set(key, { value, expiresAt: Date.now() + ttl });
        while (this.values.size > this.maxEntries) this.values.delete(this.values.keys().next().value!);
      }
      return value;
    }).finally(() => { if (this.pending.get(key) === request) this.pending.delete(key); });
    this.pending.set(key, request);
    return request;
  }

  invalidate(prefix = '') {
    for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key);
    // An old response must not repopulate the cache after a mutation.
    for (const key of this.pending.keys()) if (key.startsWith(prefix)) this.pending.delete(key);
  }
}
