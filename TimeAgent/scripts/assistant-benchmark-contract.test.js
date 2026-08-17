const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const functionsDir = join(__dirname, '..', 'supabase', 'functions');
const production = readFileSync(join(functionsDir, 'assistant', 'index.ts'), 'utf8');
const benchmark = readFileSync(join(functionsDir, 'assistant-benchmark', 'index.ts'), 'utf8');
const suite = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'gemini-schedule-benchmark.json'), 'utf8'));

/** Reads one top-level function body out of a Deno function source, brace-to-brace. */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const end = source.indexOf('\n}\n', start);
  return end === -1 ? null : source.slice(start, end + 2);
}

describe('isolated benchmark Edge Function stays a twin of production', () => {
  // A benchmark that judges responses more or less strictly than production would compare models on
  // a contract the app does not actually use, so these have to stay identical.
  const shared = [
    'parseAssistantResult',
    'isAssistantResult',
    'isTaskProposal',
    'isClarification',
    'isFlowContext',
    'isClientContext',
    'validText',
    'isRecord',
    'upstreamFailure',
    'errorResponse',
    'geminiRequest',
    'invalidResponse',
  ];

  test.each(shared)('%s is byte-identical to the production copy', (name) => {
    const productionSource = extractFunction(production, name);

    expect(productionSource).toBeTruthy();
    expect(extractFunction(benchmark, name)).toBe(productionSource);
  });

  test('the benchmark twin only accepts models it has published prices for', () => {
    const { MODEL_PRICING } = require('./benchmark-assistant-judge');
    const allowlist = benchmark.match(/const BENCHMARK_MODELS = \[(.*?)\];/s)[1]
      .split(',')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);

    expect(allowlist).toEqual(['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']);
    for (const model of allowlist) expect(MODEL_PRICING[model]).toBeTruthy();
  });

  test('it never falls back to the production model configuration', () => {
    expect(production).toContain('GEMINI_SCHEDULE_MODEL');
    expect(benchmark).not.toContain('GEMINI_SCHEDULE_MODEL');
    expect(benchmark).not.toContain('DEFAULT_GEMINI_MODEL');
  });
});

describe('benchmark fixture coverage', () => {
  const byId = new Map(suite.cases.map((fixture) => [fixture.id, fixture]));

  test('starts every case from the draft the voice flow actually sends', () => {
    expect(suite.baseDraft).toMatchObject({ title: '', date: '', appointmentTime: '', destination: '', transport: 'AI 추천' });
  });

  test('keeps the local date ahead of the UTC date so a UTC-based model is caught', () => {
    expect(suite.clientContext.localDate).toBe('2026-08-17');
    expect(suite.clientContext.nowIso.slice(0, 10)).toBe('2026-08-16');
  });

  test.each([
    ['complete', 2],
    ['missing-field', 4],
    ['transport-synonym', 3],
    ['correction', 1],
    ['relative-date', 4],
    ['multi-turn', 2],
    ['hallucination', 2],
  ])('covers the %s scenario', (group, minimum) => {
    expect(suite.cases.filter((fixture) => fixture.group === group).length).toBeGreaterThanOrEqual(minimum);
  });

  test('asks about exactly one missing required field per missing-field case', () => {
    for (const field of ['date', 'time', 'destination', 'transport']) {
      const fixture = byId.get(`missing-${field === 'time' ? 'time' : field}`);

      expect(fixture).toBeTruthy();
      expect(fixture.expectedClarificationField).toBe(field);
      expect(fixture.expectedReadyToApply).toBe(false);
    }
  });

  test('every case asserts something, so no case can pass by returning nothing', () => {
    const { expectedChecks } = require('./benchmark-assistant-judge');

    for (const fixture of suite.cases) expect(expectedChecks(fixture).length).toBeGreaterThan(0);
  });
});
