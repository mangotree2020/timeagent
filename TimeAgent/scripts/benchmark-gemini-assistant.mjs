import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const endpoint = process.env.ASSISTANT_BENCHMARK_URL
  ?? 'https://chpsoncuxjpgugowrydb.supabase.co/functions/v1/assistant/v1/schedule/turn';
const fixtureUrl = new URL('./fixtures/gemini-schedule-benchmark.json', import.meta.url);
const cases = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const audioFixturePath = process.env.ASSISTANT_BENCHMARK_AUDIO;
if (audioFixturePath) {
  cases.push({
    id: 'synthetic-audio',
    audioBase64: (await readFile(audioFixturePath)).toString('base64'),
    input: '합성 음성: 내일 오후 3시 서울시청, 지하철, 자료 준비 10분',
    expectedPatch: { date: '2026-07-29', appointmentTime: '15:00', destination: '서울시청', transport: '지하철' },
    expectedRoutine: { label: '자료 준비', minutes: 10 }
  });
}
const defaultDraft = {
  version: 1,
  step: 0,
  title: '친구와 볼링',
  date: '2026-07-28',
  appointmentTime: '14:00',
  destination: '서면 볼링장',
  destinationAddress: '부산진구 중앙대로 672',
  destinationCoordinate: null,
  transport: 'AI 추천',
  priority: 'on-time',
  routines: [
    { id: 'shower', icon: 'shower', label: '샤워', minutes: 18 },
    { id: 'makeup', icon: 'makeup', label: '화장', minutes: 12 },
    { id: 'dress', icon: 'dress', label: '옷 입기', minutes: 8 },
    { id: 'bag', icon: 'bag', label: '짐 챙기기', minutes: 5 }
  ]
};

