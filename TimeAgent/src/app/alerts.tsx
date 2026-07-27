import { StyleSheet, Text, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { AppIcon, AppIconName } from '@/components/app-icon';
import { color, space } from '@/constants/design';

const alerts = [
  { icon: 'time', title: '준비 시작 알림', body: '12:55에 준비를 시작하세요.', time: '28분 후', tone: 'info' as const },
  { icon: 'coach', title: '시간을 다시 계산했어요', body: '화장 시간을 3분 늘려 계획에 반영했습니다.', time: '방금', tone: 'success' as const },
  { icon: 'location', title: '위치 권한 확인', body: '출발 위치를 자동으로 계산하려면 위치 권한이 필요해요.', time: '어제', tone: 'warning' as const },
] satisfies { icon: AppIconName; title: string; body: string; time: string; tone: 'info' | 'success' | 'warning' }[];

export default function AlertsScreen() { return <View style={{ flex: 1 }}><Screen><Header title="알림" eyebrow="필요한 순간만 알려드려요" />{alerts.map((alert) => <Card key={alert.title} style={styles.alert}><View style={styles.icon}><AppIcon name={alert.icon} size={20} /></View><View style={{ flex: 1 }}><View style={styles.top}><Text style={type.heading}>{alert.title}</Text><StatusPill label={alert.time} tone={alert.tone} /></View><Text style={[type.bodyMuted, { marginTop: 5 }]}>{alert.body}</Text></View></Card>)}</Screen><BottomNav /></View>; }

const styles = StyleSheet.create({ alert: { flexDirection: 'row', gap: space.md }, icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.sm } });
