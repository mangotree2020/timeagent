import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { color } from '@/constants/design';
import { recordAnalyticsEvent } from '@/lib/analytics';
import '@/lib/background-journey-service';
import { ScheduleProvider } from '@/state/schedule-context';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.source !== 'progress-session') return;
      void recordAnalyticsEvent(AsyncStorage, 'notification_opened', {
        kind: String(response.notification.request.content.data.kind ?? 'unknown'),
      });
      router.push({ pathname: '/progress', params: { source: 'notification' } });
    });
    return () => subscription.remove();
  }, []);

  return (
    <ScheduleProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background }, animation: 'slide_from_right' }} />
    </ScheduleProvider>
  );
}
