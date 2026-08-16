import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Card, Header, Screen, StatusPill, useAppType } from '@/components/app-ui';
import { AppIcon } from '@/components/app-icon';
import { space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { buildAlertFeed } from '@/lib/alert-feed';
import { getAlertActionTarget } from '@/lib/alert-navigation';
import { useSchedule } from '@/state/schedule-context';

export default function AlertsScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const { confirmedPlans, confirmedPlansStatus, notificationStatus, progressSession } = useSchedule();
  // Recomputed each minute so "12분 뒤 시작" does not sit there going stale.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const alerts = buildAlertFeed({
    plans: confirmedPlans,
    sessionActive: progressSession?.state === 'active',
    notificationStatus,
    now: nowTick,
  });
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="알림" eyebrow="필요한 순간만 알려드려요" />
        {confirmedPlansStatus === 'loading' ? <Card><Text style={type.bodyMuted}>알림을 불러오는 중이에요.</Text></Card> : null}
        {confirmedPlansStatus !== 'loading' && !alerts.length ? (
          <Card style={styles.empty}>
            <AppIcon name="success" size={26} iconColor={c.success} />
            <Text style={type.heading}>지금 확인할 알림이 없어요</Text>
            <Text style={type.bodyMuted}>약속을 등록하면 준비를 시작할 시각을 여기에서 알려드릴게요.</Text>
          </Card>
        ) : null}
        {alerts.map((alert) => (
          <Pressable
            key={alert.id}
            accessibilityRole="button"
            accessibilityLabel={`${alert.title}. ${alert.body}`}
            accessibilityHint={`${alert.actionLabel} 화면으로 이동합니다`}
            onPress={() => router.push(getAlertActionTarget(alert.action))}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Card style={styles.alert}>
              <View style={styles.icon}><AppIcon name={alert.icon} size={20} /></View>
              <View style={styles.content}>
                <View style={styles.top}><Text style={[type.heading, styles.title]}>{alert.title}</Text><View style={styles.pill}><StatusPill label={alert.time} tone={alert.tone} /></View></View>
                <Text style={[type.bodyMuted, styles.body]}>{alert.body}</Text>
                <Text style={styles.actionLabel}>{alert.actionLabel}</Text>
              </View>
              <AppIcon name="chevronRight" size={20} iconColor={c.textMuted} />
            </Card>
          </Pressable>
        ))}
      </Screen>
      <BottomNav />
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  action: { minHeight: 44 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  alert: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  // Without a flex basis the title gives way to the pill and orphans its last syllable.
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm },
  title: { flex: 1 },
  pill: { flexShrink: 0 },
  body: { marginTop: 5 },
  actionLabel: { marginTop: space.sm, color: c.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '800' },
});
