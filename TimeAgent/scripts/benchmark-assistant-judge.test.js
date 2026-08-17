const {
  MODEL_PRICING,
  classifyFailure,
  estimateCost,
  evaluate,
  expectedChecks,
  isStructuredResponse,
  mergeSummaries,
  percentile,
  summarizeModel,
} = require('./benchmark-assistant-judge');

const structuredBody = (overrides = {}) => ({
  entryType: 'schedule',
  transcript: '내일 오후 3시 서울시청',
  assistantMessage: '내일 오후 3시 서울시청으로 잡을게요.',
  question: null,
  readyToApply: true,
  clarification: null,
  task: null,
  ...overrides,
  patch: {
    title: null,
    date: '2026-08-18',
    appointmentTime: '15:00',
    destination: '서울시청',
    destinationAddress: null,
    transport: '지하철',
    priority: null,
    routines: null,
    durationMinutes: null,
    recurrence: null,
    preparationMinutes: null,
    ...overrides.patch,
  },
  _meta: { provider: 'gemini', model: 'gemini-3.1-flash-lite', usage: { inputTokensByModality: [{ modality: 'text', tokens: 1_500 }], totalInputTokens: 1_500, totalOutputTokens: 200, totalThoughtTokens: 0, totalTokens: 1_700 } },
});

describe('benchmark cost model', () => {
  test('prices each candidate model with its own published rates', () => {
    const usage = { inputTokensByModality: [{ modality: 'text', tokens: 1_000_000 }], totalInputTokens: 1_000_000, totalOutputTokens: 1_000_000, totalThoughtTokens: 0 };

    expect(estimateCost('gemini-3.1-flash-lite', usage)).toBeCloseTo(0.25 + 1.5, 10);
    expect(estimateCost('gemini-3.5-flash-lite', usage)).toBeCloseTo(0.3 + 2.5, 10);
    expect(estimateCost('gemini-3.6-flash', usage)).toBeCloseTo(0.75 + 3.75, 10);
  });

  test('bills thinking tokens at the output rate', () => {
    const usage = { inputTokensByModality: [], totalInputTokens: 0, totalOutputTokens: 500_000, totalThoughtTokens: 500_000 };

    expect(estimateCost('gemini-3.1-flash-lite', usage)).toBeCloseTo(1.5, 10);
  });

  test('treats input the API did not label as text rather than dropping it', () => {
    const usage = { inputTokensByModality: [{ modality: 'audio', tokens: 400_000 }], totalInputTokens: 1_000_000, totalOutputTokens: 0, totalThoughtTokens: 0 };

    expect(estimateCost('gemini-3.1-flash-lite', usage)).toBeCloseTo(0.6 * 0.25 + 0.4 * 0.5, 10);
  });

  test('reports unknown instead of guessing when a modality has no published price', () => {
    expect(MODEL_PRICING['gemini-3.6-flash'].audioInput).toBeNull();
    expect(estimateCost('gemini-3.6-flash', {
      inputTokensByModality: [{ modality: 'audio', tokens: 100 }], totalInputTokens: 100, totalOutputTokens: 10, totalThoughtTokens: 0,
    })).toBeNull();
  });

  test('refuses to cost a model that is not in the price table', () => {
    expect(estimateCost('gemini-9.9-imaginary', { totalInputTokens: 10, totalOutputTokens: 1, totalThoughtTokens: 0 })).toBeNull();
  });
});

