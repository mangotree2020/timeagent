import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Header, Screen, SectionTitle, StatusPill, type } from '@/components/app-ui';
import { AppIcon, IconButton } from '@/components/app-icon';
import { Timeline } from '@/components/timeline';
import { color, radius, space } from '@/constants/design';
import { demoSchedule } from '@/data/demo';
import { useSchedule } from '@/state/schedule-context';
import { hasCompletedOnboarding } from '@/lib/onboarding';

export default function HomeScreen() {
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const { activePlan, activeSchedule, timeline, delayMinutes, startProgress } = useSchedule();
  const schedule = activeSchedule ?? demoSchedule;
  const prepStart = activePlan?.prepStart ?? demoSchedule.prepStart;
  const beginProgress = async () => {
    await startProgress();
    router.push('/progress');
  };

  useEffect(() => {
    let active = true;
    hasCompletedOnboarding(AsyncStorage)
      .then((completed) => {
        if (!active) return;
        if (!completed) router.replace('/onboarding');
      })
      .finally(() => {
        if (active) setOnboardingChecked(true);
      });
    return () => { active = false; };
  }, []);

  if (!onboardingChecked) {
    return <View style={styles.loading}><ActivityIndicator color={color.deepBlue} /><Text style={type.caption}>첫 실행을 준비하고 있어요.</Text></View>;
  }
  return (
    <View style={styles.page}>
      <Screen>
        <Header title="좋은 오후예요, 서연님" eyebrow="7월 23일 목요일" right={<IconButton name="alert" label="알림 보기" onPress={() => router.push('/alerts')} />} />

        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <StatusPill label="다음 일정" />
            <Text style={styles.appointment}>{schedule.appointmentTime}</Text>
          </View>
          <Text style={type.title}>{schedule.title}</Text>
          <View style={styles.locationRow}><AppIcon name="location" size={16} /><Text style={type.bodyMuted}>{schedule.destination}</Text></View>
          <View style={styles.rule} />
          <Text style={styles.countdownLabel}>준비 시작까지</Text>
          <View style={styles.countdownRow}><Text style={type.display}>28분</Text><StatusPill label={delayMinutes > 0 ? `${delayMinutes}분 지연 감지` : '정시 페이스'} tone={delayMinutes > 0 ? 'warning' : 'success'} /></View>
          <Text style={type.bodyMuted}>{prepStart}에 준비를 시작하면 약속 시간에 맞춰 도착할 수 있어요.</Text>
          <Button label="지금 준비 시작" onPress={() => void beginProgress()} accessibilityHint="실시간 준비 진행 화면으로 이동합니다" />
        </Card>

        <Card style={styles.coach}>
          <View style={styles.coachIcon}><AppIcon name="coach" size={18} iconColor={color.navy} /></View>
          <View style={{ flex: 1 }}><Text style={styles.coachTitle}>ON:TIME 코치</Text><Text style={type.bodyMuted}>어제 샤워가 조금 길어서 오늘은 18분으로 여유 있게 잡아뒀어요.</Text></View>
        </Card>

        <SectionTitle action={<Pressable onPress={() => router.push('/plan')}><Text style={styles.link}>전체 보기</Text></Pressable>}>오늘의 준비 계획</SectionTitle>
        <Card><Timeline steps={timeline.slice(0, 4)} compact /></Card>

        <Pressable accessibilityRole="button" accessibilityLabel="새 일정 추가" onPress={() => router.push({ pathname: '/create', params: { new: '1' } })} style={styles.fab}><AppIcon name="plus" size={26} iconColor={color.surface} strokeWidth={2.5} /></Pressable>
      </Screen>
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, backgroundColor: color.background },
  page: { flex: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hero: { gap: space.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appointment: { fontSize: 20, color: color.navy, fontWeight: '900' },
  rule: { height: 1, backgroundColor: color.border, marginVertical: space.xs },
  countdownLabel: { ...type.caption, fontWeight: '800' },
  countdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  coach: { flexDirection: 'row', gap: space.md, backgroundColor: '#E6F6FB' },
  coachIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color.cyan },
  coachTitle: { fontSize: 14, color: color.deepBlue, fontWeight: '900', marginBottom: 3 },
  link: { color: color.deepBlue, fontSize: 14, fontWeight: '800' },
  fab: { position: 'absolute', right: 22, bottom: 88, width: 56, height: 56, borderRadius: radius.pill, backgroundColor: color.deepBlue, alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 12px rgba(0,119,182,0.25)', elevation: 5 },
});
