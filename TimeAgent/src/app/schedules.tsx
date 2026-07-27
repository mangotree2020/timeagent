import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { AppIcon } from '@/components/app-icon';
import { color, radius, space } from '@/constants/design';
import { demoSchedule } from '@/data/demo';
import { useSchedule } from '@/state/schedule-context';

type ScheduleTab = '예정' | '완료';

export default function SchedulesScreen() {
  const [tab, setTab] = useState<ScheduleTab>('예정');
  const { activePlan, activeSchedule } = useSchedule();
  const schedule = activeSchedule ?? demoSchedule;
  const prepStart = activePlan?.prepStart ?? demoSchedule.prepStart;
  const departure = activePlan?.departure ?? demoSchedule.departure;

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="일정" eyebrow="다가오는 약속과 지난 기록을 확인하세요" />
        <View style={styles.tabs}>
          {(['예정', '완료'] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item }}
              onPress={() => setTab(item)}
              style={[styles.tab, tab === item && styles.tabActive]}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.tabDescription}>{tab} 일정 목록입니다.</Text>

        {tab === '예정' ? (
          <>
            <Text style={styles.date}>{schedule.date || '오늘'}</Text>
            <Pressable accessibilityRole="button" accessibilityHint="준비 계획을 엽니다" onPress={() => router.push('/plan')}>
              <Card style={styles.schedule}>
                <View style={styles.timeRail}><Text style={styles.time}>{schedule.appointmentTime}</Text><View style={styles.line} /></View>
                <View style={{ flex: 1, gap: 5 }}>
                  <StatusPill label="준비 전" />
                  <Text style={type.heading}>{schedule.title}</Text>
                  <View style={styles.locationRow}><AppIcon name="location" size={16} /><Text style={type.bodyMuted}>{schedule.destination}</Text></View>
                  <Text style={styles.meta}>{prepStart} 준비 시작 · {departure} 출발</Text>
                </View>
                <AppIcon name="chevronRight" size={22} iconColor={color.textMuted} style={styles.arrow} />
              </Card>
            </Pressable>
            <Button label="새 일정 만들기" onPress={() => router.push({ pathname: '/create', params: { new: '1' } })} />
          </>
        ) : (
          <>
            <Text style={styles.date}>최근 완료</Text>
            <Pressable accessibilityRole="button" accessibilityHint="완료 기록을 엽니다" onPress={() => router.push('/complete')}>
              <Card style={styles.schedule}>
                <View style={styles.timeRail}><Text style={styles.time}>18:30</Text></View>
                <View style={{ flex: 1, gap: 5 }}>
                  <StatusPill label="3분 일찍 도착" tone="success" />
                  <Text style={type.heading}>광안리 저녁 약속</Text>
                  <View style={styles.locationRow}><AppIcon name="location" size={16} /><Text style={type.bodyMuted}>광안리 해변 식당</Text></View>
                  <Text style={styles.meta}>실제 준비·이동 기록 보기</Text>
                </View>
                <AppIcon name="chevronRight" size={22} iconColor={color.textMuted} style={styles.arrow} />
              </Card>
            </Pressable>
          </>
        )}
      </Screen>
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: color.surfaceMuted, borderRadius: radius.pill, padding: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  tabActive: { backgroundColor: color.surface },
  tabText: { color: color.textMuted, fontWeight: '700' },
  tabTextActive: { color: color.deepBlue, fontWeight: '900' },
  tabDescription: { ...type.caption, marginTop: -space.md },
  date: { fontSize: 14, color: color.textMuted, fontWeight: '800', marginTop: space.sm },
  schedule: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  timeRail: { width: 54 },
  time: { fontSize: 17, color: color.navy, fontWeight: '900' },
  line: { width: 2, height: 70, backgroundColor: color.cyan, marginTop: 8, marginLeft: 18 },
  meta: { fontSize: 12, color: color.deepBlue, fontWeight: '700', marginTop: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  arrow: { alignSelf: 'center' },
});