describe('benchmark case judging', () => {
  test('accepts a response that fills exactly the fields the person said', () => {
    const fixture = {
      id: 'complete',
      expectedPatch: { date: '2026-08-18', appointmentTime: '15:00', destination: '서울시청', transport: '지하철' },
      expectedClarificationField: null,
      expectedReadyToApply: true,
    };

    expect(evaluate(fixture, structuredBody()).every((check) => check.ok)).toBe(true);
  });

  test('checks that a semantic field such as title is present without requiring one exact wording', () => {
    const fixture = { id: 'title', expectedFilledPatch: ['title'] };

    expect(evaluate(fixture, structuredBody({ patch: { title: '친구 만나기' } }))[0].ok).toBe(true);
    expect(evaluate(fixture, structuredBody({ patch: { title: '' } }))[0].ok).toBe(false);
  });

  test('fails a model that invents a value the person never said', () => {
    const fixture = { id: 'vague', expectedPatch: { date: '2026-08-18' }, expectedNullPatch: ['destination', 'transport'] };

    const checks = evaluate(fixture, structuredBody());

    expect(checks.filter((check) => !check.ok).map((check) => check.label)).toEqual(['destination=null', 'transport=null']);
  });

  test('counts an empty string as an unfilled field', () => {
    const fixture = { id: 'vague', expectedNullPatch: ['destination'] };

    expect(evaluate(fixture, structuredBody({ patch: { destination: '' } }))[0].ok).toBe(true);
  });

  test('treats the draft transport default as unfilled but a real choice as filled', () => {
    const fixture = { id: 'missing-transport', expectedNullPatch: ['transport'] };

    expect(evaluate(fixture, structuredBody({ patch: { transport: 'AI 추천' } }))[0].ok).toBe(true);
    expect(evaluate(fixture, structuredBody({ patch: { transport: '지하철' } }))[0].ok).toBe(false);
    // The same string is not a free pass where the person did name a transport.
    expect(evaluate({ id: 'a', expectedPatch: { transport: '버스' } }, structuredBody({ patch: { transport: 'AI 추천' } }))[0].ok).toBe(false);
  });

  test('fails a model that asks about a field other than the missing one', () => {
    const fixture = { id: 'missing-transport', expectedClarificationField: 'transport' };
    const askedTheWrongThing = structuredBody({ clarification: { field: 'time', prompt: '몇 시인가요?', options: ['직접 입력'] } });

    expect(evaluate(fixture, askedTheWrongThing)[0]).toEqual({ label: 'clarification=transport', ok: false });
  });

  test('fails a model that asks nothing when a required field is missing', () => {
    const fixture = { id: 'missing-transport', expectedClarificationField: 'transport' };

    expect(evaluate(fixture, structuredBody())[0].ok).toBe(false);
  });

  test('fails a model that asks when every required field is already known', () => {
    const fixture = { id: 'complete', expectedClarificationField: null };
    const overAsked = structuredBody({ clarification: { field: 'destination', prompt: '어느 지점인가요?', options: ['직접 입력'] } });

    expect(evaluate(fixture, overAsked)[0].ok).toBe(false);
  });

  test('treats destination spacing as the same place but not a different place', () => {
    expect(evaluate({ id: 'a', expectedPatch: { destination: '서울 시청' } }, structuredBody())[0].ok).toBe(true);
    expect(evaluate({ id: 'a', expectedPatch: { destination: '서울역' } }, structuredBody())[0].ok).toBe(false);
  });

  test('accepts an explicitly listed equivalent spelling for synthetic speech', () => {
    const fixture = {
      id: 'audio-place',
      expectedPatch: { destination: '센텀시티 CGV' },
      acceptedPatchValues: { destination: ['센텀시티 씨지브이'] },
    };

    expect(evaluate(fixture, structuredBody({ patch: { destination: '센텀시티 씨지브이' } }))[0].ok).toBe(true);
    expect(evaluate(fixture, structuredBody({ patch: { destination: '다른 영화관' } }))[0].ok).toBe(false);
  });

  test('merges routines instead of accepting only the added one', () => {
    const fixture = { id: 'routine', expectedRoutine: { label: '선물 포장', minutes: 10 }, forbiddenRoutine: '화장' };
    const merged = structuredBody({ patch: { routines: [{ label: '샤워', minutes: 18 }, { label: '선물 포장', minutes: 10 }] } });

    expect(evaluate(fixture, merged).every((check) => check.ok)).toBe(true);
    expect(evaluate(fixture, structuredBody({ patch: { routines: [{ label: '화장', minutes: 12 }] } })).every((check) => check.ok)).toBe(false);
  });

  test('scores a failed request as every expected check missed, never as no checks', () => {
    const fixture = { id: 'missing-time', expectedPatch: { date: '2026-08-18' }, expectedNullPatch: ['appointmentTime'], expectedClarificationField: 'time' };

    expect(expectedChecks(fixture)).toHaveLength(3);
    expect(evaluate(fixture, null)).toEqual([
      { label: 'date="2026-08-18"', ok: false },
      { label: 'appointmentTime=null', ok: false },
      { label: 'clarification=time', ok: false },
    ]);
  });

  test('rejects a body that is missing the token usage a cost measurement needs', () => {
    expect(isStructuredResponse(structuredBody())).toBe(true);
    expect(isStructuredResponse({ ...structuredBody(), _meta: { provider: 'gemini' } })).toBe(false);
    expect(isStructuredResponse({ error: { code: 'UPSTREAM_UNAVAILABLE' } })).toBe(false);
  });
});

