import { PilotSummary, pilotSummaryPayload } from '@/lib/pilot-summary';

type RemoteResponse = Pick<Response, 'ok' | 'status'>;
type RemoteFetcher = (input: string, init: RequestInit) => Promise<RemoteResponse>;
type IdTokenSource = () => Promise<string | null>;

/**
 * Everything already on its way to the pilot endpoint. Sending happens as a screen closes and
 * nobody waits for it, so account deletion has to: a save that lands after the delete would put the
 * account's row back on a server it was just removed from.
 */
let inFlight: Promise<unknown> = Promise.resolve();

/**
 * Queues work that ends in a send. Queued, not merely watched: two visits closed in quick
 * succession would otherwise upsert the same row at once, and the older one finishing last would
 * overwrite the newer state and stamp it as the latest. Deletion waits on the same queue.
 */
export function trackPilotSummarySend<T>(work: () => Promise<T>): Promise<T> {
  const queued = inFlight.catch(() => undefined).then(work);
  inFlight = queued.catch(() => undefined);
  return queued;
}

export function whenPilotSummarySettled(): Promise<unknown> {
  return inFlight;
}

/**
 * Sends the Phase 0 aggregates to the server, where they are counted for the whole pilot rather
 * than shown to anyone here. One row per account: leaving the Plus screen again replaces what was
 * sent before, so the operator reads the current state of each tester and not a pile of snapshots.
 *
 * Nothing about this is worth interrupting someone for. A signed-out device, an unconfigured
 * server, and an unreachable one all resolve to false and the screen closes exactly as it would
 * have.
 */
export class PilotSummaryRemote {
  private readonly baseUrl: string;
  private readonly fetcher: RemoteFetcher;
  private readonly getIdToken: IdTokenSource;
  private readonly timeoutMs: number;

  constructor({ baseUrl, getIdToken, fetcher = fetch, timeoutMs = 8_000 }: {
    baseUrl: string;
    getIdToken: IdTokenSource;
    fetcher?: RemoteFetcher;
    timeoutMs?: number;
  }) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
    this.fetcher = fetcher;
    this.getIdToken = getIdToken;
    this.timeoutMs = timeoutMs;
  }

  get configured() {
    return this.baseUrl.startsWith('https://');
  }

  async save(summary: PilotSummary): Promise<boolean> {
    const response = await trackPilotSummarySend(() => this.request({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: pilotSummaryPayload(summary) }),
    }));
    return response?.ok ?? false;
  }

  /**
   * Erases what this account sent, as part of account deletion. 'unavailable' means the device has
   * no ID token left to send one with, so there is nothing this call can do and the caller may
   * proceed; 'failed' means the server exists and refused, which the caller must not walk past.
   */
  async clear(): Promise<'cleared' | 'unavailable' | 'failed'> {
    if (!this.configured) return 'failed';
    const token = await this.getIdToken().catch(() => null);
    if (!token) return 'unavailable';
    const response = await this.request({ method: 'DELETE' });
    return response?.ok ? 'cleared' : 'failed';
  }

  private async request(init: RequestInit): Promise<RemoteResponse | null> {
    if (!this.configured) return null;
    const token = await this.getIdToken().catch(() => null);
    if (!token) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(`${this.baseUrl}/v1/pilot-summary`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createConfiguredPilotSummaryRemote(getIdToken: IdTokenSource) {
  return new PilotSummaryRemote({
    baseUrl: process.env.EXPO_PUBLIC_MOBILITY_API_BASE_URL ?? '',
    getIdToken,
  });
}
