const { execFile } = require('node:child_process');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { promisify } = require('node:util');

const runner = join(__dirname, 'benchmark-gemini-assistant.mjs');

/** Starts a stand-in for the benchmark Edge Function. `reply(requestBody)` decides each response. */
async function withEndpoint(reply, body) {
  const received = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      const parsed = JSON.parse(raw);
      received.push({ parsed, authorization: request.headers.authorization });
      const { status = 200, payload } = reply(parsed, received.length);
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return { received, summary: await body(`http://127.0.0.1:${server.address().port}/v1/schedule/turn`) };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runBenchmark(url, env) {
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [runner], {
      env: { ...process.env, ASSISTANT_BENCHMARK_URL: url, ASSISTANT_BENCHMARK_TOKEN: 'test-token', ...env },
      maxBuffer: 32 * 1_024 * 1_024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    // A run with any failing case exits 1 on purpose; the summary is still on stdout.
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

const answer = (model, patch = {}) => ({
  entryType: 'schedule',
  transcript: '내일 오후 3시',
  assistantMessage: '알겠어요.',
  question: null,
  readyToApply: true,
  clarification: null,
  task: null,
  patch: { title: null, date: null, appointmentTime: null, destination: null, destinationAddress: null, transport: null, priority: null, routines: null, durationMinutes: null, recurrence: null, preparationMinutes: null, ...patch },
  _meta: { provider: 'gemini', model, upstreamLatencyMs: 12, usage: { inputTokensByModality: [{ modality: 'text', tokens: 1_500 }], totalInputTokens: 1_500, totalOutputTokens: 200, totalThoughtTokens: 0, totalTokens: 1_700 } },
});

describe('the benchmark runner as a whole', () => {
  jest.setTimeout(60_000);

  test('sends every fixture to every model and pins the model in the request', async () => {
    const { received, summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model) }),
      (url) => runBenchmark(url, { ASSISTANT_BENCHMARK_MODELS: 'gemini-3.1-flash-lite,gemini-3.6-flash' }),
    );

    expect(received).toHaveLength(summary.fixtureCount * 2);
    expect(received.every((entry) => entry.authorization === 'Bearer test-token')).toBe(true);
    expect(summary.models.map((entry) => entry.model).sort()).toEqual(['gemini-3.1-flash-lite', 'gemini-3.6-flash']);
    for (const entry of summary.models) expect(entry.runs).toBe(summary.fixtureCount);
  });

  test('interleaves the models within each case so one slow window cannot fall on a single model', async () => {
    const { received } = await withEndpoint(
      (request) => ({ payload: answer(request.model) }),
      (url) => runBenchmark(url, { ASSISTANT_BENCHMARK_MODELS: 'gemini-3.1-flash-lite,gemini-3.6-flash' }),
    );

    const models = received.map((entry) => entry.parsed.model);
    expect(models.slice(0, 4)).toEqual(['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-3.6-flash']);
  });

  test('can call one model pair concurrently under the same time window', async () => {
    const { summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model) }),
      (url) => runBenchmark(url, {
        ASSISTANT_BENCHMARK_MODELS: 'gemini-3.1-flash-lite,gemini-3.5-flash-lite',
        ASSISTANT_BENCHMARK_CASES: 'complete-all-fields',
        ASSISTANT_BENCHMARK_PARALLEL_MODELS: '1',
      }),
    );

    expect(summary.parallelModels).toBe(true);
    expect(summary.runs).toHaveLength(2);
    expect(summary.runs.map((run) => run.model).sort()).toEqual(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']);
  });

  test('records a bounded fixture concurrency used for load measurements', async () => {
    const { summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model) }),
      (url) => runBenchmark(url, {
        ASSISTANT_BENCHMARK_MODELS: 'gemini-3.1-flash-lite,gemini-3.5-flash-lite',
        ASSISTANT_BENCHMARK_CASES: 'complete-all-fields,complete-explicit-date',
        ASSISTANT_BENCHMARK_PARALLEL_MODELS: '1',
        ASSISTANT_BENCHMARK_FIXTURE_CONCURRENCY: '2',
      }),
    );

    expect(summary.fixtureConcurrency).toBe(2);
    expect(summary.runs).toHaveLength(4);
  });

  test('numbers attempts from ASSISTANT_BENCHMARK_ATTEMPT_START so split commands stay distinguishable', async () => {
    const { summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model) }),
      (url) => runBenchmark(url, { ASSISTANT_BENCHMARK_MODELS: 'gemini-3.6-flash', ASSISTANT_BENCHMARK_ATTEMPT_START: '3' }),
    );

    expect(summary.attempts).toEqual([3]);
    expect(new Set(summary.runs.map((run) => run.attempt))).toEqual(new Set([3]));
  });

  test('can select one fixture for a focused audio or regression smoke test', async () => {
    const { received, summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model) }),
      (url) => runBenchmark(url, {
        ASSISTANT_BENCHMARK_MODELS: 'gemini-3.1-flash-lite,gemini-3.6-flash',
        ASSISTANT_BENCHMARK_CASES: 'complete-all-fields',
      }),
    );

    expect(summary.fixtureCount).toBe(1);
    expect(summary.suiteFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(received).toHaveLength(2);
    expect(summary.runs.every((run) => run.fixtureId === 'complete-all-fields')).toBe(true);
  });

  test('can load the separate diverse fixture suite without changing the core suite', async () => {
    const fixturePath = join(__dirname, 'fixtures', 'gemini-schedule-diverse.json');
    const { summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model, { title: '영화 보기', date: '2026-08-19', appointmentTime: '20:30', destination: '센텀시티 CGV', transport: '지하철' }) }),
      (url) => runBenchmark(url, {
        ASSISTANT_BENCHMARK_MODELS: 'gemini-3.1-flash-lite',
        ASSISTANT_BENCHMARK_FIXTURE: fixturePath,
        ASSISTANT_BENCHMARK_CASES: 'diverse-complete-cinema-halfhour',
      }),
    );

    expect(summary.fixtureCount).toBe(1);
    expect(summary.runs[0]).toMatchObject({ fixtureId: 'diverse-complete-cinema-halfhour', ok: true });
  });

  test('refuses to score a response that came back labelled as a different model', async () => {
    const { summary } = await withEndpoint(
      // The production function ignores `model` and answers as whatever it is configured with.
      () => ({ payload: answer('gemini-3.1-flash-lite', { date: '2026-08-18' }) }),
      (url) => runBenchmark(url, { ASSISTANT_BENCHMARK_MODELS: 'gemini-3.6-flash' }),
    );

    expect(summary.models).toHaveLength(1);
    expect(summary.models[0].model).toBe('gemini-3.6-flash');
    expect(summary.models[0].structuredSuccessRate).toBe(0);
    expect(summary.models[0].failureKinds).toEqual({ model: 0, harness: summary.fixtureCount, infrastructure: 0 });
    expect(summary.runs.every((run) => run.error === 'MODEL_MISMATCH' && run.estimatedCostUsd === null)).toBe(true);
  });

  test('records an upstream refusal as the model failing and a bad request as the harness failing', async () => {
    const { summary } = await withEndpoint(
      (request, index) => (index % 2
        ? { status: 422, payload: { error: { code: 'UPSTREAM_REJECTED', message: '처리하지 못했습니다.', retryable: false } } }
        : { status: 400, payload: { error: { code: 'INVALID_INPUT', message: '요청을 확인해 주세요.', retryable: false } } }),
      (url) => runBenchmark(url, { ASSISTANT_BENCHMARK_MODELS: 'gemini-3.5-flash-lite' }),
    );

    const kinds = summary.models[0].failureKinds;
    expect(kinds.model + kinds.harness).toBe(summary.fixtureCount);
    expect(kinds.model).toBeGreaterThan(0);
    expect(kinds.harness).toBeGreaterThan(0);
    expect(summary.models[0].latencyMs).toEqual({ p50: null, p95: null });
    expect(summary.models[0].averageRequestCostUsd).toBeNull();
  });

  test('keeps no response text, so no transcript or answer can leak into a saved result', async () => {
    const { summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model, { destination: '비밀 장소' }) }),
      (url) => runBenchmark(url, { ASSISTANT_BENCHMARK_MODELS: 'gemini-3.6-flash' }),
    );

    expect(JSON.stringify(summary.runs)).not.toContain('비밀 장소');
    expect(JSON.stringify(summary.runs)).not.toContain('알겠어요');
    expect(Object.keys(summary.runs[0]).sort()).toEqual([
      'attempt', 'error', 'estimatedCostUsd', 'failureKind', 'failures', 'fixtureId', 'group', 'httpStatus',
      'inputKind', 'latencyMs', 'matchedFields', 'model', 'modelMismatch', 'ok', 'reportedModel', 'structured',
      'totalFields', 'upstreamLatencyMs', 'usage',
    ]);
  });

  test('stores response details only under the explicit synthetic diagnostic opt-in', async () => {
    const { summary } = await withEndpoint(
      (request) => ({ payload: answer(request.model, { destination: '합성 장소' }) }),
      (url) => runBenchmark(url, {
        ASSISTANT_BENCHMARK_MODELS: 'gemini-3.1-flash-lite',
        ASSISTANT_BENCHMARK_CASES: 'complete-all-fields',
        ASSISTANT_BENCHMARK_STORE_SYNTHETIC_RESPONSES: '1',
      }),
    );

    expect(summary.storesSyntheticResponses).toBe(true);
    expect(summary.runs[0].observedSyntheticResponse).toMatchObject({
      transcript: '내일 오후 3시',
      patch: { destination: '합성 장소' },
    });
  });
});
