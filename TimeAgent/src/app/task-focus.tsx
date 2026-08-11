import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/app-icon';
import { Button, Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { color, radius, space } from '@/constants/design';
import { getFocusRemainingSeconds } from '@/lib/task-execution';
import { useTaskExecution } from '@/state/task-context';

export default function TaskFocusScreen() {
  const { currentTask, status, startTask, completeCurrentAction } = useTaskExecution();
  const [now, setNow] = useState(0);
  const remaining = currentTask ? now === 0 && currentTask.status === 'active' ? 300 : getFocusRemainingSeconds(currentTask, now) : 0;
  const current = currentTask?.actions.find((action) => action.status === 'current') ?? null;
  const upcoming = useMemo(() => currentTask?.actions.filter((action) => action.status === 'upcoming') ?? [], [currentTask]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  if (status === 'loading') return <Screen><Header title="할 일을 준비하는 중" /><Card><Text style={type.bodyMuted}>저장된 다음 행동을 확인하고 있어요.</Text></Card></Screen>;
  if (!currentTask || !current) return <Screen><Header title="지금 할 일" right={<IconButton name="close" label="홈으로" variant="plain" onPress={() => router.replace('/')} />} /><Card><Text style={type.heading}>지금 이어갈 할 일이 없어요</Text><Text style={type.bodyMuted}>홈에서 말로 할 일을 추가하면 시작할 만큼 작게 나눠 드려요.</Text></Card><Button label="말로 할 일 추가" onPress={() => router.replace('/voice-schedule')} /></Screen>;

  const active = currentTask.status === 'active';
  const progress = active ? Math.max(0, Math.min(100, (300 - remaining) / 300 * 100)) : 0;
  return <Screen>
    <Header title={currentTask.title} eyebrow="지금–다음–나중" right={<IconButton name="close" label="홈으로" variant="plain" onPress={() => router.replace('/')} />} />
    <Card dark style={styles.nowCard} accessibilityLabel={`지금 ${current.label}`}>
      <View style={styles.labelRow}><Text style={styles.nowLabel}>지금</Text><StatusPill label={active ? '5분 시작 중' : '시작 준비'} tone={active ? 'success' : 'info'} /></View>
      <Text style={styles.action}>{current.label}</Text>
      <Text accessibilityLabel={active ? `남은 시간 ${formatCountdown(remaining)}` : '5분만 시작할 수 있습니다'} style={styles.timer}>{active ? formatCountdown(remaining) : '5:00'}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(active ? 6 : 0, progress)}%` }]} /></View>
      <Text style={styles.support}>{active ? remaining > 0 ? '이 행동 하나만 하면 돼요.' : '5분이 지났어요. 완료하거나 5분 더 이어가세요.' : '완벽하게 끝내지 않아도 괜찮아요. 시작만 해요.'}</Text>
      <Button label={active ? `${current.label} 완료` : '5분만 시작'} disabled={status === 'saving'} onPress={() => active ? void completeCurrentAction(currentTask.id) : void startTask(currentTask.id)} />
      {active ? <Pressable accessibilityRole="button" onPress={() => void startTask(currentTask.id)} style={styles.extend}><Text style={styles.extendText}>5분 더 이어가기</Text></Pressable> : null}
    </Card>
    <Card style={styles.sequence}>
      <Text style={styles.sequenceLabel}>다음</Text>
      <Text style={styles.sequenceAction}>{upcoming[0]?.label ?? '이 행동을 마치면 완료예요'}</Text>
      <View style={styles.divider} />
      <Text style={styles.sequenceLabel}>나중</Text>
      <Text style={styles.later}>{upcoming.slice(1).map((action) => action.label).join(' · ') || '지금은 생각하지 않아도 돼요'}</Text>
    </Card>
    <Text accessibilityLiveRegion="polite" style={[styles.saved, status === 'error' && styles.error]}>{status === 'saving' ? '진행을 저장하는 중입니다' : status === 'error' ? '저장하지 못했습니다. 다시 시도해 주세요.' : '진행이 자동 저장됩니다'}</Text>
  </Screen>;
}

function formatCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  nowCard: { gap: space.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  nowLabel: { color: color.cyan, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  action: { color: color.surface, fontSize: 24, lineHeight: 32, fontWeight: '900' },
  timer: { color: color.surface, fontSize: 52, lineHeight: 60, fontWeight: '900', letterSpacing: -1.5 },
  track: { height: 10, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.2)' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: color.cyan },
  support: { color: color.ice, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  extend: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  extendText: { color: color.ice, fontSize: 14, fontWeight: '900' },
  sequence: { gap: space.sm }, sequenceLabel: { color: color.deepBlue, fontSize: 13, fontWeight: '900' },
  sequenceAction: { color: color.navy, fontSize: 18, lineHeight: 25, fontWeight: '900' },
  divider: { height: 1, marginVertical: space.sm, backgroundColor: color.border },
  later: { color: color.textMuted, fontSize: 15, lineHeight: 22 },
  saved: { color: color.textMuted, textAlign: 'center', fontSize: 12 }, error: { color: color.danger },
});
