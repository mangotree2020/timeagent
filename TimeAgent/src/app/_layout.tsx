import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { AuthGate } from '@/components/auth-gate';
import { OnboardingGate } from '@/components/onboarding-gate';
import { recordAnalyticsEvent } from '@/lib/analytics';
import '@/lib/background-journey-service';
import { AuthProvider } from '@/state/auth-context';
import { ScheduleProvider } from '@/state/schedule-context';
import { TaskProvider } from '@/state/task-context';
import { ThemeProvider, useAppTheme } from '@/state/theme-context';

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
      const data = response.notification.request.content.data;
      if (data?.source !== 'progress-session' && data?.source !== 'confirmed-plan') return;
      // A choice made on the alarm is handled where the session lives and must not pull the user
      // into the app; only opening the notification itself navigates.
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      void recordAnalyticsEvent(AsyncStorage, 'notification_opened', {
        kind: String(data.kind ?? 'unknown'),
      });
      router.push({ pathname: '/progress', params: { source: 'notification', planId: String(data.planId ?? '') } });
    });
    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider><RootLayoutContent /></ThemeProvider>
  );
}

function RootLayoutContent() {
  const { mode, palette } = useAppTheme();
  return <AuthProvider>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    <OnboardingGate>
      <AuthGate>
        <TaskProvider><ScheduleProvider>
          {/* A sliding screen rasterises its native box shadows into a rectangular layer on
              Android, which shows as a brief grey flash on every navigation. Tabs switch with no
              animation, the way tab bars do; pushes cross-fade, which moves the whole screen as
              one layer and leaves no seam for the shadow rectangle to show through. */}
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background }, animation: 'fade', animationDuration: 150 }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="schedules" options={{ animation: 'none' }} />
            <Stack.Screen name="alerts" options={{ animation: 'none' }} />
            <Stack.Screen name="settings" options={{ animation: 'none' }} />
          </Stack>
        </ScheduleProvider></TaskProvider>
      </AuthGate>
    </OnboardingGate>
  </AuthProvider>;
}
