const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { expectedChecks } = require('./benchmark-assistant-judge');

const fixture = (name) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('mixed Gemini benchmark fixtures', () => {
  test('keeps the core and diverse suites separate and uniquely identified', () => {
    const core = fixture('gemini-schedule-benchmark.json');
    const diverse = fixture('gemini-schedule-diverse.json');
    const ids = [...core.cases, ...diverse.cases].map((entry) => entry.id);

    expect(core.cases).toHaveLength(21);
    expect(diverse.cases).toHaveLength(30);
    expect(new Set(ids).size).toBe(ids.length);
    expect(diverse.cases.every((entry) => expectedChecks(entry).length > 0)).toBe(true);
  });

  test('defines ten reproducible synthetic-audio cases without embedding recordings', () => {
    const audio = fixture('gemini-schedule-audio-manifest.json');

    expect(audio.cases).toHaveLength(10);
    expect(new Set(audio.cases.map((entry) => entry.id)).size).toBe(10);
    for (const entry of audio.cases) {
      expect(entry.path).toMatch(/^tmp\/gemini-audio-mixed\/.+\.wav$/);
      expect(entry.utterance).toEqual(expect.any(String));
      expect(entry.utterance.length).toBeGreaterThan(5);
      expect(entry.rate).toBeGreaterThanOrEqual(100);
      expect(expectedChecks(entry).length).toBeGreaterThan(0);
      expect(entry).not.toHaveProperty('audioBase64');
    }
  });
});
