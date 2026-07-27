import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  advanceBackgroundJourneySession,
  clearBackgroundJourneySession,
  createBackgroundJourneySession,
  loadBackgroundJourneySession,
  saveBackgroundJourneySession,
  withBackgroundVoiceDelivery,
} from '@/lib/background-journey-session';
import { JourneyLocation, JourneyState } from '@/lib/journey';
import { canUseAppTts } from '@/lib/screen-reader-state';

export const BACKGROUND_JOURNEY_TASK = 'on-time-background-journey';
export const BACKGROUND_JOURNEY_NOTIFICATION_CHANNEL = 'on-time-journey';

type LocationTaskData = { locations?: Location.LocationObject[] };

export type BackgroundJourneyStatus = {
  state: 'inactive' | 'enabled' | 'permission-required' | 'unsupported' | 'error';
  updatedAt: number | null;
  voiceDelivery: 'idle' | 'spoken' | 'notification-fallback' | 'failed' | null;
};

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BACKGROUND_JOURNEY_TASK)) {
  TaskManager.defineTask<LocationTaskData>(BACKGROUND_JOURNEY_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const saved = await loadBackgroundJourneySession(AsyncStorage);
    if (!saved) return;

    const latest = data.locations.at(-1);
    if (!latest) return;
    const location = toJourneyLocation(latest);
    const advanced = advanceBackgroundJourneySession(saved, location);
    let next = advanced.session;

    if (advanced.announcement) {
      try {
        await speakInBackground(advanced.announcement.message);
        next = withBackgroundVoiceDelivery(next, 'spoken');
      } catch {
        try {
          await showVoiceFallbackNotification(advanced.announcement.message, saved.destinationName);
          next = withBackgroundVoiceDelivery(next, 'notification-fallback');
        } catch {
          next = withBackgroundVoiceDelivery(next, 'failed');
        }
      }
    }
    await saveBackgroundJourneySession(AsyncStorage, next);
    if (advanced.arrived) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_JOURNEY_TASK).catch(() => undefined);
      await clearBackgroundJourneySession(AsyncStorage);
    }
  });
}

export async function startBackgroundJourney({
  journey,
  destinationName,
}: {
  journey: JourneyState;
  destinationName: string;
}): Promise<BackgroundJourneyStatus> {
  if (Platform.OS === 'web' || !await TaskManager.isAvailableAsync()) {
    return emptyStatus('unsupported');
  }
  if (journey.route.provider !== 'tmap') return emptyStatus('error');

  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) return emptyStatus('permission-required');
    let background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted) background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted) return emptyStatus('permission-required');

    const session = createBackgroundJourneySession({ journey, destinationName });
    await saveBackgroundJourneySession(AsyncStorage, session);
    if (!await Location.hasStartedLocationUpdatesAsync(BACKGROUND_JOURNEY_TASK)) {
      await Location.startLocationUpdatesAsync(BACKGROUND_JOURNEY_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 25,
        timeInterval: 15_000,
        deferredUpdatesDistance: 25,
        deferredUpdatesInterval: 15_000,
        pausesUpdatesAutomatically: true,
        foregroundService: {
          notificationTitle: 'ON:TIME 이동 안내 사용 중',
          notificationBody: `${destinationName}까지 위치와 다음 행동을 안내합니다.`,
          notificationColor: '#0077B6',
          killServiceOnDestroy: false,
        },
      });
    }
    return { state: 'enabled', updatedAt: session.updatedAt, voiceDelivery: session.lastVoiceDelivery };
  } catch {
    await clearBackgroundJourneySession(AsyncStorage).catch(() => undefined);
    return emptyStatus('error');
  }
}

export async function stopBackgroundJourney(): Promise<BackgroundJourneyStatus> {
  if (Platform.OS === 'web') return emptyStatus('inactive');
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_JOURNEY_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_JOURNEY_TASK);
    }
    await Speech.stop().catch(() => undefined);
    await clearBackgroundJourneySession(AsyncStorage);
    return emptyStatus('inactive');
  } catch {
    return emptyStatus('error');
  }
}

export async function getBackgroundJourneyStatus(): Promise<BackgroundJourneyStatus> {
  if (Platform.OS === 'web' || !await TaskManager.isAvailableAsync()) {
    return emptyStatus('unsupported');
  }
  try {
    const [started, session, permission] = await Promise.all([
      Location.hasStartedLocationUpdatesAsync(BACKGROUND_JOURNEY_TASK),
      loadBackgroundJourneySession(AsyncStorage),
      Location.getBackgroundPermissionsAsync(),
    ]);
    if (!permission.granted && (started || session)) {
      return { state: 'permission-required', updatedAt: session?.updatedAt ?? null, voiceDelivery: session?.lastVoiceDelivery ?? null };
    }
    if (!started || !session) return emptyStatus('inactive');
    return { state: 'enabled', updatedAt: session.updatedAt, voiceDelivery: session.lastVoiceDelivery };
  } catch {
    return emptyStatus('error');
  }
}

function toJourneyLocation(location: Location.LocationObject): JourneyLocation {
  return {
    coordinate: {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    },
    accuracyMeters: location.coords.accuracy,
    headingDegrees: location.coords.heading,
    capturedAt: location.timestamp,
  };
}

function speakInBackground(message: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Background speech timed out')), 20_000);
    const finish = (result: 'resolve' | 'reject') => {
      clearTimeout(timeout);
      if (result === 'resolve') resolve();
      else reject(new Error('Background speech failed'));
    };
    void Speech.stop().then(async () => {
      if (!await canUseAppTts()) {
        finish('reject');
        return;
      }
      Speech.speak(message, {
      language: 'ko-KR',
      rate: 0.92,
      pitch: 1,
      onDone: () => finish('resolve'),
      onStopped: () => finish('resolve'),
      onError: () => finish('reject'),
      });
    }).catch(() => finish('reject'));
  });
}

async function showVoiceFallbackNotification(message: string, destinationName: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(BACKGROUND_JOURNEY_NOTIFICATION_CHANNEL, {
      name: 'ON:TIME 이동 음성 대체 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${destinationName} 이동 안내`,
      body: message,
      sound: true,
      data: { source: 'background-journey' },
    },
    trigger: null,
  });
}

function emptyStatus(state: BackgroundJourneyStatus['state']): BackgroundJourneyStatus {
  return { state, updatedAt: null, voiceDelivery: null };
}
