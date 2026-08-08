import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon, IconButton } from '@/components/app-icon';
import { Button, Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { JourneyMap } from '@/components/journey-map';
import { color, radius, space } from '@/constants/design';
import { ExpoLocationProvider, LocationPermissionDeniedError } from '@/lib/device-location-provider';
import {
  createFallbackWalkingRoute,
  createJourneyState,
  formatJourneyDistance,
  getNextAppointmentAt,
  JourneyState,
  markJourneyUnavailable,
  refreshJourneyLocation,
} from '@/lib/journey';
import { fixtureLocation, fixtureRoutePlan } from '@/lib/journey-fixtures';
import { ScreenReaderState, shouldAutoSpeakJourney } from '@/lib/accessibility-voice';
import { createConfiguredMobilityProvider, MobilityApiError } from '@/lib/mobility-api';
import { ExpoVoiceGuide } from '@/lib/expo-voice-guide';
import { getScreenReaderState, subscribeScreenReaderState } from '@/lib/screen-reader-state';
import {
  BackgroundJourneyStatus,
  getBackgroundJourneyStatus,
  startBackgroundJourney,
  stopBackgroundJourney,
} from '@/lib/background-journey-service';
import { useSchedule } from '@/state/schedule-context';

export default function JourneyScreen() {
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{ e2eScreenReader?: string; e2eState?: string }>();
  const forcePermissionDenied = __DEV__ && params.e2eState === 'permission-denied';
  const forceScreenReader = __DEV__ && params.e2eScreenReader === '1';
  const { activeSchedule, draft } = useSchedule();
  const schedule = activeSchedule ?? draft;
  const appointmentAt = useMemo(
    () => getNextAppointmentAt(schedule.appointmentTime),
    [schedule.appointmentTime],
  );
  const [journey, setJourney] = useState<JourneyState>(() => {
    const location = { ...fixtureLocation, capturedAt: Date.now() };
    const initial = createJourneyState({
      route: forcePermissionDenied
        ? createFallbackWalkingRoute({ origin: location.coordinate, destination: fixtureRoutePlan.destination })
        : fixtureRoutePlan,
      location,
      appointmentAt,
    });
    return forcePermissionDenied ? markJourneyUnavailable(initial, 'permission-denied') : initial;
  });
  const [loading, setLoading] = useState(!forcePermissionDenied);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [screenReaderState, setScreenReaderState] = useState<ScreenReaderState>('checking');
  const [backgroundStatus, setBackgroundStatus] = useState<BackgroundJourneyStatus>({ state: 'inactive', updatedAt: null, voiceDelivery: null });
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const requestGeneration = useRef(0);
  const backgroundRequesting = useRef(false);
  const journeyRef = useRef(journey);
  const spokenManeuverId = useRef<string | null>(null);
  const voiceGuide = useMemo(() => new ExpoVoiceGuide(), []);
  const effectiveScreenReaderState: ScreenReaderState = forceScreenReader ? 'enabled' : screenReaderState;
  const screenReaderActive = effectiveScreenReaderState !== 'disabled';

  useEffect(() => {
    journeyRef.current = journey;
  }, [journey]);

  useEffect(() => {
    let active = true;
    const applyState = (state: ScreenReaderState) => {
      if (!active) return;
      setScreenReaderState(state);
      if (state !== 'disabled') void voiceGuide.stop();
    };
    const refreshState = () => void getScreenReaderState().then(applyState);
    void voiceGuide.stop();
    refreshState();
    const subscription = subscribeScreenReaderState(applyState);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshState();
    });
    return () => {
      active = false;
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [voiceGuide]);

  const refreshJourney = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    const locationProvider = new ExpoLocationProvider();
    const mobility = createConfiguredMobilityProvider();
    let currentLocation = journeyRef.current.location;

    try {
      if (forcePermissionDenied) throw new LocationPermissionDeniedError('E2E permission-denied fixture');
      currentLocation = await locationProvider.getCurrentLocation();
      let destination = schedule.destinationCoordinate;
      if (!destination) {
        const places = await mobility.geocode(schedule.destinationAddress || schedule.destination);
        destination = places[0]?.coordinate ?? null;
      }
      if (!destination) throw new Error('목적지 좌표를 찾지 못했습니다.');

      const route = await mobility.getWalkingRoute({
        origin: currentLocation.coordinate,
        destination,
        startName: '현재 위치',
        endName: schedule.destination,
      });
      if (generation !== requestGeneration.current) return;
      setJourney(createJourneyState({ route, location: currentLocation, appointmentAt }));
    } catch (error) {
      if (generation !== requestGeneration.current) return;
      const permissionDenied = error instanceof LocationPermissionDeniedError;
      const destination = schedule.destinationCoordinate ?? journeyRef.current.route.destination;
      const fallbackRoute = createFallbackWalkingRoute({
        origin: currentLocation.coordinate,
        destination,
      });
      const fallback = createJourneyState({
        route: fallbackRoute,
        location: currentLocation,
        appointmentAt,
      });
      const reason = permissionDenied
        ? 'permission-denied'
        : error instanceof MobilityApiError && error.code === 'NETWORK_UNAVAILABLE'
          ? 'offline'
          : 'error';
      setJourney(markJourneyUnavailable(fallback, reason));
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [appointmentAt, forcePermissionDenied, schedule.destination, schedule.destinationAddress, schedule.destinationCoordinate]);

  useEffect(() => {
    const kickoff = setTimeout(() => void refreshJourney(), 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshJourney();
        if (!backgroundRequesting.current) void getBackgroundJourneyStatus().then(setBackgroundStatus);
      }
    });
    return () => {
      clearTimeout(kickoff);
      requestGeneration.current += 1;
      subscription.remove();
    };
  }, [refreshJourney]);

  useEffect(() => {
    void getBackgroundJourneyStatus().then(setBackgroundStatus);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      void new ExpoLocationProvider().getCurrentLocation()
        .then((location) => setJourney((current) => refreshJourneyLocation(current, location)))
        .catch(() => undefined);
    }, 15_000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    const maneuver = journey.nextManeuver;
    if (!shouldAutoSpeakJourney({
      voiceEnabled,
      screenReaderState: effectiveScreenReaderState,
      hasTmapRoute: journey.route.provider === 'tmap',
      hasManeuver: Boolean(maneuver),
    }) || !maneuver) return;
    if (spokenManeuverId.current === maneuver.id) return;
    spokenManeuverId.current = maneuver.id;
    void voiceGuide.speak(maneuver, journey);
  }, [effectiveScreenReaderState, journey, voiceEnabled, voiceGuide]);

  useEffect(() => () => {
    void voiceGuide.stop();
  }, [voiceGuide]);

  const toggleVoice = () => {
    if (screenReaderActive) return;
    if (voiceEnabled) void voiceGuide.stop();
    else spokenManeuverId.current = null;
    setVoiceEnabled(!voiceEnabled);
  };

  const toggleBackgroundJourney = async () => {
    backgroundRequesting.current = true;
    setBackgroundLoading(true);
    try {
      const next = backgroundStatus.state === 'enabled'
        ? await stopBackgroundJourney()
        : await startBackgroundJourney({ journey, destinationName: schedule.destination });
      setBackgroundStatus(next);
    } finally {
      backgroundRequesting.current = false;
      setBackgroundLoading(false);
    }
  };

  const confirmArrival = async () => {
    if (backgroundStatus.state === 'enabled') await stopBackgroundJourney();
    router.replace('/progress');
  };

  const isFallback = journey.route.provider !== 'tmap';
  const scheduleLead = Math.floor(journey.scheduleStatus.seconds / 60);
  const statusTone = journey.status === 'ready' ? 'success' : journey.status === 'stale' ? 'warning' : 'danger';
  const largeText = fontScale >= 1.6;

  return (
    <Screen>
      <Header title={schedule.destination} eyebrow="이동 중" right={<IconButton name="close" label="이동 안내 최소화" variant="plain" onPress={() => router.back()} />} />
      <Card dark style={styles.statusCard}>
        <View style={styles.statusHeader}><StatusPill label={isFallback ? '도보 · 임시 경로' : '도보 · TMAP 경로'} tone={isFallback ? 'warning' : 'success'} /><Pressable accessibilityRole="button" accessibilityState={{ disabled: screenReaderActive }} accessibilityLabel={effectiveScreenReaderState === 'checking' ? '화면 읽기 상태 확인 중, 앱 음성 자동 재생 대기' : screenReaderActive ? '화면 읽기 사용 중, 앱 음성 자동 재생 중지됨' : voiceEnabled ? '음성 안내 끄기' : '음성 안내 켜기'} disabled={screenReaderActive} onPress={toggleVoice} style={({ pressed }) => [styles.voiceStatus, pressed && styles.voicePressed]}>{loading ? <ActivityIndicator size="small" color={color.cyan} /> : <AppIcon name={screenReaderActive || !voiceEnabled ? 'mute' : 'voice'} size={16} iconColor={color.cyan} />}<Text style={styles.voiceText}>{loading ? '경로 확인 중' : effectiveScreenReaderState === 'checking' ? '화면 읽기 확인' : screenReaderActive ? '화면 읽기 사용' : voiceEnabled ? '음성 켜짐' : '음성 꺼짐'}</Text></Pressable></View>
        <View style={[styles.metrics, largeText && styles.metricsLarge]}>
          <Metric label="도착까지" value={`${Math.ceil(journey.remainingDurationSeconds / 60)}분`} large={largeText} />
          <Metric label="약속까지" value={`${Math.ceil(journey.appointmentRemainingSeconds / 60)}분`} large={largeText} />
          <Metric label="남은 거리" value={formatJourneyDistance(journey.remainingDistanceMeters)} large={largeText} />
        </View>
        <Text style={styles.buffer}>{journey.scheduleStatus.kind === 'buffer' ? `${scheduleLead}분 여유` : `${scheduleLead}분 지각 예상`} · 현재 경로 기준</Text>
      </Card>

      {journey.status !== 'ready' ? <Card style={styles.fallbackCard}><StatusPill label="연결 상태" tone={statusTone} /><Text style={type.body}>{journey.message}</Text><Button label={loading ? '다시 확인 중…' : '위치·경로 다시 확인'} variant="secondary" disabled={loading} onPress={() => void refreshJourney()} /></Card> : null}

      <JourneyMap route={journey.route} location={journey.location} destinationName={schedule.destination} />

      <Card style={styles.nextCard}>
        <View style={styles.nextIcon}><AppIcon name="walk" size={24} /></View>
        <View style={{ flex: 1 }}><Text style={styles.nextLabel}>다음 행동</Text><Text accessibilityLiveRegion="polite" style={type.heading}>{journey.nextManeuver?.instruction ?? '목적지 방향으로 이동하세요.'}</Text><Text style={styles.updated}>{journey.message}</Text></View>
      </Card>
      <Card style={styles.backgroundCard}>
        <View style={styles.backgroundHeader}><View style={styles.backgroundIcon}><AppIcon name="navigation" size={22} /></View><View style={{ flex: 1 }}><Text style={type.heading}>화면이 꺼져도 이동 안내</Text><Text style={type.bodyMuted}>사용자가 켠 동안만 25m 또는 15초 간격으로 위치를 확인하고, 새 안내 지점에서 음성을 재생합니다.</Text></View><StatusPill label={backgroundStatusLabel(backgroundStatus)} tone={backgroundStatusTone(backgroundStatus)} /></View>
        <Text accessibilityLiveRegion="polite" style={styles.backgroundDetail}>{backgroundStatusDescription(backgroundStatus)}</Text>
        {backgroundStatus.state === 'permission-required' ? <Button label="기기 설정에서 항상 위치 허용" variant="secondary" onPress={() => void Linking.openSettings()} /> : null}
        <Button
          label={backgroundLoading ? '확인 중…' : backgroundStatus.state === 'enabled' ? '화면 꺼짐 안내 끄기' : '화면 꺼짐 안내 켜기'}
          variant={backgroundStatus.state === 'enabled' ? 'secondary' : 'primary'}
          disabled={backgroundLoading || loading || isFallback || backgroundStatus.state === 'unsupported'}
          onPress={() => void toggleBackgroundJourney()}
          accessibilityHint="운영체제의 항상 위치 허용이 필요하며 언제든 이 화면에서 중지할 수 있습니다"
        />
        <Text style={styles.privacy}>TimeAgent는 사용자가 이 기능을 켠 동안 화면이 꺼지거나 앱을 사용하지 않는 백그라운드에서도 위치를 25m 또는 15초 간격으로 확인해 다음 행동과 도착 시간을 갱신합니다. 백그라운드 위치 기록은 이 기기의 진행 세션에만 저장하고 안내를 끄거나 도착하면 삭제하며 광고에 사용하거나 판매하지 않습니다. 음성 안내가 실패하면 같은 내용을 알림으로 전달합니다.</Text>
      </Card>
      <Button label="목적지 도착 확인" onPress={() => void confirmArrival()} />
      <Text style={styles.disclaimer}>현위치는 기기 위치 권한으로, 도보 경로·시간·거리는 TMAP 연동으로 갱신됩니다. 통신 실패 시 마지막 위치와 직선 임시 경로를 유지합니다.</Text>
    </Screen>
  );
}

