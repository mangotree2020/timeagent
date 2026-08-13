import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Card, Header, Screen, StatusPill, useAppType } from '@/components/app-ui';
import { AppIcon, AppIconName } from '@/components/app-icon';
import { space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { AlertAction, getAlertActionTarget } from '@/lib/alert-navigation';

const alerts = [
  { icon: 'time', title: '준비 시작 알림', body: '12:55에 준비를 시작하세요.', time: '28분 후', tone: 'info' as const, action: 'start-progress', actionLabel: '지금 준비 시작' },
  { icon: 'coach', title: '시간을 다시 계산했어요', body: '화장 시간을 3분 늘려 계획에 반영했습니다.', time: '방금', tone: 'success' as const, action: 'review-plan', actionLabel: '변경된 계획 확인' },
  { icon: 'location', title: '위치 권한 확인', body: '출발 위치를 자동으로 계산하려면 위치 권한이 필요해요.', time: '어제', tone: 'warning' as const, action: 'fix-location-permission', actionLabel: '위치 권한 설정' },
] satisfies { icon: AppIconName; title: string; body: string; time: string; tone: 'info' | 'success' | 'warning'; action: AlertAction; actionLabel: string }[];

export default function AlertsScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="알림" eyebrow="필요한 순간만 알려드려요" />
        {alerts.map((alert) => (
          <Pressable
            key={alert.title}
            accessibilityRole="button"
            accessibilityLabel={`${alert.title}. ${alert.body}`}
            accessibilityHint={`${alert.actionLabel} 화면으로 이동합니다`}
            onPress={() => router.push(getAlertActionTarget(alert.action))}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Card style={styles.alert}>
              <View style={styles.icon}><AppIcon name={alert.icon} size={20} /></View>
              <View style={styles.content}>
                <View style={styles.top}><Text style={type.heading}>{alert.title}</Text><StatusPill label={alert.time} tone={alert.tone} /></View>
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
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  alert: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm },
  body: { marginTop: 5 },
  actionLabel: { marginTop: space.sm, color: c.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '800' },
});
