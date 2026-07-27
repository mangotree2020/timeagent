import { AccessibilityInfo } from 'react-native';

import OnTimeAccessibilityModule from '../../modules/on-time-accessibility/src/OnTimeAccessibilityModule';
import { ScreenReaderState } from '@/lib/accessibility-voice';

type Subscription = { remove(): void };

export async function getScreenReaderState(): Promise<ScreenReaderState> {
  try {
    if (OnTimeAccessibilityModule) {
      return OnTimeAccessibilityModule.isScreenReaderEnabled() ? 'enabled' : 'disabled';
    }
    return await AccessibilityInfo.isScreenReaderEnabled() ? 'enabled' : 'disabled';
  } catch {
    return 'checking';
  }
}

export async function canUseAppTts(): Promise<boolean> {
  return await getScreenReaderState() === 'disabled';
}

export function subscribeScreenReaderState(
  listener: (state: ScreenReaderState) => void,
): Subscription {
  const subscriptions: Subscription[] = [];

  if (OnTimeAccessibilityModule) {
    subscriptions.push(OnTimeAccessibilityModule.addListener('onScreenReaderChanged', ({ enabled }) => {
      listener(enabled ? 'enabled' : 'disabled');
    }));
  } else {
    subscriptions.push(AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      listener(enabled ? 'enabled' : 'disabled');
    }));
  }

  return {
    remove() {
      subscriptions.forEach((subscription) => subscription.remove());
    },
  };
}
