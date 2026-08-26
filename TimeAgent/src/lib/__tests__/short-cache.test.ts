import { createProviderMetrics, outcomeForStatus } from '../../../supabase/functions/mobility/provider-metrics';
import { createShortCache } from '../../../supabase/functions/mobility/short-cache';

describe('short cache', () => {
  it('answers the same question once within the TTL and keeps the original answer as it was', async () => {
    const cache = createShortCache<{ calculatedAt: string }>();
    let clock = 1_000;
    const factory = jest.fn(async () => ({ calculatedAt: `t${clock}` }));

    const first = await cache.getOrCreate('k', 60_000, factory, () => clock);
    clock += 30_000;
    const second = await cache.getOrCreate('k', 60_000, factory, () => clock);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    clock += 31_000;
    const third = await cache.getOrCreate('k', 60_000, factory, () => clock);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(third.calculatedAt).toBe('t62000');
  });

  it('shares one in-flight lookup between concurrent askers', async () => {
    const cache = createShortCache<number>();
    let resolve: (value: number) => void = () => undefined;
    const factory = jest.fn(() => new Promise<number>((done) => { resolve = done; }));
    const a = cache.getOrCreate('k', 1_000, factory);
    const b = cache.getOrCreate('k', 1_000, factory);
    resolve(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failed lookup', async () => {
    const cache = createShortCache<number>();
    const failing = jest.fn(async () => { throw new Error('upstream'); });
    await expect(cache.getOrCreate('k', 1_000, failing)).rejects.toThrow('upstream');
    const working = jest.fn(async () => 1);
    expect(await cache.getOrCreate('k', 1_000, working)).toBe(1);
    expect(cache.size()).toBe(1);
  });

  it('forgets the oldest entries past its capacity', () => {
    const cache = createShortCache<number>({ maxEntries: 2 });
    cache.set('a', 1, 1_000, 0);
    cache.set('b', 2, 1_000, 0);
    cache.set('c', 3, 1_000, 0);
    expect(cache.get('a', 1)).toBeUndefined();
    expect(cache.get('c', 1)).toBe(3);
  });
});

describe('provider metrics', () => {
  it('counts outcomes and latency per provider and operation, without what was asked', () => {
    const metrics = createProviderMetrics();
    metrics.record('TMAP', 'transit', 'ok', 300);
    metrics.record('TMAP', 'transit', 'ok', 500);
    metrics.record('TMAP', 'transit', 'timeout', 10_000);
    metrics.record('TMAP', 'transit', 'cached');
    metrics.record('TAGO', 'arrivals', 'rate-limited', 120);

    const snapshot = metrics.snapshot();
    expect(snapshot['TMAP.transit']).toMatchObject({ calls: 4, ok: 2, timeout: 1, cached: 1, successRate: 66.7, averageLatencyMs: 3600, latencyMaxMs: 10_000 });
    expect(snapshot['TAGO.arrivals']).toMatchObject({ calls: 1, rateLimited: 1, successRate: 0 });
    expect(JSON.stringify(snapshot)).not.toMatch(/35\.|129\./);
  });

  it('maps upstream statuses to the buckets the counting uses', () => {
    expect(outcomeForStatus(200)).toBe('ok');
    expect(outcomeForStatus(429)).toBe('rate-limited');
    expect(outcomeForStatus(503)).toBe('unavailable');
    expect(outcomeForStatus(400)).toBe('rejected');
  });
});
