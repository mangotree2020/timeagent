import { parseRemoteSavedPlaces, SavedPlace } from '@/lib/saved-places';

type RemoteResponse = Pick<Response, 'ok' | 'status' | 'json'>;
type RemoteFetcher = (input: string, init: RequestInit) => Promise<RemoteResponse>;
type IdTokenSource = () => Promise<string | null>;

/**
 * Talks to the saved-places endpoints of the mobility function. Every call carries the Google ID
 * token so the server can key the list to the signed-in account. A signed-out user or an
 * unreachable server both resolve to null: the caller falls back to the local list either way.
 */
export class SavedPlacesRemote {
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

  async list(): Promise<SavedPlace[] | null> {
    const response = await this.request('/v1/saved-places', { method: 'GET' });
    if (!response?.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    return parseRemoteSavedPlaces(payload);
  }

  async remember(place: SavedPlace): Promise<boolean> {
    const response = await this.request('/v1/saved-places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place }),
    });
    return response?.ok ?? false;
  }

  /**
   * Erases every place stored for the signed-in account, as part of account deletion.
   * 'unavailable' means no ID token exists on this device, so there is nothing to send and the
   * caller may proceed; 'failed' means the server refused or was unreachable and the caller must
   * not silently continue, or the account's places would outlive the account.
   */
  async clear(): Promise<'cleared' | 'unavailable' | 'failed'> {
    // A missing server URL is a configuration fault, not a device without a token:
    // proceeding would strand the account's places on a server that does exist.
    if (!this.configured) return 'failed';
    const token = await this.getIdToken().catch(() => null);
    if (!token) return 'unavailable';
    const response = await this.request('/v1/saved-places', { method: 'DELETE' });
    return response?.ok ? 'cleared' : 'failed';
  }

  private async request(path: string, init: RequestInit): Promise<RemoteResponse | null> {
    if (!this.configured) return null;
    const token = await this.getIdToken().catch(() => null);
    if (!token) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, {
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

export function createConfiguredSavedPlacesRemote(getIdToken: IdTokenSource) {
  return new SavedPlacesRemote({
    baseUrl: process.env.EXPO_PUBLIC_MOBILITY_API_BASE_URL ?? '',
    getIdToken,
  });
}
