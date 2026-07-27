import * as Speech from 'expo-speech';

import { buildJourneyVoiceMessage, JourneyState, RouteManeuver, VoiceGuidePort } from '@/lib/journey';
import { canUseAppTts } from '@/lib/screen-reader-state';

export class ExpoVoiceGuide implements VoiceGuidePort {
  async speak(maneuver: RouteManeuver, journey?: JourneyState) {
    await Speech.stop();
    if (!await canUseAppTts()) return;
    Speech.speak(
      journey ? buildJourneyVoiceMessage(maneuver, journey) : maneuver.instruction,
      { language: 'ko-KR', rate: 0.92, pitch: 1 },
    );
  }

  async stop() {
    await Speech.stop();
  }
}
