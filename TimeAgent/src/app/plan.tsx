import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { AppIcon, IconButton } from '@/components/app-icon';
import { Timeline } from '@/components/timeline';
import { color, space } from '@/constants/design';
import { createSchedulePlan, PlanStatus } from '@/lib/planning';
import { useSchedule } from '@/state/schedule-context';

export default function PlanScreen() {
  const { activePlan, activeSchedule, draft, startProgress, useStandardPlan } = useSchedule();
  const schedule = activeSchedule ?? draft;
  const plan = activePlan ?? createSchedulePlan(schedule);
  const begin = async () => {
    await startProgress('plan');
    router.replace('/progress');
  };
  return (
    <Screen>
      <Header title="준비 계획이 완성됐어요" eyebrow="AI 계획 생성 결과" right={<IconButton name="close" label="닫기" variant="plain" onPress={() => router.back()} />} />
      <Card dark style={styles.summary}>
        <StatusPill label={plan.status.label} tone={plan.status.tone} />
        <Text style={styles.summaryTitle}>{schedule.appointmentTime} 약속</Text>
        <Text style={styles.summaryBody}>{schedule.destination} · {plan.arrival} 도착 예정</Text>
        <View style={styles.metrics}>
          <Metric label="준비 시작" value={plan.prepStart} />
          <Metric label="출발" value={plan.departure} />
          <Metric label="도착" value={plan.arrival} />
        </View>
      </Card>
      {plan.personalizationAdjustments.length > 0 ? (
        <Card style={styles.personalized} accessibilityLabel="실제 완료 기록을 반영한 변경 내용">
          <View style={styles.personalizedHeader}><View style={styles.coachIcon}><AppIcon name="coach" size={18} /></View><View style={{ flex: 1 }}><Text style={type.heading}>내 실제 기록을 반영했어요</Text><Text style={type.bodyMuted}>완료한 일정의 실제 소요 시간만 사용했으며 적용 근거를 확인하거나 이번 계획에서 제외할 수 있어요.</Text></View><StatusPill label={`${plan.personalizationAdjustments.length}개 조정`} tone="success" /></View>
          {plan.personalizationAdjustments.map((adjustment) => <View key={adjustment.id} style={styles.adjustment}><View style={{ flex: 1 }}><Text style={styles.adjustmentLabel}>{adjustment.label}</Text><Text style={type.caption}>실제 기록 {adjustment.samples}회 평균</Text></View><Text style={styles.adjustmentBefore}>{adjustment.beforeMinutes}분</Text><AppIcon name="chevronRight" size={18} iconColor={color.textMuted} /><Text style={styles.adjustmentAfter}>{adjustment.afterMinutes}분</Text></View>)}
          <Button label="이번 계획에서는 기본 시간 사용" variant="secondary" onPress={useStandardPlan} />
        </Card>
      ) : null}
      <Card style={styles.coach}><View style={styles.coachIcon}><AppIcon name="coach" size={18} /></View><Text style={[type.bodyMuted, { flex: 1 }]}>{coachMessage(plan.status, plan.departure, plan.arrival)}</Text></Card>
      <Text style={type.heading}>전체 타임라인</Text>
      <Card><Timeline steps={plan.timeline} /></Card>
      <View style={styles.actions}><Button label="이 계획으로 시작" onPress={() => void begin()} /><View style={styles.secondary}><Button label="준비 시간 수정" variant="secondary" onPress={() => router.push('/create')} /><Button label="플랜 B 보기" variant="secondary" onPress={() => router.push('/plan-b')} /></View></View>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={{ flex: 1 }}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

function coachMessage(status: PlanStatus, departure: string, arrival: string) {
  if (status.kind === 'ready') return `${departure}에 출발하면 ${arrival}에 도착해요. 입력한 준비 행동과 이동 시간을 모두 반영했습니다.`;
  if (status.kind === 'start-now') return `지금 첫 준비 행동을 시작하세요. 그대로 진행하면 ${arrival} 도착 계획이며, 남은 여유를 계속 확인해 드릴게요.`;
  return `정시 도착이 어렵습니다. 중요한 준비 행동은 유지하고 플랜 B에서 더 빠른 이동 방법을 비교해 보세요.`;
}

const styles = StyleSheet.create({
  summary: { gap: space.md }, summaryTitle: { fontSize: 32, color: color.surface, fontWeight: '900' }, summaryBody: { fontSize: 15, color: color.ice }, metrics: { flexDirection: 'row', marginTop: space.sm, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.18)' }, metricLabel: { fontSize: 11, color: color.ice, marginBottom: 4 }, metricValue: { fontSize: 19, color: color.surface, fontWeight: '900' }, personalized: { gap: space.md, borderWidth: 2, borderColor: color.success }, personalizedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md }, adjustment: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: color.border }, adjustmentLabel: { color: color.navy, fontSize: 15, fontWeight: '800' }, adjustmentBefore: { color: color.textMuted, fontSize: 14, textDecorationLine: 'line-through' }, adjustmentAfter: { color: color.deepBlue, fontSize: 16, fontWeight: '900' }, coach: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#E6F6FB', gap: space.md }, coachIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface }, actions: { gap: space.sm }, secondary: { flexDirection: 'row', gap: space.sm },
});
