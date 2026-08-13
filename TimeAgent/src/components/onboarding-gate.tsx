import AsyncStorage from '@react-native-async-storage/async-storage';
import { PropsWithChildren, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppLogo } from '@/components/app-logo';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { useAppType } from '@/components/app-ui';
import { space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { completeOnboarding, hasCompletedOnboarding } from '@/lib/onboarding';

type OnboardingStatus = 'checking' | 'required' | 'complete';

export function OnboardingGate({ children }: PropsWithChildren) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const [status, setStatus] = useState<OnboardingStatus>('checking');

  useEffect(() => {
    let active = true;
    hasCompletedOnboarding(AsyncStorage)
      .then((completed) => {
        if (active) setStatus(completed ? 'complete' : 'required');
      })
      .catch(() => {
        if (active) setStatus('required');
      });
    return () => { active = false; };
  }, []);

  if (status === 'checking') {
    return <View accessibilityLabel="첫 실행 확인 중" style={styles.loading}><AppLogo size={42} /><ActivityIndicator color={c.deepBlue} /><Text style={type.caption}>첫 실행을 준비하고 있어요.</Text></View>;
  }

  if (status === 'required') {
    return <OnboardingFlow onComplete={async () => { await completeOnboarding(AsyncStorage); setStatus('complete'); }} />;
  }

  return children;
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, backgroundColor: c.background },
});