describe('separating a model failure from a harness failure', () => {
  const failed = (overrides) => ({ structured: false, modelMismatch: false, httpStatus: 200, ...overrides });

  test('blames the model only for answers that break the production contract', () => {
    expect(classifyFailure(failed({ httpStatus: 502, error: 'INVALID_RESPONSE' }))).toBe('model');
    expect(classifyFailure(failed({ httpStatus: 422, error: 'UPSTREAM_REJECTED' }))).toBe('model');
  });

  test('blames the harness for our own request, our own auth and an uncallable model', () => {
    expect(classifyFailure(failed({ httpStatus: 400, error: 'INVALID_INPUT' }))).toBe('harness');
    expect(classifyFailure(failed({ httpStatus: 401, error: 'HTTP 401' }))).toBe('harness');
    expect(classifyFailure(failed({ httpStatus: 503, error: 'SERVICE_NOT_CONFIGURED' }))).toBe('harness');
    // A 200 body the contract cannot read is an envelope problem, not a wrong answer.
    expect(classifyFailure(failed({ httpStatus: 200, error: 'HTTP 200' }))).toBe('harness');
  });

  test('blames infrastructure for timeouts, rate limits and 5xx', () => {
    expect(classifyFailure(failed({ httpStatus: null, error: 'CLIENT_TIMEOUT' }))).toBe('infrastructure');
    expect(classifyFailure(failed({ httpStatus: 503, error: 'UPSTREAM_UNAVAILABLE' }))).toBe('infrastructure');
    expect(classifyFailure(failed({ httpStatus: 503, error: 'SERVICE_UNAVAILABLE' }))).toBe('infrastructure');
  });

  test('never blames the model for a row that came back labelled as a different model', () => {
    expect(classifyFailure(failed({ modelMismatch: true, error: 'MODEL_MISMATCH' }))).toBe('harness');
  });

  test('leaves a valid response unclassified however wrong its fields were', () => {
    expect(classifyFailure({ structured: true, ok: false, httpStatus: 200, error: null })).toBeNull();
  });
});

describe('benchmark aggregation', () => {
  test('uses nearest-rank percentiles and keeps failed runs out of the latency sample', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([100], 0.95)).toBe(100);
    expect(percentile([50, 10, 30, 20, 40], 0.5)).toBe(30);
    expect(percentile([50, 10, 30, 20, 40], 0.95)).toBe(50);
  });

  test('reports the pass rate over every run, not only the ones that answered', () => {
    const summary = summarizeModel('gemini-3.1-flash-lite', [
      { fixtureId: 'a', structured: true, ok: true, latencyMs: 1_000, matchedFields: 4, totalFields: 4, estimatedCostUsd: 0.0005 },
      { fixtureId: 'a', structured: true, ok: false, latencyMs: 2_000, matchedFields: 3, totalFields: 4, estimatedCostUsd: 0.0007 },
      { fixtureId: 'b', structured: false, ok: false, latencyMs: 90, matchedFields: 0, totalFields: 2, estimatedCostUsd: null },
    ]);

    expect(summary.runs).toBe(3);
    expect(summary.fixtures).toBe(2);
    expect(summary.structuredSuccessRate).toBe(0.6667);
    expect(summary.casePassRate).toBe(0.3333);
    expect(summary.fieldAccuracy).toBe(0.7);
    expect(summary.latencyMs).toEqual({ p50: 1_000, p95: 2_000 });
    expect(summary.costedRuns).toBe(2);
    expect(summary.averageRequestCostUsd).toBeCloseTo(0.0006, 10);
    expect(summary.estimatedCostPer1000Usd).toBeCloseTo(0.6, 10);
    expect(summary.failingFixtures).toEqual(['a', 'b']);
  });

  test('reports how many failures were the model rather than the harness', () => {
    const summary = summarizeModel('gemini-3.6-flash', [
      { fixtureId: 'a', structured: true, ok: true, latencyMs: 900, matchedFields: 2, totalFields: 2, estimatedCostUsd: 0.001 },
      { fixtureId: 'b', structured: false, ok: false, latencyMs: 40, matchedFields: 0, totalFields: 2, estimatedCostUsd: null, failureKind: 'model' },
      { fixtureId: 'c', structured: false, ok: false, latencyMs: 30, matchedFields: 0, totalFields: 2, estimatedCostUsd: null, failureKind: 'harness' },
    ]);

    expect(summary.failureKinds).toEqual({ model: 1, harness: 1, infrastructure: 0 });
  });
});