const results = [];
for (const fixture of cases) {
  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: `benchmark_${fixture.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        draft: { ...defaultDraft, ...fixture.draft },
        history: fixture.history ?? [],
        input: fixture.audioBase64
          ? { kind: 'audio', base64: fixture.audioBase64, mimeType: 'audio/m4a' }
          : { kind: 'text', text: fixture.input },
        clientContext: {
          nowIso: '2026-07-27T18:30:00.000Z',
          timezone: 'Asia/Seoul',
          localDate: '2026-07-28'
        }
      }),
      signal: AbortSignal.timeout(60_000)
    });
    body = await response.json();
  } catch (error) {
    results.push({ id: fixture.id, inputKind: fixture.audioBase64 ? 'audio' : 'text', ok: false, latencyMs: Math.round(performance.now() - started), error: error.message });
    continue;
  }

  const checks = evaluate(fixture, body);
  results.push({
    id: fixture.id,
    inputKind: fixture.audioBase64 ? 'audio' : 'text',
    ok: response.ok && checks.every((check) => check.ok),
    httpStatus: response.status,
    latencyMs: Math.round(performance.now() - started),
    matchedFields: checks.filter((check) => check.ok).length,
    totalFields: checks.length,
    failures: checks.filter((check) => !check.ok).map((check) => check.label),
    usage: body?._meta?.usage ?? null,
    estimatedCostUsd: estimateCost(body?._meta?.usage)
  });
}

const latencies = results.filter((result) => result.httpStatus === 200).map((result) => result.latencyMs).sort((a, b) => a - b);
const matchedFields = results.reduce((sum, result) => sum + (result.matchedFields ?? 0), 0);
const totalFields = results.reduce((sum, result) => sum + (result.totalFields ?? 0), 0);
const measuredCosts = results.map((result) => result.estimatedCostUsd).filter((cost) => cost !== null);
const textResults = results.filter((result) => result.inputKind === 'text');
const audioResults = results.filter((result) => result.inputKind === 'audio');
const summary = {
  generatedAt: new Date().toISOString(),
  endpoint,
  model: 'gemini-3.1-flash-lite',
  fixtureCount: cases.length,
  includesSyntheticAudio: Boolean(audioFixturePath),
  structuredSuccessRate: ratio(results.filter((result) => result.httpStatus === 200 && result.usage).length, cases.length),
  casePassRate: ratio(results.filter((result) => result.ok).length, cases.length),
  fieldAccuracy: ratio(matchedFields, totalFields),
  latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
  averageRequestCostUsd: measuredCosts.length ? measuredCosts.reduce((sum, cost) => sum + cost, 0) / measuredCosts.length : null,
  estimatedCostPer1000Usd: measuredCosts.length ? measuredCosts.reduce((sum, cost) => sum + cost, 0) / measuredCosts.length * 1_000 : null,
  byInputKind: {
    text: summarizeKind(textResults),
    audio: summarizeKind(audioResults)
  },
  pricing: { textInputPerMillion: 0.25, audioInputPerMillion: 0.50, outputAndThoughtPerMillion: 1.50 },
  results
};

console.log(JSON.stringify(summary, null, 2));
if (results.some((result) => !result.ok || result.httpStatus !== 200 || !result.usage)) process.exitCode = 1;

function evaluate(fixture, body) {
  if (!body || typeof body !== 'object' || !body.patch || typeof body.patch !== 'object') {
    return [{ label: 'structured response', ok: false }];
  }
  const checks = Object.entries(fixture.expectedPatch ?? {}).map(([key, expected]) => ({
    label: `${key}=${JSON.stringify(expected)}`,
    ok: sameFieldValue(key, body.patch[key], expected)
  }));
  if (fixture.expectedRoutine) {
    checks.push({
      label: `routine=${fixture.expectedRoutine.label}/${fixture.expectedRoutine.minutes}`,
      ok: Array.isArray(body.patch.routines) && body.patch.routines.some((routine) => routine.label === fixture.expectedRoutine.label && routine.minutes === fixture.expectedRoutine.minutes)
    });
  }
  if (fixture.forbiddenRoutine) {
    checks.push({
      label: `routine excludes ${fixture.forbiddenRoutine}`,
      ok: Array.isArray(body.patch.routines) && !body.patch.routines.some((routine) => routine.label === fixture.forbiddenRoutine)
    });
  }
  if (fixture.expectedQuestion !== undefined) {
    checks.push({ label: `question=${fixture.expectedQuestion}`, ok: Boolean(body.question) === fixture.expectedQuestion });
  }
  return checks.length ? checks : [{ label: 'structured response', ok: true }];
}

function sameFieldValue(key, actual, expected) {
  if (key === 'destination' && typeof actual === 'string' && typeof expected === 'string') {
    return actual.replace(/\s+/g, '') === expected.replace(/\s+/g, '');
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function estimateCost(usage) {
  if (!usage) return null;
  const modality = Object.fromEntries((usage.inputTokensByModality ?? []).map((item) => [item.modality, item.tokens]));
  const knownInput = Object.values(modality).reduce((sum, tokens) => sum + tokens, 0);
  const unclassifiedText = Math.max(0, usage.totalInputTokens - knownInput);
  const textInput = (modality.text ?? 0) + unclassifiedText;
  const audioInput = modality.audio ?? 0;
  return (textInput * 0.25 + audioInput * 0.50 + (usage.totalOutputTokens + usage.totalThoughtTokens) * 1.50) / 1_000_000;
}

function percentile(values, quantile) {
  if (!values.length) return null;
  return values[Math.ceil(values.length * quantile) - 1];
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function summarizeKind(kindResults) {
  if (!kindResults.length) return null;
  const kindLatencies = kindResults.map((result) => result.latencyMs).sort((a, b) => a - b);
  const costs = kindResults.map((result) => result.estimatedCostUsd).filter((cost) => cost !== null);
  return {
    count: kindResults.length,
    p50LatencyMs: percentile(kindLatencies, 0.5),
    p95LatencyMs: percentile(kindLatencies, 0.95),
    averageRequestCostUsd: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length : null,
    estimatedCostPer1000Usd: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length * 1_000 : null
  };
}
