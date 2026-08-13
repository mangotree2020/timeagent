import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Header, Screen, StatusPill, useAppType } from '@/components/app-ui';
import { AppIcon, IconButton } from '@/components/app-icon';
import { DestinationMap } from '@/components/destination-map';
import { Timeline } from '@/components/timeline';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { ExpoLocationProvider } from '@/lib/device-location-provider';
import { createFallbackWalkingRoute, RoutePlan } from '@/lib/journey';
import { createConfiguredMobilityProvider } from '@/lib/mobility-api';
import { createSchedulePlan, PlanStatus } from '@/lib/planning';
import { useSchedule } from '@/state/schedule-context';

/** Fixed starting point so the route rendering can be checked without a device GPS fix. */
const E2E_ROUTE_ORIGIN = { latitude: 35.1578, longitude: 129.0592 };

export default function PlanScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const params = useLocalSearchParams<{ e2eRoute?: string }>();
  const fixtureOrigin = __DEV__ && params.e2eRoute === 'ready' ? E2E_ROUTE_ORIGIN : null;
  const { activeConfirmedPlanId, activePlan, activeSchedule, beginEditConfirmedPlan, confirmPendingPlan, confirmedPlansStatus, deleteConfirmedPlan, draft, editingConfirmedPlanId, pendingPlan, pendingSchedule, useStandardPlan } = useSchedule();
  const [confirmError, setConfirmError] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const schedule = pendingSchedule ?? activeSchedule ?? draft;
  const plan = pendingPlan ?? activePlan ?? createSchedulePlan(schedule);
  const isPending = !!pendingPlan && !!pendingSchedule;
  const isEditing = isPending && !!editingConfirmedPlanId;
  const destinationLatitude = schedule.destinationCoordinate?.latitude;
  const destinationLongitude = schedule.destinationCoordinate?.longitude;
  const destinationName = schedule.destination;

  // The route is only fetched once the map is opened, and a failure leaves the destination-only map
  // in place rather than blocking the screen.
  useEffect(() => {
    if (!mapOpen || destinationLatitude === undefined || destinationLongitude === undefined) return;
    const destination = { latitude: destinationLatitude, longitude: destinationLongitude };
    let cancelled = false;
    void (async () => {
      let origin;
      try {
        origin = fixtureOrigin ?? (await new ExpoLocationProvider().getCurrentLocation()).coordinate;
      } catch {
        return;
      }
      if (cancelled) return;
      try {
        const walking = await createConfiguredMobilityProvider()
          .getWalkingRoute({ origin, destination, endName: destinationName });
        if (!cancelled) setRoute(walking);
      } catch {
        if (!cancelled) setRoute(createFallbackWalkingRoute({ origin, destination }));
      }
    })();
    return () => { cancelled = true; };
  }, [destinationLatitude, destinationLongitude, destinationName, fixtureOrigin, mapOpen]);
  const confirm = async () => {
    try {
      setConfirmError('');
      await confirmPendingPlan();
      router.replace('/schedules');
    } catch {
      setConfirmError('계획을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  };
  const editAppointment = () => {
    if (!activeConfirmedPlanId) return;
    beginEditConfirmedPlan(activeConfirmedPlanId);
    router.push('/create?edit=1');
  };
  const removeAppointment = async () => {
    if (!activeConfirmedPlanId) return;
    try {
      setConfirmError('');
      await deleteConfirmedPlan(activeConfirmedPlanId);
      router.replace('/');
    } catch {
      setConfirmError('약속을 삭제하지 못했습니다. 다시 시도해 주세요.');
    }
  };
  return (
    <Screen>
      <Header title={isPending ? isEditing ? '수정한 준비 계획을 확인해 주세요' : '준비 계획을 확인해 주세요' : '확정된 준비 계획'} eyebrow={isPending ? '저장 전에는 기존 약속이 변경되지 않아요' : '준비 시작 시각에 자동으로 실행돼요'} right={<IconButton name="close" label="닫기" variant="plain" onPress={() => router.back()} />} />
      <Card dark style={styles.summary}>
        <Text style={styles.summaryTitle}>{schedule.appointmentTime} 약속</Text>
        <View style={styles.destinationRow}>
          <Text numberOfLines={2} style={styles.summaryBody}>{schedule.destination}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={mapOpen ? '지도 접기' : '지도 보기'} onPress={() => setMapOpen((open) => !open)} style={({ pressed }) => [styles.mapToggle, pressed && styles.confirmedPressed]}><AppIcon name="location" size={18} iconColor={c.cyan} /><Text style={styles.mapToggleText}>{mapOpen ? '지도 접기' : '지도 보기'}</Text><AppIcon name="chevronRight" size={17} iconColor={c.cyan} style={mapOpen ? styles.mapChevronOpen : undefined} /></Pressable>
        </View>
        <View style={styles.metrics}>
          <Metric label="준비 시작" value={plan.prepStart} />
          <Metric label="출발" value={plan.departure} />
          <Metric label="도착" value={plan.arrival} status={plan.status} />
        </View>
      </Card>
      {mapOpen ? <Card style={styles.mapCard}><View><Text style={type.heading}>{route ? '도착 장소와 이동 경로' : '도착 장소 지도'}</Text><Text style={type.bodyMuted}>{schedule.destinationAddress || schedule.destination}</Text></View>{schedule.destinationCoordinate ? <DestinationMap coordinate={schedule.destinationCoordinate} route={route} /> :<View style={styles.mapUnavailable}><AppIcon name="location" size={26} iconColor={c.textMuted} /><Text style={type.bodyMuted}>저장된 지도 좌표가 없습니다. 약속 수정에서 장소를 다시 선택해 주세요.</Text></View>}</Card> : null}
      {plan.personalizationAdjustments.length > 0 ? (
        <Card style={styles.personalized} accessibilityLabel="실제 완료 기록을 반영한 변경 내용">
          <View style={styles.personalizedHeader}><View style={styles.coachIcon}><AppIcon name="coach" size={18} /></View><View style={{ flex: 1 }}><Text style={type.heading}>내 실제 기록을 반영했어요</Text><Text style={type.bodyMuted}>완료한 일정의 실제 소요 시간만 사용했으며 적용 근거를 확인하거나 이번 계획에서 제외할 수 있어요.</Text></View><StatusPill label={`${plan.personalizationAdjustments.length}개 조정`} tone="success" /></View>
          {plan.personalizationAdjustments.map((adjustment) => <View key={adjustment.id} style={styles.adjustment}><View style={{ flex: 1 }}><Text style={styles.adjustmentLabel}>{adjustment.label}</Text><Text style={type.caption}>실제 기록 {adjustment.samples}회 평균</Text></View><Text style={styles.adjustmentBefore}>{adjustment.beforeMinutes}분</Text><AppIcon name="chevronRight" size={18} iconColor={c.textMuted} /><Text style={styles.adjustmentAfter}>{adjustment.afterMinutes}분</Text></View>)}
          <Button label="이번 계획에서는 기본 시간 사용" variant="secondary" onPress={useStandardPlan} />
        </Card>
      ) : null}
      <Card style={styles.coach}><View style={styles.coachIcon}><AppIcon name="coach" size={18} /></View><Text style={[type.bodyMuted, { flex: 1 }]}>{coachMessage(plan.status, plan.departure, plan.arrival)}</Text></Card>
      <Text style={type.heading}>전체 타임라인</Text>
      <Card><Timeline steps={plan.timeline} transport={schedule.transport} /></Card>
      <View style={styles.actions}>
        {isPending ? <Button label={confirmedPlansStatus === 'saving' ? '계획 저장 중…' : isEditing ? '수정한 약속 저장' : '계획 확정'} disabled={confirmedPlansStatus === 'saving'} onPress={() => void confirm()} /> : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="약속이 저장됐습니다. 홈으로 이동"
            accessibilityHint="홈 화면으로 돌아갑니다"
            onPress={() => router.replace('/')}
            style={({ pressed }) => pressed && styles.confirmedPressed}>
            <Card style={styles.confirmed}>
              <View style={styles.confirmedIcon}><AppIcon name="success" size={34} strokeWidth={3} iconColor={c.success} /></View>
              <View style={{ flex: 1 }}><Text style={styles.confirmedTitle}>약속이 저장됐습니다.</Text><Text style={type.caption}>{plan.prepStart}에 자동으로 준비를 시작하고 알림으로 알려드려요.</Text></View>
            </Card>
          </Pressable>
        )}
        {isPending ? <View style={styles.secondary}><Button label="준비 시간 수정" variant="secondary" onPress={() => router.push('/create')} /><Button label="플랜 B 보기" variant="secondary" onPress={() => router.push('/plan-b')} /></View> : null}
        {!isPending && activeConfirmedPlanId ? <View style={styles.manageActions}><View style={{ flex: 1 }}><Button label="약속 수정" variant="secondary" onPress={editAppointment} /></View><View style={{ flex: 1 }}><Button label="약속 삭제" variant="dangerGhost" onPress={() => setDeleteOpen(true)} /></View></View> : null}
        {deleteOpen ? <Card style={styles.deleteConfirm}><Text style={styles.deleteTitle}>이 약속을 삭제할까요?</Text><Text style={type.bodyMuted}>준비 시작 알림과 저장된 준비 계획도 함께 삭제됩니다.</Text><View style={styles.manageActions}><View style={{ flex: 1 }}><Button label="삭제 취소" variant="secondary" onPress={() => setDeleteOpen(false)} /></View><View style={{ flex: 1 }}><Button label="삭제 확인" variant="danger" onPress={() => void removeAppointment()} /></View></View></Card> : null}
        {confirmError ? <Text accessibilityRole="alert" style={styles.error}>{confirmError}</Text> : null}
      </View>
    </Screen>
  );
}

function Metric({ label, value, status }: { label: string; value: string; status?: PlanStatus }) {
  const styles = useThemedStyles(createStyles);
  const statusParts = status?.label.split(/\s+/, 2);
  const statusLabel = statusParts ? `${statusParts[0]}${statusParts[1] ? `\n${statusParts[1]}` : ''}` : '';
  return <View accessible={!!status} accessibilityLabel={status ? `${label} ${value}, ${status.label}` : undefined} style={[styles.metric, status && styles.arrivalMetric]}><Text style={styles.metricLabel}>{label}</Text><View style={styles.metricValueRow}><Text style={styles.metricValue}>{value}</Text>{status ? <View style={[styles.arrivalStatus, styles[`arrivalStatus_${status.tone}`]]}><Text style={[styles.arrivalStatusText, styles[`arrivalStatusText_${status.tone}`]]}>{statusLabel}</Text></View> : null}</View></View>;
}

function coachMessage(status: PlanStatus, departure: string, arrival: string) {
  if (status.kind === 'ready') return `${departure}에 출발하면 ${arrival}에 도착해요. 입력한 준비 행동과 이동 시간을 모두 반영했습니다.`;
  if (status.kind === 'start-now') return `지금 첫 준비 행동을 시작하세요. 그대로 진행하면 ${arrival} 도착 계획이며, 남은 여유를 계속 확인해 드릴게요.`;
  return `정시 도착이 어렵습니다. 중요한 준비 행동은 유지하고 플랜 B에서 더 빠른 이동 방법을 비교해 보세요.`;
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  summary: { gap: space.md }, summaryTitle: { fontSize: 32, color: c.onInverse, fontWeight: '900' }, destinationRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm }, summaryBody: { flexShrink: 1, fontSize: 16, color: c.onInverseMuted, fontWeight: '700' }, mapToggle: { flexShrink: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' }, mapToggleText: { color: c.onInverse, fontSize: 14, fontWeight: '800' }, mapChevronOpen: { transform: [{ rotate: '90deg' }] }, mapCard: { gap: space.md, padding: space.lg }, mapUnavailable: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.md, backgroundColor: c.surfaceMuted }, metrics: { flexDirection: 'row', alignItems: 'flex-end', marginTop: space.sm, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.18)' }, metric: { flex: 0.9, justifyContent: 'flex-end' }, arrivalMetric: { flex: 1.2 }, metricLabel: { fontSize: 11, color: c.onInverseMuted, marginBottom: 4 }, metricValueRow: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 5 }, metricValue: { flexShrink: 0, fontSize: 19, color: c.onInverse, fontWeight: '900' }, arrivalStatus: { flexShrink: 0, minWidth: 42, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 12 }, arrivalStatus_success: { backgroundColor: c.successSoft }, arrivalStatus_warning: { backgroundColor: c.warningSoft }, arrivalStatus_danger: { backgroundColor: c.dangerSoft }, arrivalStatusText: { fontSize: 10, lineHeight: 12, fontWeight: '900', textAlign: 'center' }, arrivalStatusText_success: { color: c.success }, arrivalStatusText_warning: { color: c.warning }, arrivalStatusText_danger: { color: c.danger }, personalized: { gap: space.md, borderWidth: 2, borderColor: c.success }, personalizedHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md }, adjustment: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: c.border }, adjustmentLabel: { color: c.navy, fontSize: 15, fontWeight: '800' }, adjustmentBefore: { color: c.textMuted, fontSize: 14, textDecorationLine: 'line-through' }, adjustmentAfter: { color: c.deepBlue, fontSize: 16, fontWeight: '900' }, coach: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: c.infoSoft, gap: space.md }, coachIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }, actions: { gap: space.sm }, secondary: { flexDirection: 'row', gap: space.sm }, confirmed: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.successSoft, borderWidth: 2, borderColor: c.success }, confirmedPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] }, confirmedIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 2, borderColor: c.success }, confirmedTitle: { color: c.navy, fontSize: 17, lineHeight: 24, fontWeight: '900' }, manageActions: { flexDirection: 'row', gap: space.sm }, deleteConfirm: { gap: space.md, borderWidth: 2, borderColor: c.danger }, deleteTitle: { color: c.navy, fontSize: 18, lineHeight: 25, fontWeight: '900' }, error: { color: c.danger, fontSize: 13, textAlign: 'center' },
});
