/**
 * Judging and costing rules for the Gemini schedule-assistant benchmark.
 *
 * Kept out of the runner so the parts that decide whether a model passed can be unit tested without
 * spending a single upstream call. The runner only does I/O.
 */

/**
 * Official standard (paid tier) list prices, USD per 1M tokens.
 * Source: https://ai.google.dev/gemini-api/docs/pricing — read 2026-08-17.
 * `output` covers output and thinking tokens, which Google bills together.
 * `audioInput` is null when the price page does not itemize audio separately for that model; the
 * cost of a request carrying audio tokens is then reported as unknown instead of guessed.
 */
const MODEL_PRICING = {
  'gemini-3.1-flash-lite': { textInput: 0.25, audioInput: 0.5, output: 1.5, note: '텍스트 입력 $0.25 / 오디오 입력 $0.50 / 출력·사고 $1.50' },
  'gemini-3.5-flash-lite': { textInput: 0.3, audioInput: 0.3, output: 2.5, note: '텍스트·이미지·비디오·오디오 입력 $0.30 / 출력·사고 $2.50' },
  'gemini-3.6-flash': { textInput: 0.75, audioInput: null, output: 3.75, note: '텍스트·이미지·비디오 입력 $0.75, 출력·사고 $3.75 (2026-12-31까지 프로모션 단가, 2027-01-01부터 $1.50/$7.50). 오디오 입력 단가는 가격표에 별도 표기 없음' },
};

const PRICING_SOURCE = { url: 'https://ai.google.dev/gemini-api/docs/pricing', verifiedOn: '2026-08-17', tier: 'standard-paid' };

function pricingFor(model) {
  return MODEL_PRICING[model] ?? null;
}

/**
 * Returns USD for one request, or null when it cannot be computed exactly. Never estimates:
 * an unpriced modality has to surface as "unknown", otherwise a wrong number reads like a measurement.
 */
function estimateCost(model, usage) {
  const pricing = pricingFor(model);
  if (!pricing || !usage) return null;
  const modality = Object.fromEntries((usage.inputTokensByModality ?? []).map((item) => [item.modality, item.tokens]));
  const classified = Object.values(modality).reduce((sum, tokens) => sum + tokens, 0);
  // Anything the API did not label is text: every non-text part is reported explicitly.
  const textInput = (modality.text ?? 0) + Math.max(0, (usage.totalInputTokens ?? 0) - classified);
  const audioInput = modality.audio ?? 0;
  if (audioInput > 0 && pricing.audioInput === null) return null;
  const output = (usage.totalOutputTokens ?? 0) + (usage.totalThoughtTokens ?? 0);
  return (textInput * pricing.textInput + audioInput * (pricing.audioInput ?? 0) + output * pricing.output) / 1_000_000;
}

/**
 * The value the app's own draft carries before the user has chosen a transport. A patch that repeats
 * it changes nothing in the app, so for "the model must not fill this in" checks it counts as
 * unfilled — otherwise a model would be scored as hallucinating for echoing the draft back.
 */
const UNSET_TRANSPORT = 'AI 추천';

/**
 * The checks a fixture asks for, independent of any response. A request that failed outright still
 * counts these as missed, so a crashing model cannot score a better field accuracy than a wrong one.
 */
function expectedChecks(fixture) {
  const labels = Object.entries(fixture.expectedPatch ?? {}).map(([key, expected]) => `${key}=${JSON.stringify(expected)}`);
  for (const key of fixture.expectedFilledPatch ?? []) labels.push(`${key}=filled`);
  for (const key of fixture.expectedNullPatch ?? []) labels.push(`${key}=null`);
  if (fixture.expectedRoutine) labels.push(`routine=${fixture.expectedRoutine.label}/${fixture.expectedRoutine.minutes}`);
  if (fixture.forbiddenRoutine) labels.push(`routine excludes ${fixture.forbiddenRoutine}`);
  if (fixture.expectedClarificationField !== undefined) labels.push(`clarification=${fixture.expectedClarificationField ?? 'none'}`);
  if (fixture.expectedQuestion !== undefined) labels.push(`question=${fixture.expectedQuestion}`);
  if (fixture.expectedReadyToApply !== undefined) labels.push(`readyToApply=${fixture.expectedReadyToApply}`);
  if (fixture.expectedEntryType !== undefined) labels.push(`entryType=${fixture.expectedEntryType}`);
  return labels;
}