describe('merging results measured in separate commands', () => {
  const part = (attempt, overrides = {}) => ({
    generatedAt: `2026-08-17T0${attempt}:00:00.000Z`,
    endpoint: 'https://example.test/functions/v1/assistant-benchmark/v1/schedule/turn',
    repeats: 1,
    attempts: [attempt],
    fixtureCount: 2,
    suiteFingerprint: 'fixture-suite-a',
    requestedModels: ['gemini-3.6-flash'],
    includesSyntheticAudio: false,
    parallelModels: true,
    fixtureConcurrency: 5,
    clientContext: { localDate: '2026-08-17' },
    pricingSource: { url: 'https://ai.google.dev/gemini-api/docs/pricing', verifiedOn: '2026-08-17' },
    models: [],
    runs: [
      { model: 'gemini-3.6-flash', fixtureId: 'a', attempt, structured: true, ok: attempt === 1, latencyMs: attempt * 1_000, matchedFields: attempt, totalFields: 2, estimatedCostUsd: 0.002 },
    ],
    ...overrides,
  });

  test('re-summarizes every attempt as one benchmark instead of averaging averages', () => {
    const merged = mergeSummaries([part(1), part(2)]);

    expect(merged.repeats).toBe(2);
    expect(merged.attempts).toEqual([1, 2]);
    expect(merged.generatedAt).toBe('2026-08-17T02:00:00.000Z');
    expect(merged.runs).toHaveLength(2);
    expect(merged.models).toHaveLength(1);
    expect(merged.models[0].runs).toBe(2);
    expect(merged.models[0].casePassRate).toBe(0.5);
    expect(merged.models[0].fieldAccuracy).toBe(0.75);
    expect(merged.models[0].latencyMs).toEqual({ p50: 1_000, p95: 2_000 });
  });

  test('refuses to merge parts that did not measure the same thing', () => {
    expect(() => mergeSummaries([part(1), part(2, { endpoint: 'https://other.test/turn' })])).toThrow();
    expect(() => mergeSummaries([part(1), part(2, { fixtureCount: 3 })])).toThrow();
    expect(() => mergeSummaries([part(1), part(2, { suiteFingerprint: 'fixture-suite-b' })])).toThrow();
    expect(() => mergeSummaries([part(1), part(2, { requestedModels: ['gemini-3.1-flash-lite'] })])).toThrow();
    expect(() => mergeSummaries([part(1), part(2, { parallelModels: false })])).toThrow();
    expect(() => mergeSummaries([part(1), part(2, { fixtureConcurrency: 1 })])).toThrow();
    expect(() => mergeSummaries([part(1), part(2, { clientContext: { localDate: '2026-08-18' } })])).toThrow();
    expect(() => mergeSummaries([])).toThrow();
  });

  test('refuses to count the same attempt twice', () => {
    expect(() => mergeSummaries([part(1), part(1)])).toThrow('같은 attempt');
  });
});
