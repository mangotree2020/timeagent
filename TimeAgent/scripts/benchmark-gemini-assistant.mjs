import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import judge from './benchmark-assistant-judge.js';

const {
  MODEL_PRICING,
  PRICING_SOURCE,
  classifyFailure,
  estimateCost,
  evaluate,
  expectedChecks,
  isStructuredResponse,
  mergeSummaries,
  summarizeModel,
} = judge;

// `--merge a.json b.json …` re-summarizes results the runner wrote in separate invocations. A full
// three-model sweep takes longer than a single foreground command should, so it is run one attempt
// at a time and merged here rather than reported as several disconnected benchmarks.
if (process.argv[2] === '--merge') {
  const paths = process.argv.slice(3);
  if (!paths.length) {
    console.error('--merge 뒤에 병합할 결과 파일 경로가 필요합니다.');
    process.exit(2);
  }
  const parts = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
  console.log(JSON.stringify(mergeSummaries(parts), null, 2));
  process.exit(0);
}

const endpoint = process.env.ASSISTANT_BENCHMARK_URL
  ?? 'https://chpsoncuxjpgugowrydb.supabase.co/functions/v1/assistant/v1/schedule/turn';
const token = process.env.ASSISTANT_BENCHMARK_TOKEN?.trim();
const repeats = Number(process.env.ASSISTANT_BENCHMARK_REPEATS ?? 1);
const attemptStart = Number(process.env.ASSISTANT_BENCHMARK_ATTEMPT_START ?? 1);
const models = (process.env.ASSISTANT_BENCHMARK_MODELS ?? '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);
const audioFixturePath = process.env.ASSISTANT_BENCHMARK_AUDIO;
const audioManifestPath = process.env.ASSISTANT_BENCHMARK_AUDIO_MANIFEST;
const parallelModels = process.env.ASSISTANT_BENCHMARK_PARALLEL_MODELS === '1';
const fixtureConcurrency = Number(process.env.ASSISTANT_BENCHMARK_FIXTURE_CONCURRENCY ?? 1);
const progressEvery = Number(process.env.ASSISTANT_BENCHMARK_PROGRESS_EVERY ?? 0);
const storeSyntheticResponses = process.env.ASSISTANT_BENCHMARK_STORE_SYNTHETIC_RESPONSES === '1';
const requestedCaseIds = (process.env.ASSISTANT_BENCHMARK_CASES ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (!Number.isInteger(repeats) || repeats < 1) {
  console.error('ASSISTANT_BENCHMARK_REPEATS는 1 이상의 정수여야 합니다.');
  process.exit(2);
}
if (!Number.isInteger(attemptStart) || attemptStart < 1) {
  console.error('ASSISTANT_BENCHMARK_ATTEMPT_START는 1 이상의 정수여야 합니다.');
  process.exit(2);
}
if (!Number.isInteger(fixtureConcurrency) || fixtureConcurrency < 1 || fixtureConcurrency > 10) {
  console.error('ASSISTANT_BENCHMARK_FIXTURE_CONCURRENCY는 1~10의 정수여야 합니다.');
  process.exit(2);
}
const unpriced = models.filter((model) => !MODEL_PRICING[model]);
if (unpriced.length) {
  console.error(`단가가 기록되지 않은 모델은 비교할 수 없습니다: ${unpriced.join(', ')}`);
  process.exit(2);
}

const fixtureSource = process.env.ASSISTANT_BENCHMARK_FIXTURE
  ? new URL(process.env.ASSISTANT_BENCHMARK_FIXTURE, `file://${process.cwd()}/`)
  : new URL('./fixtures/gemini-schedule-benchmark.json', import.meta.url);
const suite = JSON.parse(await readFile(fixtureSource, 'utf8'));
let cases = [...suite.cases];
if (audioFixturePath) {
  cases.push({
    id: 'synthetic-audio',
    group: 'audio',
    audioBase64: (await readFile(audioFixturePath)).toString('base64'),
    input: '합성 음성 fixture',
    expectedPatch: { date: '2026-08-18', appointmentTime: '15:00', destination: '서울시청', transport: '지하철' },
    expectedRoutine: { label: '자료 준비', minutes: 10 },
  });
}
if (audioManifestPath) {
  const manifest = JSON.parse(await readFile(audioManifestPath, 'utf8'));
  for (const fixture of manifest.cases ?? []) {
    cases.push({
      ...fixture,
      group: fixture.group ?? 'audio-diverse',
      input: fixture.input ?? '합성 음성 fixture',
      audioBase64: (await readFile(fixture.path)).toString('base64'),
      audioMimeType: fixture.mimeType ?? 'audio/wav',
    });
  }
}
if (requestedCaseIds.length) {
  const availableIds = new Set(cases.map((fixture) => fixture.id));
  const unknownIds = requestedCaseIds.filter((id) => !availableIds.has(id));
  if (unknownIds.length) {
    console.error(`존재하지 않는 fixture ID입니다: ${unknownIds.join(', ')}`);
    process.exit(2);
  }
  const selectedIds = new Set(requestedCaseIds);
  cases = cases.filter((fixture) => selectedIds.has(fixture.id));
}
const suiteFingerprint = createHash('sha256')
  .update(JSON.stringify({ clientContext: suite.clientContext, baseDraft: suite.baseDraft, cases }))
  .digest('hex');

// An empty model list means "whatever the endpoint is already configured with" — the production
// regression mode. The model is then read back from the response, never assumed.
const plannedModels = models.length ? models : [null];
const attempts = Array.from({ length: repeats }, (_, index) => attemptStart + index);
const runs = [];
let completedRuns = 0;
// Models are interleaved inside each case rather than swept one model at a time, so a slow minute on
// the Gemini side lands on all candidates instead of whichever one happened to run during it.
for (const attempt of attempts) {
  for (let offset = 0; offset < cases.length; offset += fixtureConcurrency) {
    const chunk = cases.slice(offset, offset + fixtureConcurrency);
    const chunkRuns = await Promise.all(chunk.map((fixture) => runFixture(fixture, attempt)));
    for (const fixtureRuns of chunkRuns) {
      runs.push(...fixtureRuns);
      completedRuns += fixtureRuns.length;
      if (progressEvery > 0 && completedRuns % progressEvery === 0) {
        console.error(`benchmark progress ${completedRuns}/${attempts.length * cases.length * plannedModels.length}`);
      }
    }
  }
}

const byModel = new Map();
for (const run of runs) {
  const key = run.model ?? 'unknown';
  if (!byModel.has(key)) byModel.set(key, []);
  byModel.get(key).push(run);
}

const summary = {
  generatedAt: new Date().toISOString(),
  endpoint,
  authenticated: Boolean(token),
  requestedModels: models.length ? models : null,
  repeats,
  attempts,
  fixtureCount: cases.length,
  suiteFingerprint,
  includesSyntheticAudio: Boolean(audioFixturePath || audioManifestPath),
  parallelModels,
  fixtureConcurrency,
  storesSyntheticResponses: storeSyntheticResponses,
  clientContext: suite.clientContext,
  pricingSource: PRICING_SOURCE,
  models: [...byModel.entries()].map(([model, modelRuns]) => summarizeModel(model, modelRuns)),
  runs,
};

console.log(JSON.stringify(summary, null, 2));
if (runs.some((run) => !run.ok)) process.exitCode = 1;

async function runOnce(model, fixture, attempt) {
  const request = {
    conversationId: `bench_${attempt}_${fixture.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 100),
    draft: { ...suite.baseDraft, ...fixture.draft },
    history: fixture.history ?? [],
    input: fixture.audioBase64
      ? { kind: 'audio', base64: fixture.audioBase64, mimeType: fixture.audioMimeType ?? 'audio/m4a' }
      : { kind: 'text', text: fixture.input },
    clientContext: suite.clientContext,
    flowContext: { mode: 'one-shot' },
  };
  // Only sent when a model is pinned, so the production endpoint keeps behaving exactly as it does
  // for the app when this harness runs in regression mode.
  if (model) request.model = model;

  const base = {
    fixtureId: fixture.id,
    group: fixture.group ?? null,
    attempt,
    inputKind: fixture.audioBase64 ? 'audio' : 'text',
  };

  const started = performance.now();
  let response;
  let body;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}`, apikey: token } : {}),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60_000),
    });
    body = await response.json();
  } catch (error) {
    return withFailureKind({
      ...base,
      model,
      reportedModel: null,
      modelMismatch: false,
      ok: false,
      structured: false,
      httpStatus: response?.status ?? null,
      latencyMs: Math.round(performance.now() - started),
      upstreamLatencyMs: null,
      matchedFields: 0,
      totalFields: expectedChecks(fixture).length,
      failures: expectedChecks(fixture),
      error: error.name === 'TimeoutError' ? 'CLIENT_TIMEOUT' : 'CLIENT_TRANSPORT_ERROR',
      usage: null,
      estimatedCostUsd: null,
    });
  }

  const reportedModel = body?._meta?.model ?? null;
  // A pinned model that comes back labelled as something else means the request never reached the
  // isolated benchmark function. Attributing that row to either model would be a fabricated
  // measurement, so it is recorded against the requested model as a harness failure.
  const modelMismatch = Boolean(model) && reportedModel !== null && reportedModel !== model;
  const structured = response.ok && !modelMismatch && isStructuredResponse(body);
  const checks = evaluate(fixture, structured ? body : null);
  const attributedModel = model ?? reportedModel;
  return withFailureKind({
    ...base,
    model: attributedModel,
    reportedModel,
    modelMismatch,
    ok: structured && checks.every((check) => check.ok),
    structured,
    httpStatus: response.status,
    latencyMs: Math.round(performance.now() - started),
    upstreamLatencyMs: body?._meta?.upstreamLatencyMs ?? null,
    matchedFields: checks.filter((check) => check.ok).length,
    totalFields: checks.length,
    failures: checks.filter((check) => !check.ok).map((check) => check.label),
    error: structured ? null : (modelMismatch ? 'MODEL_MISMATCH' : (body?.error?.code ?? `HTTP ${response.status}`)),
    usage: body?._meta?.usage ?? null,
    estimatedCostUsd: structured ? estimateCost(attributedModel, body?._meta?.usage) : null,
    ...(storeSyntheticResponses ? {
      observedSyntheticResponse: {
        transcript: body?.transcript ?? null,
        patch: body?.patch ?? null,
        question: body?.question ?? null,
        clarification: body?.clarification ?? null,
        readyToApply: body?.readyToApply ?? null,
      },
    } : {}),
  });
}

function withFailureKind(run) {
  return { ...run, failureKind: classifyFailure(run) };
}

async function runModelsSequentially(fixture, attempt) {
  const fixtureRuns = [];
  for (const model of plannedModels) fixtureRuns.push(await runOnce(model, fixture, attempt));
  return fixtureRuns;
}

async function runFixture(fixture, attempt) {
  return parallelModels
    ? Promise.all(plannedModels.map((model) => runOnce(model, fixture, attempt)))
    : runModelsSequentially(fixture, attempt);
}
