import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Button, Card, StatusPill, useAppType } from '@/components/app-ui';
import { radius, space } from '@/constants/design';
import { resolveScheduleDateTime } from '@/lib/confirmed-plans';
import { externalMapLinks, ExternalMapLinks, openExternalMap } from '@/lib/external-maps';
import { createConfiguredMobilityProvider } from '@/lib/mobility-api';
import { SchedulePlan } from '@/lib/planning';
import { ScheduleDraft } from '@/lib/schedule-draft';
import {
  applyArrivalFailure,
  applyArrivalResult,
  ARRIVAL_REUSE_MS,
  ArrivalPollerState,
  arrivalStatusDescription,
  arrivalStatusLabel,
  canAskForArrival,
  createArrivalPollerState,
  DepartureChangeProposal,
  describeArrival,
  isArrivalWindowOpen,
  plannedDepartureAt,
  proposeDepartureFromArrivals,
  shouldAskArrival,
} from '@/lib/transit-arrival';
import { describeTravelEstimate, formatEstimateClock, TravelEstimate, travelEstimateLabel } from '@/lib/travel-estimate';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';

/**
 * Where the journey time came from, what the first bus or subway is doing right now, and the way
 * out to a full map — the three things the plan screen owes the person about the journey. Every
 * state is words: "시간표 기준", "실시간", "최근 저장값", with the time it was checked.
 */
