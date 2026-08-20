import { createEmptyAnalyticsStore } from '../analytics';
import { createEmptyPlusInterestState } from '../monetization';
import { buildPilotSummary } from '../pilot-summary';
import { PilotSummaryRemote, trackPilotSummarySend, whenPilotSummarySettled } from '../pilot-summary-remote';

const summary = buildPilotSummary(createEmptyAnalyticsStore(), createEmptyPlusInterestState(), 'worker');

function remote({
  baseUrl = 'https://api.example.com',
  token = 'id-token' as string | null,
  respond = () => Promise.resolve({ ok: true, status: 200 }),
}: {
  baseUrl?: string;
  token?: string | null;
  respond?: (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;
} = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = new PilotSummaryRemote({
    baseUrl,
    getIdToken: () => Promise.resolve(token),
    fetcher: (url, init) => { calls.push({ url, init }); return respond(url, init); },
  });
  return { client, calls };
}

describe('sending the pilot aggregates', () => {
  it('posts the aggregates for the signed-in account', async () => {
    const { client, calls } = remote();

    await expect(client.save(summary)).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.example.com/v1/pilot-summary');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ summary: expect.objectContaining({ segment: 'worker' }) });
  });

  it('sends nothing at all when nobody is signed in', async () => {
    // Leaving the screen must not become a reason to prompt for a login, and there is no account to
    // key the row to anyway.
    const { client, calls } = remote({ token: null });

    await expect(client.save(summary)).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('stays quiet when the server is not configured or cannot be reached', async () => {
    const unconfigured = remote({ baseUrl: '' });
    await expect(unconfigured.client.save(summary)).resolves.toBe(false);
    expect(unconfigured.calls).toHaveLength(0);

    const offline = remote({ respond: () => Promise.reject(new Error('offline')) });
    await expect(offline.client.save(summary)).resolves.toBe(false);
  });

  it('separates a device with no token from a server that refused, when erasing an account', async () => {
    // Account deletion may walk past 'unavailable' — there is nothing to erase from here — but a
    // refusal has to stop it, or the account's numbers outlive the account.
    const signedOut = remote({ token: null });
    await expect(signedOut.client.clear()).resolves.toBe('unavailable');

    const refused = remote({ respond: () => Promise.resolve({ ok: false, status: 503 }) });
    await expect(refused.client.clear()).resolves.toBe('failed');

    const cleared = remote();
    await expect(cleared.client.clear()).resolves.toBe('cleared');
    expect(cleared.calls[0].init.method).toBe('DELETE');
  });

  it('lets deletion wait for a send that is already in the air', async () => {
    // The send starts as the Plus screen closes and nobody waits for it. Deleting the account right
    // after must not overtake it, or the row is written back onto a server it was just removed from.
    const order: string[] = [];
    let land = () => {};
    const landed = new Promise<void>((resolve) => { land = resolve; });
    const { client } = remote({
      respond: () => landed.then(() => { order.push('save'); return { ok: true, status: 200 }; }),
    });

    const saving = client.save(summary);
    const deleting = whenPilotSummarySettled().then(() => { order.push('delete'); });

    land();
    await Promise.all([saving, deleting]);

    expect(order).toEqual(['save', 'delete']);
  });

  it('waits for tracked work even when the send has not been reached yet', async () => {
    // The screen loads its counters before it can send them, so what is registered is the whole
    // chain. Tracking only the request itself would leave a gap for deletion to slip through.
    const order: string[] = [];
    let start = () => {};
    const started = new Promise<void>((resolve) => { start = resolve; });
    void trackPilotSummarySend(() => started.then(() => { order.push('sent'); }));

    const deleting = whenPilotSummarySettled().then(() => { order.push('delete'); });
    start();
    await deleting;

    expect(order).toEqual(['sent', 'delete']);
  });


  it('sends one summary at a time, so the older one cannot land last', async () => {
    // Two visits closed in quick succession upsert the same row. Overlapping, the first to finish
    // is not the first to be sent, and the account is left holding the state it had before.
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const landed: (() => void)[] = [];
    const order: string[] = [];
    const { client } = remote({
      respond: () => new Promise((resolve) => {
        const index = landed.length + 1;
        landed.push(() => { order.push(`sent-${index}`); resolve({ ok: true, status: 200 }); });
      }),
    });

    const first = client.save(summary);
    const second = client.save(summary);
    await flush();

    // Only the first request has been started at all; the second is still queued behind it.
    expect(landed).toHaveLength(1);
    landed[0]();
    await first;
    await flush();
    expect(landed).toHaveLength(2);
    landed[1]();
    await second;

    expect(order).toEqual(['sent-1', 'sent-2']);
  });

  it('treats a missing server as a failure to erase rather than nothing to erase', async () => {
    // The rows exist on a server that was configured when they were written. Reporting 'unavailable'
    // here would let account deletion continue past data it never touched.
    const { client } = remote({ baseUrl: '' });

    await expect(client.clear()).resolves.toBe('failed');
  });
});
