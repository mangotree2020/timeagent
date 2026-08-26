/**
 * How each provider is doing, counted without keeping what was asked: no coordinates, no place
 * names, no queries — only outcomes and latency per provider and operation. The health endpoint
 * reports the snapshot so success rate, latency, and call volume can be read off without logs.
 */
export type ProviderOutcome = "ok" | "rejected" | "unavailable" | "timeout" | "rate-limited" | "cached";

export type ProviderMetric = {
  calls: number;
  ok: number;
  rejected: number;
  unavailable: number;
  timeout: number;
  rateLimited: number;
  cached: number;
  /** Milliseconds, over answered calls only; cached answers do not count as latency. */
  latencyTotalMs: number;
  latencyMaxMs: number;
};

export type ProviderMetricsSnapshot = Record<string, ProviderMetric & { successRate: number | null; averageLatencyMs: number | null }>;

export type ProviderMetrics = {
  record(provider: string, operation: string, outcome: ProviderOutcome, latencyMs?: number): void;
  snapshot(): ProviderMetricsSnapshot;
  reset(): void;
};

/** Maps an upstream HTTP status to the outcome bucket, so the counting reads the same everywhere. */
export function outcomeForStatus(status: number): ProviderOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "unavailable";
  return "rejected";
}

export function createProviderMetrics(): ProviderMetrics {
  const metrics = new Map<string, ProviderMetric>();
  const bucket = (provider: string, operation: string) => {
    const key = `${provider}.${operation}`;
    let entry = metrics.get(key);
    if (!entry) {
      entry = { calls: 0, ok: 0, rejected: 0, unavailable: 0, timeout: 0, rateLimited: 0, cached: 0, latencyTotalMs: 0, latencyMaxMs: 0 };
      metrics.set(key, entry);
    }
    return entry;
  };
  return {
    record(provider, operation, outcome, latencyMs) {
      const entry = bucket(provider, operation);
      entry.calls += 1;
      if (outcome === "ok") entry.ok += 1;
      else if (outcome === "rejected") entry.rejected += 1;
      else if (outcome === "unavailable") entry.unavailable += 1;
      else if (outcome === "timeout") entry.timeout += 1;
      else if (outcome === "rate-limited") entry.rateLimited += 1;
      else if (outcome === "cached") entry.cached += 1;
      if (outcome !== "cached" && typeof latencyMs === "number" && Number.isFinite(latencyMs) && latencyMs >= 0) {
        entry.latencyTotalMs += latencyMs;
        entry.latencyMaxMs = Math.max(entry.latencyMaxMs, latencyMs);
      }
    },
    snapshot() {
      const result: ProviderMetricsSnapshot = {};
      for (const [key, entry] of metrics) {
        const answered = entry.calls - entry.cached;
        result[key] = {
          ...entry,
          successRate: answered > 0 ? Math.round((entry.ok / answered) * 1000) / 10 : null,
          averageLatencyMs: answered > 0 ? Math.round(entry.latencyTotalMs / answered) : null,
        };
      }
      return result;
    },
    reset() {
      metrics.clear();
    },
  };
}