export function TransitEvidence({
  schedule,
  plan,
  estimate,
}: {
  schedule: ScheduleDraft;
  plan: SchedulePlan;
  estimate: TravelEstimate | null;
}) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const boarding = estimate?.firstBoarding ?? null;
  const askable = canAskForArrival(boarding);
  const [state, setState] = useState<ArrivalPollerState>(createArrivalPollerState);
  const [checking, setChecking] = useState(false);
  const [dismissedProposal, setDismissedProposal] = useState<string | null>(null);
  const [mapMessage, setMapMessage] = useState('');
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // The appointment's own instant, and the departure counted back from it — the day before when
  // the plan says to leave at 23:40 for 00:20.
  const appointmentAt = useMemo(() => resolveScheduleDateTime(schedule.date, schedule.appointmentTime), [schedule.appointmentTime, schedule.date]);
  const departureAt = useMemo(() => plannedDepartureAt(appointmentAt, plan.departure, schedule.appointmentTime), [appointmentAt, plan.departure, schedule.appointmentTime]);
  const boardingKey = boarding ? `${boarding.mode}/${boarding.routeName}/${boarding.stop.name}` : '';
  /** The boarding as of the latest render, so an answer for a previous stop is thrown away. */
  const boardingKeyRef = useRef(boardingKey);
  useEffect(() => { boardingKeyRef.current = boardingKey; }, [boardingKey]);

  // A new boarding — another route, another stop — starts from nothing: the last valid arrivals
  // belonged to a stop the person is no longer going to. Reset during render, not in an effect,
  // so no frame shows the old stop's arrivals under the new stop's name.
  const [trackedBoardingKey, setTrackedBoardingKey] = useState(boardingKey);
  if (trackedBoardingKey !== boardingKey) {
    setTrackedBoardingKey(boardingKey);
    setState(createArrivalPollerState());
    setDismissedProposal(null);
  }

  const ask = useCallback(async (force: boolean) => {
    if (!askable || !boarding) return;
    const now = Date.now();
    if (!force && !shouldAskArrival(stateRef.current, now, ARRIVAL_REUSE_MS)) return;
    const askedFor = boardingKey;
    setChecking(true);
    try {
      const result = await createConfiguredMobilityProvider().getTransitArrival({ boarding });
      // An answer for a stop the person no longer boards at is not an answer for this one.
      if (boardingKeyRef.current !== askedFor) return;
      setState((current) => applyArrivalResult(current, result, now));
    } catch {
      if (boardingKeyRef.current !== askedFor) return;
      setState((current) => applyArrivalFailure(current, now));
    } finally {
      if (boardingKeyRef.current === askedFor) setChecking(false);
    }
  }, [askable, boarding, boardingKey]);

  // From thirty minutes before departure the first boarding is checked, and re-checked every
  // twenty seconds while the screen is open and the app is in front — never more often.
  useEffect(() => {
    if (!askable) return;
    const tick = () => {
      if (AppState.currentState !== 'active') return;
      if (!isArrivalWindowOpen({ departureAt, appointmentAt })) return;
      void ask(false);
    };
    tick();
    const timer = setInterval(tick, ARRIVAL_REUSE_MS);
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') tick(); });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [appointmentAt, ask, askable, departureAt]);

  const proposal: DepartureChangeProposal | null = useMemo(() => {
    if (!boarding || !estimate || state.snapshot.status !== 'realtime') return null;
    return proposeDepartureFromArrivals({
      boarding,
      arrivals: state.snapshot.arrivals,
      routeMinutes: estimate.minutes,
      plannedDeparture: plan.departure,
      plannedArrival: plan.arrival,
      appointmentTime: schedule.appointmentTime,
    });
  }, [boarding, estimate, plan.arrival, plan.departure, schedule.appointmentTime, state.snapshot]);
  const proposalKey = proposal ? `${proposal.after.departure}|${proposal.after.arrival}` : null;

  const mapLinks = useMemo(() => schedule.destinationCoordinate
    ? externalMapLinks({
        destination: schedule.destinationCoordinate,
        destinationName: schedule.destination,
        mode: estimate?.mode === '도보' ? 'walk' : estimate?.mode === '자가용' || estimate?.mode === '택시' ? 'car' : 'transit',
      })
    : [], [estimate?.mode, schedule.destination, schedule.destinationCoordinate]);
  const openMap = async (links: ExternalMapLinks) => {
    setMapMessage('');
    const outcome = await openExternalMap(links, (url) => Linking.openURL(url));
    if (outcome === 'failed') setMapMessage('지도를 열지 못했어요. 브라우저에서 다시 시도해 주세요.');
  };

  const windowOpen = isArrivalWindowOpen({ departureAt, appointmentAt });
  const arrivals = state.snapshot.status === 'realtime' || state.snapshot.status === 'last-known' ? state.snapshot.arrivals.slice(0, 2) : [];

  return (
    <Card style={styles.card} accessibilityLabel="이동 시간 근거와 실시간 도착정보">
      <View style={styles.header}>
        <View style={styles.icon}><AppIcon name="location" size={18} iconColor={c.cyan} /></View>
        <View style={{ flex: 1 }}>
          <Text style={type.heading}>이동 시간 근거</Text>
          {estimate ? (
            <>
              <Text style={styles.summary}>{describeTravelEstimate(estimate)}</Text>
              <Text style={type.caption}>
                {travelEstimateLabel(estimate)}
                {estimate.source === 'route' ? ` · ${formatEstimateClock(estimate.calculatedAt)} 계산` : ''}
                {estimate.departureAt ? ` · ${formatEstimateClock(estimate.departureAt)} 출발 기준` : ''}
              </Text>
            </>
          ) : (
            <Text style={type.bodyMuted}>아직 이동 시간을 확인하지 못했어요. 도착 장소를 선택하면 경로를 조회해요.</Text>
          )}
        </View>
      </View>

      {boarding ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>첫 탑승 · {boarding.routeName} · {boarding.stop.name}</Text>
          <View style={styles.statusRow}>
            <StatusPill label={arrivalStatusLabel(state.snapshot)} tone={state.snapshot.status === 'realtime' ? 'success' : state.snapshot.status === 'last-known' ? 'warning' : 'info'} />
          </View>
          {arrivals.map((arrival, index) => (
            <Text key={`${arrival.routeName}-${arrival.expectedAt}-${index}`} style={styles.arrival}>{describeArrival(arrival)}</Text>
          ))}
          <Text style={type.caption}>{arrivalStatusDescription(state.snapshot, boarding)}</Text>
          {proposal && proposalKey !== dismissedProposal ? (
            <View style={styles.proposal} accessibilityRole="alert">
              <Text style={styles.proposalTitle}>{proposal.reason}</Text>
              <Text style={type.bodyMuted}>출발 {proposal.before.departure} 그대로 · 도착 {proposal.before.arrival} → {proposal.after.arrival}</Text>
              <Text style={type.caption}>적용하기 전에는 계획과 알림이 바뀌지 않아요. 더 빠른 이동수단은 플랜 B에서 고를 수 있어요.</Text>
              <Button label="플랜 B에서 대안 보기" onPress={() => router.push('/plan-b')} />
              <Button label="이대로 유지" variant="secondary" onPress={() => setDismissedProposal(proposalKey)} />
            </View>
          ) : null}
          {askable && windowOpen ? (
            <Button label={checking ? '확인 중…' : '다시 확인'} variant="secondary" disabled={checking} onPress={() => void ask(true)} accessibilityHint="첫 탑승편의 실시간 도착정보를 다시 확인합니다" />
          ) : null}
        </View>
      ) : null}

      {mapLinks.length ? (
        <View style={styles.section}>
          <Text style={type.caption}>전체 경로는 외부 지도에서 확인할 수 있어요.</Text>
          {mapLinks.map((links) => (
            <Button key={links.app} label={links.label} variant="secondary" onPress={() => void openMap(links)} />
          ))}
          {mapMessage ? <Text accessibilityRole="alert" style={styles.error}>{mapMessage}</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  card: { gap: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.infoSoft },
  summary: { color: c.navy, fontSize: 16, lineHeight: 23, fontWeight: '800', marginTop: 2 },
  section: { gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border },
  sectionTitle: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  arrival: { color: c.deepBlue, fontSize: 18, lineHeight: 25, fontWeight: '900' },
  proposal: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.warningSoft, borderWidth: 1, borderColor: c.warning },
  proposalTitle: { color: c.navy, fontSize: 15, lineHeight: 22, fontWeight: '800' },
  error: { color: c.danger, fontSize: 13 },
});
