/**
 * A small in-memory cache with a short life: the same journey question asked twice in a minute is
 * answered once. The stored answer keeps its original calculated-at stamp, so a cached answer
 * never pretends to be fresher than it is. In-flight lookups are shared too, so two screens asking
 * at the same moment cost one upstream call.
 */
export type ShortCache<T> = {
  get(key: string, now?: number): T | undefined;
  set(key: string, value: T, ttlMs: number, now?: number): void;
  getOrCreate(key: string, ttlMs: number, factory: () => Promise<T>, now?: () => number): Promise<T>;
  size(): number;
};

export function createShortCache<T>({ maxEntries = 256 }: { maxEntries?: number } = {}): ShortCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();

  const prune = (now: number) => {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  return {
    get(key, now = Date.now()) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlMs, now = Date.now()) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: now + ttlMs });
      prune(now);
    },
    async getOrCreate(key, ttlMs, factory, now = Date.now) {
      const cached = this.get(key, now());
      if (cached !== undefined) return cached;
      const pending = inflight.get(key);
      if (pending) return pending;
      const created = factory().then((value) => {
        this.set(key, value, ttlMs, now());
        return value;
      }).finally(() => inflight.delete(key));
      inflight.set(key, created);
      return created;
    },
    size() {
      return entries.size;
    },
  };
}
