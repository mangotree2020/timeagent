import { shouldAutoSpeakJourney } from '../accessibility-voice';

describe('foreground journey accessibility voice policy', () => {
  const ready = { voiceEnabled: true, screenReaderState: 'disabled' as const, hasTmapRoute: true, hasManeuver: true };

  it('speaks automatically for a normal TMAP maneuver', () => {
    expect(shouldAutoSpeakJourney(ready)).toBe(true);
  });

  it('does not duplicate TalkBack or another screen reader', () => {
    expect(shouldAutoSpeakJourney({ ...ready, screenReaderState: 'enabled' })).toBe(false);
  });

  it('fails closed while the native screen reader state is still being checked', () => {
    expect(shouldAutoSpeakJourney({ ...ready, screenReaderState: 'checking' })).toBe(false);
  });

  it('does not speak when voice, route, or maneuver is unavailable', () => {
    expect(shouldAutoSpeakJourney({ ...ready, voiceEnabled: false })).toBe(false);
    expect(shouldAutoSpeakJourney({ ...ready, hasTmapRoute: false })).toBe(false);
    expect(shouldAutoSpeakJourney({ ...ready, hasManeuver: false })).toBe(false);
  });
});