function Metric({ label, value, large }: { label: string; value: string; large: boolean }) {
  return <View style={[styles.metric, large && styles.metricLarge]}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={[styles.metricValue, large && styles.metricValueLarge]}>{value}</Text></View>;
}

function backgroundStatusLabel(status: BackgroundJourneyStatus) {
  if (status.state === 'enabled') return '켜짐';
  if (status.state === 'permission-required') return '항상 허용 필요';
  if (status.state === 'unsupported') return '지원 안 함';
  if (status.state === 'error') return '확인 필요';
  return '꺼짐';
}

function backgroundStatusTone(status: BackgroundJourneyStatus) {
  if (status.state === 'enabled') return 'success' as const;
  if (status.state === 'inactive') return 'info' as const;
  return 'warning' as const;
}

function backgroundStatusDescription(status: BackgroundJourneyStatus) {
  if (status.state === 'enabled') {
    const updated = status.updatedAt ? new Date(status.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '대기 중';
    const delivery = status.voiceDelivery === 'spoken' ? '마지막 안내 음성 전달됨'
      : status.voiceDelivery === 'notification-fallback' ? '마지막 안내는 알림으로 대체됨'
        : status.voiceDelivery === 'failed' ? '마지막 안내 전달 실패'
          : '첫 위치 갱신 대기 중';
    return `마지막 위치 갱신 ${updated} · ${delivery}`;
  }
  if (status.state === 'permission-required') return '운영체제 설정에서 위치 권한을 항상 허용한 뒤 다시 켜 주세요.';
  if (status.state === 'unsupported') return '현재 실행 환경에서는 백그라운드 위치 작업을 지원하지 않습니다.';
  if (status.state === 'error') return '백그라운드 안내를 시작하지 못했습니다. TMAP 경로와 권한을 확인해 주세요.';
  return '필요할 때 직접 켜며 앱을 닫거나 화면을 꺼도 상단 알림에서 사용 중임을 확인할 수 있습니다.';
}

const styles = StyleSheet.create({
  statusCard: { gap: space.lg },
  statusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  voiceStatus: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceText: { color: color.ice, fontSize: 13, fontWeight: '800' },
  voicePressed: { opacity: 0.65 },
  metrics: { flexDirection: 'row', gap: space.sm },
  metricsLarge: { flexDirection: 'column', gap: space.md },
  metric: { flex: 1 },
  metricLarge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  metricLabel: { color: color.ice, fontSize: 12, lineHeight: 18 },
  metricValue: { color: color.surface, fontSize: 22, lineHeight: 29, fontWeight: '900' },
  metricValueLarge: { flexShrink: 0, textAlign: 'right' },
  buffer: { color: color.cyan, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  nextCard: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  nextIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ice },
  nextLabel: { color: color.deepBlue, fontSize: 13, lineHeight: 18, fontWeight: '800', marginBottom: 3 },
  updated: { color: color.textMuted, fontSize: 13, lineHeight: 19, marginTop: space.sm },
  backgroundCard: { gap: space.md },
  backgroundHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  backgroundIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ice },
  backgroundDetail: { ...type.caption, color: color.deepBlue, fontWeight: '700' },
  privacy: { ...type.caption, padding: space.md, borderRadius: radius.md, backgroundColor: color.surfaceMuted },
  fallbackCard: { gap: space.md },
  disclaimer: { padding: space.md, borderRadius: radius.md, color: color.textMuted, backgroundColor: color.surfaceMuted, fontSize: 13, lineHeight: 19 },
});
