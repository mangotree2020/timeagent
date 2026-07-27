export type ScreenReaderState = 'checking' | 'enabled' | 'disabled';

export function shouldAutoSpeakJourney({
  voiceEnabled,
  screenReaderState,
  hasTmapRoute,
  hasManeuver,
}: {
  voiceEnabled: boolean;
  screenReaderState: ScreenReaderState;
  hasTmapRoute: boolean;
  hasManeuver: boolean;
}) {
  return voiceEnabled && screenReaderState === 'disabled' && hasTmapRoute && hasManeuver;
}
