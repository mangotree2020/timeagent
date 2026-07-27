import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { loadAppSettings } from './app-settings';
import { buildProgressNotificationRequests } from './local-notifications';
import {
  ProgressSession,
  ScheduledProgressNotification,
  withScheduledProgressNotifications,
} from './progress-session';

export const PROGRESS_NOTIFICATION_CHANNEL_ID = 'on-time-schedule';

export type ProgressNotificationStatus = 'idle' | 'scheduled' | 'disabled' | 'error';

export type ProgressNotificationSyncResult = {
  session: ProgressSession;
  status: Exclude<ProgressNotificationStatus, 'idle'>;
};

async function cancelIdentifiers(notifications: ScheduledProgressNotification[]) {
  const results = await Promise.allSettled(
    notifications.map(({ identifier }) => Notifications.cancelScheduledNotificationAsync(identifier)),
  );
  return results.every((result) => result.status === 'fulfilled');
}

export async function replaceProgressNotifications(
  session: ProgressSession,
  now = Date.now(),
): Promise<ProgressNotificationSyncResult> {
  if (Platform.OS === 'web') {
    return { session: withScheduledProgressNotifications(session, []), status: 'disabled' };
  }

  const cleared = withScheduledProgressNotifications(session, []);

  try {
    if (!await cancelIdentifiers(session.scheduledNotifications)) {
      throw new Error('Could not cancel the previous progress notifications');
    }
    if (session.state === 'completed') return { session: cleared, status: 'scheduled' };

    const [settings, permission] = await Promise.all([
      loadAppSettings(AsyncStorage),
      Notifications.getPermissionsAsync(),
    ]);
    if (!settings.notifications || !permission.granted) {
      return { session: cleared, status: 'disabled' };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(PROGRESS_NOTIFICATION_CHANNEL_ID, {
        name: 'ON:TIME 일정 알림',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const scheduled: ScheduledProgressNotification[] = [];
    for (const request of buildProgressNotificationRequests(session, now)) {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: request.title,
          body: request.body,
          sound: true,
          data: {
            source: 'progress-session',
            key: request.key,
            kind: request.kind,
            stepId: request.stepId,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(request.fireAt),
          channelId: PROGRESS_NOTIFICATION_CHANNEL_ID,
        },
      });
      scheduled.push({
        identifier,
        key: request.key,
        kind: request.kind,
        stepId: request.stepId,
        fireAt: request.fireAt,
      });
    }

    return {
      session: withScheduledProgressNotifications(session, scheduled),
      status: 'scheduled',
    };
  } catch {
    const pending = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    await Promise.allSettled(pending
      .filter((notification) => notification.content.data?.source === 'progress-session')
      .map((notification) => Notifications.cancelScheduledNotificationAsync(notification.identifier)));
    return { session: cleared, status: 'error' };
  }
}

export async function cancelProgressNotifications(session: ProgressSession | null) {
  if (!session || Platform.OS === 'web') return;
  await cancelIdentifiers(session.scheduledNotifications);
}
