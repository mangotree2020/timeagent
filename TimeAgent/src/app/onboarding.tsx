import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

import { OnboardingFlow } from '@/components/onboarding-flow';
import { completeOnboarding } from '@/lib/onboarding';

export default function OnboardingScreen() {
  const finish = async () => {
    await completeOnboarding(AsyncStorage);
    router.replace('/');
  };
  return <OnboardingFlow onComplete={finish} />;
}