/** True when the body is a schedule turn the production Edge Function contract would accept. */
function isStructuredResponse(body) {
  return Boolean(body)
    && typeof body === 'object'
    && (body.entryType === 'schedule' || body.entryType === 'task')
    && typeof body.transcript === 'string'
    && typeof body.assistantMessage === 'string'
    && typeof body.readyToApply === 'boolean'
    && Boolean(body.patch)
    && typeof body.patch === 'object'
    && Boolean(body._meta?.usage);
}

function evaluate(fixture, body) {
  const labels = expectedChecks(fixture);
  if (!isStructuredResponse(body)) return labels.map((label) => ({ label, ok: false }));

  const checks = [];
  for (const [key, expected] of Object.entries(fixture.expectedPatch ?? {})) {
    const accepted = [expected, ...(fixture.acceptedPatchValues?.[key] ?? [])];
    checks.push({ label: `${key}=${JSON.stringify(expected)}`, ok: accepted.some((value) => sameFieldValue(key, body.patch[key], value)) });
  }
  for (const key of fixture.expectedFilledPatch ?? []) {
    checks.push({ label: `${key}=filled`, ok: !isUnfilled(key, body.patch[key]) });
  }
  // Hallucination guard: a field the person never mentioned must come back empty, not invented.
  for (const key of fixture.expectedNullPatch ?? []) {
    checks.push({ label: `${key}=null`, ok: isUnfilled(key, body.patch[key]) });
  }
  if (fixture.expectedRoutine) {
    checks.push({
      label: `routine=${fixture.expectedRoutine.label}/${fixture.expectedRoutine.minutes}`,
      ok: Array.isArray(body.patch.routines)
        && body.patch.routines.some((routine) => routine.label === fixture.expectedRoutine.label && routine.minutes === fixture.expectedRoutine.minutes),
    });
  }
  if (fixture.forbiddenRoutine) {
    checks.push({
      label: `routine excludes ${fixture.forbiddenRoutine}`,
      ok: Array.isArray(body.patch.routines) && !body.patch.routines.some((routine) => routine.label === fixture.forbiddenRoutine),
    });
  }
  if (fixture.expectedClarificationField !== undefined) {
    const actual = body.clarification?.field ?? null;
    checks.push({ label: `clarification=${fixture.expectedClarificationField ?? 'none'}`, ok: actual === fixture.expectedClarificationField });
  }
  if (fixture.expectedQuestion !== undefined) {
    checks.push({ label: `question=${fixture.expectedQuestion}`, ok: Boolean(body.question) === fixture.expectedQuestion });
  }
  if (fixture.expectedReadyToApply !== undefined) {
    checks.push({ label: `readyToApply=${fixture.expectedReadyToApply}`, ok: body.readyToApply === fixture.expectedReadyToApply });
  }
  if (fixture.expectedEntryType !== undefined) {
    checks.push({ label: `entryType=${fixture.expectedEntryType}`, ok: body.entryType === fixture.expectedEntryType });
  }
  return checks;
}

function isUnfilled(key, actual) {
  if (actual === null || actual === undefined || actual === '') return true;
  return key === 'transport' && actual === UNSET_TRANSPORT;
}

