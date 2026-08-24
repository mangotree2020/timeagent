import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { loadAppSettings } from './app-settings';
import { ConfirmedSchedulePlan, describePrepStartReminder, PREP_START_REMINDER_MINUTES } from './confirmed-plans';
import { ensureProgressNotificationChannels, PROGRESS_ALARM_CHANNEL_ID, ProgressNotificationStatus } from './notification-service';

export async function scheduleConfirmedPlanStart(
  plan: ConfirmedSchedulePlan,
  now = Date.now(),
): Promise<{ identifier?: string; reminderIdentifier?: string; status: Exclude<ProgressNotificationStatus, 'idle'> }> {
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
    // Five minutes' warning ahead of the start alarm, so nobody is surprised mid-task. Skipped
    // when the plan is confirmed closer to its start than that.
    const reminderAt = plan.prepStartAt - PREP_START_REMINDER_MINUTES * 60_000;
    let reminderIdentifier: string | undefined;
    if (reminderAt > now) {
      reminderIdentifier = await Notifications.scheduleNotificationAsync({
        content: {
          title: '약속 준비 시작 5분 전이에요',
          body: describePrepStartReminder(plan),
          sound: true,
          data: { source: 'confirmed-plan', planId: plan.id, kind: 'prep-reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminderAt),
          channelId: PROGRESS_ALARM_CHANNEL_ID,
        },
      });
    }
    return { identifier, reminderIdentifier, status: 'scheduled' };
  } catch {
    return { status: 'error' };
  }
}

export async function cancelConfirmedPlanStart(plan: ConfirmedSchedulePlan) {
  if (Platform.OS === 'web') return;
  for (const identifier of [plan.notificationIdentifier, plan.reminderNotificationIdentifier]) {
    if (!identifier) continue;
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {
      // The notification may already have fired or been removed by the OS.
    }
  }
}
