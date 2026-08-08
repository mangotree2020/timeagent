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
        <ScheduleProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background }, animation: 'slide_from_right' }} />
        </ScheduleProvider>
      </AuthGate>
    </OnboardingGate>
  </AuthProvider>;
}