function sameFieldValue(key, actual, expected) {
  if (key === 'destination' && typeof actual === 'string' && typeof expected === 'string') {
    return actual.replace(/\s+/g, '') === expected.replace(/\s+/g, '');
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

/**
 * Splits a request that produced no usable answer into the three things it can mean, so a model is
 * never blamed for something the harness or the network did:
 *   `model`          — the model answered, but the answer breaks the contract production enforces.
 *   `harness`        — the request or the response envelope was wrong before the model got a say
 *                      (our auth, our request body, a model this key cannot call, a mislabelled row).
 *   `infrastructure` — a timeout, rate limit or 5xx that says nothing about answer quality.
 * Returns null for a run that did produce a valid response, however wrong its fields were.
 */
function classifyFailure(run) {
  if (run.structured) return null;
  if (run.modelMismatch) return 'harness';
  if (run.httpStatus === null || run.httpStatus === undefined) return 'infrastructure';
  if (run.httpStatus === 401 || run.httpStatus === 403) return 'harness';
  switch (run.error) {
    case 'INVALID_INPUT':
    case 'SERVICE_NOT_CONFIGURED':
      return 'harness';
    case 'INVALID_RESPONSE':
    case 'UPSTREAM_REJECTED':
      return 'model';
    case 'UPSTREAM_UNAVAILABLE':
    case 'SERVICE_UNAVAILABLE':
      return 'infrastructure';
    default:
      // A 200 whose body does not satisfy the contract is an envelope problem, not a model answer.
      return run.httpStatus === 200 ? 'harness' : 'infrastructure';
  }
}

function countFailureKinds(runs) {
  const counts = { model: 0, harness: 0, infrastructure: 0 };
  for (const run of runs) {
    const kind = run.failureKind ?? classifyFailure(run);
    if (kind) counts[kind] += 1;
  }
  return counts;
}

/** Nearest-rank percentile. Returns null for an empty sample rather than a misleading 0. */
function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * Aggregates every run of one model. `runs` are the per-request records the runner produced.
 * A run that never returned a valid response still counts against every rate, and its latency is
 * excluded from p50/p95 so a fast failure cannot look like a fast answer.
 */
function summarizeModel(model, runs) {
  const okLatencies = runs.filter((run) => run.structured).map((run) => run.latencyMs);
  const costs = runs.map((run) => run.estimatedCostUsd).filter((cost) => typeof cost === 'number');
  const averageCost = mean(costs);
  const matched = runs.reduce((sum, run) => sum + run.matchedFields, 0);
  const total = runs.reduce((sum, run) => sum + run.totalFields, 0);
  return {
    model,
    pricing: pricingFor(model),
    runs: runs.length,
    fixtures: new Set(runs.map((run) => run.fixtureId)).size,
    structuredSuccessRate: ratio(runs.filter((run) => run.structured).length, runs.length),
    casePassRate: ratio(runs.filter((run) => run.ok).length, runs.length),
    fieldAccuracy: ratio(matched, total),
    matchedFields: matched,
    totalFields: total,
    latencyMs: { p50: percentile(okLatencies, 0.5), p95: percentile(okLatencies, 0.95) },
    costedRuns: costs.length,
    averageRequestCostUsd: averageCost,
    estimatedCostPer1000Usd: averageCost === null ? null : averageCost * 1_000,
    failureKinds: countFailureKinds(runs),
    failingFixtures: [...new Set(runs.filter((run) => !run.ok).map((run) => run.fixtureId))].sort(),
  };
}

/**
 * Combines summaries the runner wrote in separate invocations into one, so a long benchmark can be
 * split across several synchronous commands without changing what is reported. Refuses to merge
 * parts that did not measure the same thing, because averaging across different endpoints, fixture
 * suites or price tables would produce a number that describes no real run.
 */
function mergeSummaries(parts) {
  if (!parts.length) throw new Error('병합할 결과 파일이 없습니다.');
  const key = (part) => JSON.stringify([
    part.endpoint,
    part.fixtureCount,
    part.suiteFingerprint,
    part.clientContext,
    part.pricingSource,
    part.requestedModels,
    part.includesSyntheticAudio,
    part.parallelModels,
    part.fixtureConcurrency,
  ]);
  const mismatched = parts.filter((part) => key(part) !== key(parts[0]));
  if (mismatched.length) throw new Error('endpoint, fixture suite, 모델 목록, clientContext, 단가 출처가 다른 결과는 병합할 수 없습니다.');

  const attempts = parts.flatMap((part) => part.attempts ?? []);
  if (new Set(attempts).size !== attempts.length) {
    throw new Error('같은 attempt가 둘 이상 포함된 결과는 병합할 수 없습니다.');
  }

  const runs = parts.flatMap((part) => part.runs);
  const byModel = new Map();
  for (const run of runs) {
    const model = run.model ?? 'unknown';
    if (!byModel.has(model)) byModel.set(model, []);
    byModel.get(model).push(run);
  }
  return {
    ...parts[0],
    generatedAt: parts.map((part) => part.generatedAt).sort().at(-1),
    mergedFrom: parts.map((part) => ({ generatedAt: part.generatedAt, attempts: part.attempts, runs: part.runs.length })),
    repeats: parts.reduce((sum, part) => sum + part.repeats, 0),
    attempts: attempts.sort((a, b) => a - b),
    models: [...byModel.entries()].map(([model, modelRuns]) => summarizeModel(model, modelRuns)),
    runs,
  };
}

module.exports = {
  MODEL_PRICING,
  PRICING_SOURCE,
  UNSET_TRANSPORT,
  classifyFailure,
  countFailureKinds,
  estimateCost,
  evaluate,
  expectedChecks,
  isStructuredResponse,
  isUnfilled,
  mean,
  mergeSummaries,
  percentile,
  pricingFor,
  ratio,
  sameFieldValue,
  summarizeModel,
};
