import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { loadAppSettings } from './app-settings';
import { ConfirmedSchedulePlan } from './confirmed-plans';
import { ensureProgressNotificationChannels, PROGRESS_ALARM_CHANNEL_ID, ProgressNotificationStatus } from './notification-service';

export async function scheduleConfirmedPlanStart(
  plan: ConfirmedSchedulePlan,
  now = Date.now(),
): Promise<{ identifier?: string; status: Exclude<ProgressNotificationStatus, 'idle'> }> {
  if (Platform.OS === 'web' || plan.prepStartAt <= now) return { status: 'disabled' };
  try {
    const [settings, permission] = await Promise.all([
      loadAppSettings(AsyncStorage),
      Notifications.getPermissionsAsync(),
    ]);
    if (!settings.notifications || !permission.granted) return { status: 'disabled' };
    await ensureProgressNotificationChannels();
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '준비 계획이 자동으로 시작됐어요',
        body: `${plan.schedule.title} — 지금 ${plan.plan.timeline[0]?.title ?? '준비'}부터 시작하면 돼요.`,
        sound: true,
        data: { source: 'confirmed-plan', planId: plan.id, kind: 'prep-start' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(plan.prepStartAt),
        channelId: PROGRESS_ALARM_CHANNEL_ID,
      },
    });
    return { identifier, status: 'scheduled' };
  } catch {
    return { status: 'error' };
  }
}

export async function cancelConfirmedPlanStart(plan: ConfirmedSchedulePlan) {
  if (Platform.OS === 'web' || !plan.notificationIdentifier) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(plan.notificationIdentifier);
  } catch {
    // The notification may already have fired or been removed by the OS.
  }
}
