import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Header, Screen, StatusPill, appType, useAppType } from '@/components/app-ui';
import { AppIcon, IconButton, iconForTransport } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { alternatives } from '@/data/demo';
import { ExpoLocationProvider } from '@/lib/device-location-provider';
import { createConfiguredMobilityProvider } from '@/lib/mobility-api';
import {
  createActualWalkingAlternative,
  TransportAlternative,
  transportEvidenceDescription,
  transportEvidenceLabel,
} from '@/lib/transport-comparison';
import { PlanBSort, sortPlanAlternatives } from '@/lib/ui-controls';
import { useSchedule } from '@/state/schedule-context';

const sortOptions: PlanBSort[] = ['정시 도착', '비용 우선', '걷기 최소'];

export default function PlanBScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const { activeSchedule, applyRoute, draft, pendingSchedule, progressSession, route } = useSchedule();
  const [selected, setSelected] = useState<string>(
    () => alternatives.find((item) => item.title !== route)?.id ?? alternatives[0].id,
  );
  const [sort, setSort] = useState<PlanBSort>('정시 도착');
  const [walkingChoice, setWalkingChoice] = useState<TransportAlternative | null>(null);
  const [walkingStatus, setWalkingStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [applying, setApplying] = useState(false);
  const schedule = pendingSchedule ?? activeSchedule ?? draft;
  const choices = useMemo<TransportAlternative[]>(
    () => [...alternatives, ...(walkingChoice ? [walkingChoice] : [])].filter((item) => item.title !== route),
    [route, walkingChoice],
  );
  const choice = choices.find((item) => item.id === selected) ?? choices[0];
  const sortedAlternatives = sortPlanAlternatives(choices, sort);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const loadWalkingRoute = async () => {
      try {
        const mobility = createConfiguredMobilityProvider();
        const location = await new ExpoLocationProvider().getCurrentLocation();
        let destination = schedule.destinationCoordinate;
        if (!destination) {
          const places = await mobility.geocode(schedule.destinationAddress || schedule.destination, controller.signal);
          destination = places[0]?.coordinate ?? null;
        }
        if (!destination) throw new Error('목적지 좌표를 찾을 수 없습니다.');
        const walkingRoute = await mobility.getWalkingRoute({
          origin: location.coordinate,
          destination,
          startName: '현재 위치',
          endName: schedule.destination,
          signal: controller.signal,
        });
        if (!active) return;
        setWalkingChoice(createActualWalkingAlternative({
          route: walkingRoute,
          appointmentTime: schedule.appointmentTime,
        }));
        setWalkingStatus('ready');
      } catch {
        if (active) setWalkingStatus('unavailable');
      }
    };
    void loadWalkingRoute();
    return () => {
      active = false;
      controller.abort();
    };
  }, [schedule.appointmentTime, schedule.destination, schedule.destinationAddress, schedule.destinationCoordinate]);

  const selectChoice = (id: string) => {
    setSelected(id);
    setShowConfirmation(false);
  };

  const confirmRoute = async () => {
    setApplying(true);
    try {
      await applyRoute(choice.title);
      router.replace(progressSession?.state === 'active' ? '/progress' : '/plan');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Screen>
      <Header title="플랜 B" eyebrow="현재 계획으로는 8분 늦게 도착해요" right={<IconButton name="close" label="닫기" variant="plain" onPress={() => router.back()} />} />
      <Card dark><Text style={styles.bannerTitle}>정시 도착 가능한 대안을 찾았어요</Text><Text style={styles.bannerBody}>현재 경로 · {route}</Text><Text style={styles.bannerBody}>시간, 비용, 걷기를 함께 비교해 가장 현실적인 안을 추천합니다.</Text></Card>
      <View accessibilityRole="tablist" style={styles.filters}>{sortOptions.map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: sort === item }} onPress={() => setSort(item)} style={[styles.filter, sort === item && styles.filterActive]}><Text style={[styles.filterText, sort === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View>
      <Text accessibilityLiveRegion="polite" style={styles.sortDescription}>{sort} 기준으로 대안을 정렬했습니다.</Text>
      {sortedAlternatives.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected === item.id }} onPress={() => selectChoice(item.id)}><Card style={[styles.option, selected === item.id && styles.optionSelected]}><View style={styles.pills}>{item.recommended ? <StatusPill label="AI 추천" /> : null}<StatusPill label={transportEvidenceLabel(item.evidence)} tone={item.evidence.kind === 'actual-route' ? 'success' : 'info'} /></View><View style={styles.optionTop}><View style={styles.optionIcon}><AppIcon name={iconForTransport(item.title)} size={28} /></View><View style={{ flex: 1 }}><Text style={type.heading}>{item.title}</Text><Text style={type.caption}>{item.note}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.optionArrival}>{item.arrival}</Text><Text style={[styles.optionStatus, item.status.includes('지각') && { color: c.warning }]}>{item.status}</Text></View></View><View style={styles.routeMetrics}><Text style={styles.routeMetric}>약 {item.durationMinutes}분</Text><Text style={styles.routeMetric}>{item.distanceLabel}</Text></View><View style={styles.tags}>{[item.cost, item.walk, item.transfer].map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View><Text style={styles.evidence}>{transportEvidenceDescription(item.evidence)}</Text></Card></Pressable>)}
      <View accessibilityLiveRegion="polite" style={styles.liveRouteStatus}>{walkingStatus === 'loading' ? <><ActivityIndicator size="small" color={c.deepBlue} /><Text style={styles.liveRouteText}>현재 위치에서 TMAP 도보 실제 경로를 확인 중입니다.</Text></> : walkingStatus === 'unavailable' ? <Text style={styles.liveRouteText}>도보 실제 경로를 불러오지 못했습니다. 다른 수단의 예상값은 계속 비교할 수 있습니다.</Text> : <Text style={styles.liveRouteText}>TMAP 도보 실제 경로가 비교 목록에 반영됐습니다.</Text>}</View>
      {!showConfirmation ? <Button label={`${choice.title} 변경 내용 확인`} onPress={() => setShowConfirmation(true)} /> : (
        <Card style={styles.confirmation} accessibilityLabel={`${choice.title} 경로 변경 확인`}>
          <View style={styles.confirmationHeader}><View style={{ flex: 1 }}><Text style={type.heading}>경로 변경 전 확인</Text><Text style={type.bodyMuted}>적용을 눌러야 진행 계획과 알림이 변경됩니다.</Text></View><StatusPill label={transportEvidenceLabel(choice.evidence)} tone={choice.evidence.kind === 'actual-route' ? 'success' : 'warning'} /></View>
          <View style={styles.changeRow}><Text style={styles.changeLabel}>현재 경로</Text><Text style={styles.changeBefore}>{route}</Text></View>
          <View style={styles.changeRow}><Text style={styles.changeLabel}>변경 경로</Text><Text style={styles.changeAfter}>{choice.title}</Text></View>
          <View style={styles.changeRow}><Text style={styles.changeLabel}>예상 도착</Text><Text style={styles.changeAfter}>{choice.arrival} · {choice.status}</Text></View>
          <View style={styles.changeRow}><Text style={styles.changeLabel}>시간 · 거리</Text><Text style={styles.changeAfter}>약 {choice.durationMinutes}분 · {choice.distanceLabel}</Text></View>
          <Text style={styles.confirmationNote}>{transportEvidenceDescription(choice.evidence)}. 예상값은 실제 교통 상황에 따라 달라질 수 있습니다.</Text>
          <View style={styles.confirmationActions}><View style={{ flex: 1 }}><Button label="다시 비교" variant="secondary" onPress={() => setShowConfirmation(false)} /></View><View style={{ flex: 1 }}><Button label={applying ? '적용 중…' : '이 경로 적용'} disabled={applying} onPress={() => void confirmRoute()} /></View></View>
        </Card>
      )}
      <Button label="기존 계획 유지" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  bannerTitle: { fontSize: 18, lineHeight: 25, fontWeight: '900', color: c.onInverse }, bannerBody: { ...type.bodyMuted, color: c.onInverseMuted, marginTop: 5 }, filters: { flexDirection: 'row', gap: space.sm }, filter: { flex: 1, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }, filterActive: { backgroundColor: c.deepBlue, borderColor: c.deepBlue }, filterText: { fontSize: 12, color: c.textMuted, fontWeight: '700', textAlign: 'center' }, filterTextActive: { color: c.onInverse }, sortDescription: { ...type.caption, marginTop: -space.md }, option: { gap: space.md }, optionSelected: { borderWidth: 2, borderColor: c.cyan }, pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, optionTop: { flexDirection: 'row', alignItems: 'center', gap: space.md }, optionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted }, optionArrival: { fontSize: 22, color: c.navy, fontWeight: '900' }, optionStatus: { fontSize: 12, color: c.success, fontWeight: '800', marginTop: 2 }, routeMetrics: { flexDirection: 'row', gap: space.sm }, routeMetric: { color: c.deepBlue, fontSize: 14, fontWeight: '900' }, tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' }, tag: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: c.surfaceMuted, color: c.textMuted, fontSize: 11, fontWeight: '700' }, evidence: { ...type.caption }, liveRouteStatus: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.md }, liveRouteText: { ...type.caption, flexShrink: 1, textAlign: 'center' }, confirmation: { gap: space.md, borderWidth: 2, borderColor: c.cyan }, confirmationHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, changeRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border }, changeLabel: { width: 84, color: c.textMuted, fontSize: 13, fontWeight: '700' }, changeBefore: { flex: 1, textAlign: 'right', color: c.textMuted, fontSize: 14, textDecorationLine: 'line-through' }, changeAfter: { flex: 1, textAlign: 'right', color: c.deepBlue, fontSize: 14, fontWeight: '900' }, confirmationNote: { ...type.caption, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceMuted }, confirmationActions: { flexDirection: 'row', gap: space.sm },
  });
};
