import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { PropsWithChildren, useCallback, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Header, Screen, appType, useAppType } from '@/components/app-ui';
import { AppIcon, AppIconName } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import {
  AnalyticsSummary,
  clearAnalyticsStore,
  createEmptyAnalyticsStore,
  formatDurationSeconds,
  loadAnalyticsStore,
  summarizeAnalytics,
} from '@/lib/analytics';
import {
  AppSettings,
  AppColorMode,
  CoachTone,
  createDefaultAppSettings,
  loadAppSettings,
  PreferredTransport,
  RoutinePreset,
  saveAppSettings,
} from '@/lib/app-settings';
import { getDevicePermissionSnapshot } from '@/lib/device-permissions';
import {
  PlusInterestState,
  PlusOfferEligibility,
  createEmptyPlusInterestState,
  getPlusOfferEligibility,
  loadPlusInterest,
  plusPlanLabel,
} from '@/lib/monetization';
import { createConfiguredMobilityProvider } from '@/lib/mobility-api';
import { PermissionState, permissionStatusLabel } from '@/lib/permission-state';
import { PreparationGender, preparationGenderLabel, routinePresetSummary } from '@/lib/preparation-profile';
import { useAuth } from '@/state/auth-context';
import { useSchedule } from '@/state/schedule-context';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';

type DetailKey = 'location' | 'transport' | 'buffer' | 'routine' | 'tone' | 'gender' | 'metrics';

const transports: PreferredTransport[] = ['도보', '버스', '지하철', '자가용', '택시'];
const bufferOptions: AppSettings['bufferMinutes'][] = [3, 5, 10];
const routineOptions: RoutinePreset[] = ['기본 외출 준비', '빠른 준비', '여유있는 준비'];
const toneOptions: CoachTone[] = ['친근하게', '간결하게', '단호하게'];
const preparationGenderOptions: PreparationGender[] = ['unspecified', 'female', 'male'];
const emptyPlusEligibility: PlusOfferEligibility = { eligible: false, completedSchedules: 0, remainingSchedules: 3 };

// What account deletion actually clears, kept in step with `deleteAccount()` in
// `@/state/auth-context` and with the same wording as the web `/delete-account` page.
const ACCOUNT_DELETION_REMOVED = [
  'Google 계정 연결(앱 접근 권한)',
  '이 기기의 일정과 준비 계획',
  '이동 진행 기록과 위치 세션',
  '실제 시간 학습과 앱 설정',
  '서버에 저장된 최근 장소',
];
const ACCOUNT_DELETION_KEPT = [
  'Google 계정 자체',
  '기기·Google 캘린더의 원본 일정',
];

export default function SettingsScreen() {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  const { setMode } = useAppTheme();
  const { deleteAccount, error: authError, signOut, status: authStatus, user } = useAuth();
  const { personalizationProfile, personalizationStatus, resetPersonalization, setPersonalizationEnabled } = useSchedule();
  const [settings, setSettings] = useState(createDefaultAppSettings);
  const settingsRef = useRef(settings);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [expanded, setExpanded] = useState<DetailKey | null>(null);
  const [locationInput, setLocationInput] = useState(settings.defaultLocation);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationPermission, setLocationPermission] = useState<PermissionState>('loading');
  const [notificationPermission, setNotificationPermission] = useState<PermissionState>('loading');
  const [showLearningReset, setShowLearningReset] = useState(false);
  const [showAnalyticsReset, setShowAnalyticsReset] = useState(false);
  const [showAccountDeletion, setShowAccountDeletion] = useState(false);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary>(() => summarizeAnalytics(createEmptyAnalyticsStore()));
  const [plusEligibility, setPlusEligibility] = useState(emptyPlusEligibility);
  const [plusInterest, setPlusInterest] = useState<PlusInterestState>(createEmptyPlusInterestState);
  // Only preparation steps are learned; journeys come from live routes and are not listed here.
  const learnedStats = personalizationProfile.routines;
  const learnedSamples = learnedStats.reduce((total, item) => total + item.sampleCount, 0);

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([loadAppSettings(AsyncStorage), getDevicePermissionSnapshot(), loadAnalyticsStore(AsyncStorage), loadPlusInterest(AsyncStorage)])
      .then(([saved, permissions, analytics, savedPlusInterest]) => {
        if (!active) return;
        settingsRef.current = saved;
        setSettings(saved);
        setLocationInput(saved.defaultLocation);
        setLocationPermission(permissions.location);
        setNotificationPermission(permissions.notifications);
        setAnalyticsSummary(summarizeAnalytics(analytics));
        setPlusEligibility(getPlusOfferEligibility(analytics));
        setPlusInterest(savedPlusInterest);
        setStatus('saved');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
        setLocationPermission('error');
        setNotificationPermission('error');
      });
    return () => {
      active = false;
    };
  }, []));

  const update = useCallback((values: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...values };
    settingsRef.current = next;
    setSettings(next);
    setStatus('saving');
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => saveAppSettings(AsyncStorage, next));
    saveQueue.current
      .then(() => setStatus('saved'))
      .catch(() => setStatus('error'));
  }, []);

  const toggleDetail = (key: DetailKey) => {
    setExpanded((current) => current === key ? null : key);
  };

  const saveLocation = () => {
    const value = locationInput.trim();
    if (!value) return;
    update({ defaultLocation: value });
    setExpanded(null);
  };

  const routineSummary = routinePresetSummary(settings.preparationGender, settings.routinePreset);

  /** Fills the departure field from the device's GPS fix so nothing has to be typed. */
  const fillCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('위치 권한을 허용해야 현재 위치를 사용할 수 있어요.');
        return;
      }
      const position = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 })
        ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!position) {
        setLocationError('현재 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      let label = `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
      try {
        const provider = createConfiguredMobilityProvider();
        const place = await provider.reverseGeocode(coordinate);
        const address = place.roadAddress || place.jibunAddress;
        if (address) label = address;
      } catch { /* the raw coordinate is still a usable departure point */ }
      setLocationInput(label);
      update({ defaultLocation: label });
    } catch {
      setLocationError('현재 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="설정" eyebrow="내 생활에 맞게 TimeAgent를 조정하세요" />

        {/* Two modes behind a row that opened a list to choose between them: three taps to change
            a thing you can see change. The switch is the setting — and it stands alone, because a
            card drawn around one pill was a box around a box. */}
        <View style={styles.modeSection}>
          <Text style={styles.section}>화면 모드</Text>
          <ColorModeSwitch
            mode={settings.colorMode}
            onChange={(colorMode) => { update({ colorMode }); setMode(colorMode); }}
          />
        </View>

        <Section label="로그인 계정">
          <View style={styles.accountRow}>
            {user?.photo ? <Image accessibilityLabel={`${user.name} 프로필 사진`} source={{ uri: user.photo }} style={styles.profile} /> : <View accessibilityLabel="Google 계정 프로필" style={styles.profileFallback}><Text style={styles.profileInitial}>{user?.name.slice(0, 1) ?? 'G'}</Text></View>}
            <View style={{ flex: 1 }}><Text style={styles.accountName}>{user?.name}</Text><Text style={type.caption}>{user?.email}</Text></View>
          </View>
          <View style={styles.accountAction}>
            <Button label={authStatus === 'signingOut' ? '로그아웃 중…' : 'Google 계정 로그아웃'} variant="secondary" disabled={authStatus === 'signingOut'} onPress={() => void signOut()} />
            {!showAccountDeletion ? (
              <>
                <Button label="계정 삭제" variant="dangerGhost" disabled={authStatus === 'deleting'} onPress={() => setShowAccountDeletion(true)} />
                <Text style={type.caption}>로그아웃은 이 기기의 일정과 기록을 그대로 둡니다. 앱 연결까지 끊고 데이터를 모두 지우려면 이 항목을 사용하세요.</Text>
              </>
            ) : (
              <View style={styles.resetPanel} accessibilityRole="alert">
                <Text style={type.body}>TimeAgent와 Google 계정 연결을 해제하고 저장된 데이터를 모두 삭제할까요?</Text>
                <Text style={styles.deletionLabel}>삭제되는 항목</Text>
                {ACCOUNT_DELETION_REMOVED.map((item) => <Text key={item} style={styles.deletionItem}>· {item}</Text>)}
                <Text style={styles.deletionLabel}>삭제되지 않는 항목</Text>
                {ACCOUNT_DELETION_KEPT.map((item) => <Text key={item} style={styles.deletionItem}>· {item}</Text>)}
                <Text style={type.caption}>삭제 후에는 복구할 수 없습니다.</Text>
                <View style={styles.resetActions}>
                  <View style={{ flex: 1 }}><Button label="취소" variant="secondary" onPress={() => setShowAccountDeletion(false)} /></View>
                  <View style={{ flex: 1 }}><Button label={authStatus === 'deleting' ? '삭제 중…' : '연결 및 데이터 삭제'} variant="danger" disabled={authStatus === 'deleting'} onPress={() => void deleteAccount()} /></View>
                </View>
              </View>
            )}
            {authError ? <Text accessibilityRole="alert" style={styles.error}>{authError}</Text> : null}
          </View>
        </Section>

        <Section label="기본 설정">
          <Setting icon="location" title="기본 출발 위치" detail={settings.defaultLocation} expanded={expanded === 'location'} onPress={() => toggleDetail('location')} />
          {expanded === 'location' ? (
            <DetailPanel>
              <View style={styles.locationRow}>
                <TextInput
                  accessibilityLabel="기본 출발 위치 입력"
                  value={locationInput}
                  onChangeText={(value) => { setLocationInput(value); setLocationError(''); }}
                  placeholder="동네 또는 주소를 입력하세요"
                  style={[styles.input, styles.locationInput]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="현재 GPS 위치를 출발 위치로 사용"
                  disabled={locating}
                  onPress={() => void fillCurrentLocation()}
                  style={({ pressed }) => [styles.gpsButton, pressed && styles.pressed, locating && styles.gpsButtonBusy]}
                >
                  <AppIcon name="navigation" size={20} iconColor={styles.gpsIconColor.color} />
                </Pressable>
              </View>
              {locating ? <Text accessibilityLiveRegion="polite" style={type.caption}>현재 위치를 확인하고 있어요…</Text> : null}
              {locationError ? <Text accessibilityRole="alert" style={[type.caption, styles.error]}>{locationError}</Text> : null}
              <Button label="출발 위치 저장" onPress={saveLocation} disabled={!locationInput.trim()} />
            </DetailPanel>
          ) : null}

          <Setting icon="subway" title="선호 이동수단" detail={settings.preferredTransport} expanded={expanded === 'transport'} onPress={() => toggleDetail('transport')} />
          {expanded === 'transport' ? <ChoicePanel compact options={transports} selected={settings.preferredTransport} onSelect={(preferredTransport) => update({ preferredTransport })} /> : null}

          <Setting icon="time" title="기본 여유 시간" detail={`${settings.bufferMinutes}분`} expanded={expanded === 'buffer'} onPress={() => toggleDetail('buffer')} />
          {expanded === 'buffer' ? <ChoicePanel options={bufferOptions} selected={settings.bufferMinutes} label={(value) => `${value}분`} onSelect={(bufferMinutes) => update({ bufferMinutes })} /> : null}
        </Section>

        <Section label="준비 루틴">
          <Setting icon="routine" title="성별에 따른 기본 준비 항목" detail={preparationGenderLabel(settings.preparationGender)} expanded={expanded === 'gender'} onPress={() => toggleDetail('gender')} />
          {expanded === 'gender' ? <ChoicePanel description="성별 선택은 필수가 아니며 새 일정의 시작 목록에만 적용돼요. 추천 항목과 시간은 일정마다 자유롭게 바꿀 수 있어요." options={preparationGenderOptions} selected={settings.preparationGender} label={(value) => value === 'female' ? '여성' : value === 'male' ? '남성' : '선택 안 함'} onSelect={(preparationGender) => update({ preparationGender })} /> : null}
          {/* The chosen preset and what it means read as one line: a second row naming it again said
              nothing the row above had not already said. */}
          <Setting icon={routineSummary.icon} title="사용할 준비 루틴" detail={`${settings.routinePreset} · ${routineSummary.totalMinutes}분 · ${routineSummary.description}`} expanded={expanded === 'routine'} onPress={() => toggleDetail('routine')} />
          {expanded === 'routine' ? <ChoicePanel compact options={routineOptions} selected={settings.routinePreset} onSelect={(routinePreset) => update({ routinePreset })} /> : null}
        </Section>

        <Section label="실제 시간 학습">
          <Setting icon="time" title="다음 계획에 실제 시간 반영" detail={personalizationProfile.enabled ? `사용 중 · 실제 기록 ${learnedSamples}개` : '사용 안 함 · 기본 입력 시간 사용'} toggle={personalizationProfile.enabled} onToggle={(enabled) => void setPersonalizationEnabled(enabled)} />
          {learnedStats.length > 0 ? <DetailPanel>{learnedStats.slice(0, 5).map((stat) => <View key={stat.key} style={styles.learningRow}><View style={{ flex: 1 }}><Text style={styles.learningLabel}>{stat.label}</Text><Text style={type.caption}>최근 실제 {stat.lastActualMinutes}분 · 기록 {stat.sampleCount}회</Text></View><Text style={styles.learningAverage}>평균 {stat.averageMinutes}분</Text></View>)}{!showLearningReset ? <Button label="학습 기록 초기화" variant="secondary" onPress={() => setShowLearningReset(true)} /> : <View style={styles.resetPanel}><Text style={type.body}>누적 실제 기록 {learnedSamples}개를 이 기기에서 삭제할까요?</Text><Text style={type.caption}>삭제 후에는 복구할 수 없으며 다음 계획부터 기본 입력 시간을 사용합니다.</Text><View style={styles.resetActions}><View style={{ flex: 1 }}><Button label="취소" variant="secondary" onPress={() => setShowLearningReset(false)} /></View><View style={{ flex: 1 }}><Button label="기록 모두 삭제" onPress={() => { setShowLearningReset(false); void resetPersonalization(); }} /></View></View></View>}</DetailPanel> : <Text style={styles.emptyLearning}>완료한 일정의 실제 소요 시간이 쌓이면 항목별 평균을 보여드려요.</Text>}
          <Text accessibilityLiveRegion="polite" style={[styles.learningStatus, personalizationStatus === 'error' && styles.error]}>{personalizationStatus === 'loading' ? '학습 기록을 불러오는 중입니다' : personalizationStatus === 'saving' ? '학습 설정을 저장하는 중입니다' : personalizationStatus === 'error' ? '학습 설정을 저장하지 못했습니다' : '학습 설정이 저장됐습니다'}</Text>
        </Section>

        <Section label="TimeAgent Plus · 사전 수요 검증">
          <Setting
            icon="ai"
            title="Plus 미리보기"
            detail={plusInterest.status === 'interested'
              ? `관심 등록 · ${plusPlanLabel(plusInterest.plan)}`
              : plusEligibility.eligible
                ? '사전등록 가능 · 결제 없음'
                : `일정 ${plusEligibility.remainingSchedules}회 더 완료하면 사전등록 가능`}
            onPress={() => router.push('/plus')}
          />
          <Text style={styles.plusNote}>출시 후보 기능과 가격안에 대한 관심만 이 기기에 저장합니다. 현재 기능은 제한되지 않아요.</Text>
        </Section>

        <Section label="MVP 지표 · 이 기기">
          {/* Nine rows of counters opened every time someone came to change a setting. They are worth
              keeping and not worth meeting unasked, so the section states what it measures and opens
              on a tap. */}
          <Setting icon="chart" title="제품 경험 측정" detail="일정 내용이나 위치는 보내지 않고 이 기기에 이벤트 수치만 저장합니다." expanded={expanded === 'metrics'} onPress={() => toggleDetail('metrics')} />
          {expanded === 'metrics' ? <>
          <MetricRow label="첫 일정 생성 완료율" value={formatRate(analyticsSummary.scheduleCompletionRate)} detail={`${analyticsSummary.scheduleCompletions}/${analyticsSummary.scheduleStarts}회 완료`} />
          <MetricRow label="평균 일정 생성 시간" value={analyticsSummary.averageScheduleCreationSeconds === null ? '측정 대기' : formatDurationSeconds(analyticsSummary.averageScheduleCreationSeconds)} detail="등록 시작부터 AI 계획 생성까지" />
          <MetricRow label="알림에서 준비 진입" value={formatRate(analyticsSummary.notificationStartRate)} detail={`알림 응답 ${analyticsSummary.notificationOpens}회`} />
          <MetricRow label="지연안 적용 / 거절" value={`${formatRate(analyticsSummary.delayApplyRate)} / ${formatRate(analyticsSummary.delayRejectRate)}`} detail={`지연 제안 ${analyticsSummary.delayProposals}회`} />
          <MetricRow label="평균 단계 시간 오차" value={analyticsSummary.averageStepErrorMinutes === null ? '측정 대기' : `${analyticsSummary.averageStepErrorMinutes}분`} detail="계획과 실제 소요 시간의 절대 차이" />
          <MetricRow label="정시 도착률" value={formatRate(analyticsSummary.onTimeArrivalRate)} detail={`누적 이벤트 ${analyticsSummary.eventCount}개`} />
          <MetricRow label="Plus 관심 / 철회" value={`${analyticsSummary.plusInterestSelections} / ${analyticsSummary.plusInterestWithdrawals}`} detail={`Plus 화면 확인 ${analyticsSummary.plusOfferViews}회`} />
          <View style={styles.resetArea}>
            {!showAnalyticsReset ? <Button label="측정 데이터 초기화" variant="secondary" onPress={() => setShowAnalyticsReset(true)} /> : <View style={styles.resetPanel}><Text style={type.body}>이 기기의 MVP 측정 데이터를 삭제할까요?</Text><Text style={type.caption}>학습 기록과 일정은 유지되며 측정 지표만 초기화됩니다.</Text><View style={styles.resetActions}><View style={{ flex: 1 }}><Button label="취소" variant="secondary" onPress={() => setShowAnalyticsReset(false)} /></View><View style={{ flex: 1 }}><Button label="지표 삭제" onPress={() => { setShowAnalyticsReset(false); void clearAnalyticsStore(AsyncStorage).then(() => setAnalyticsSummary(summarizeAnalytics(createEmptyAnalyticsStore()))); }} /></View></View></View>}
          </View>
          </> : null}
        </Section>

        <Section label="AI 코치">
          <Setting icon="coach" title="코치 말투" detail={settings.coachTone} expanded={expanded === 'tone'} onPress={() => toggleDetail('tone')} />
          {expanded === 'tone' ? <ChoicePanel options={toneOptions} selected={settings.coachTone} onSelect={(coachTone) => update({ coachTone })} /> : null}
          <Setting icon="voice" title="음성으로 일정 제어" detail="등록 · 수정 · 확인" toggle={settings.voiceControl} onToggle={(voiceControl) => update({ voiceControl })} />
          <Setting icon="coach" title="준비 단계 음성 코치" detail={settings.stepCoaching ? '단계마다 알림과 음성으로 챙겨줘요' : '단계 시작 알림과 음성을 끔'} toggle={settings.stepCoaching} onToggle={(stepCoaching) => update({ stepCoaching })} />
        </Section>

        <Section label="알림 및 권한">
          <Setting icon="alert" title="준비·출발 알림" detail={`${permissionStatusLabel(notificationPermission)} · ${settings.notifications ? '앱 알림 켬' : '앱 내 안내 사용'}`} onPress={() => router.push({ pathname: '/permissions', params: { focus: 'notifications' } })} />
          <Setting icon="location" title="위치 권한" detail={`${permissionStatusLabel(locationPermission)} · 거부 시 수동 출발지 사용`} onPress={() => router.push({ pathname: '/permissions', params: { focus: 'location' } })} />
        </Section>

        <Section label="서비스 정보">
          <Setting icon="settings" title="개인정보처리방침" detail="수집 정보·이용 목적·삭제 방법" onPress={() => router.push('/privacy')} />
          <Setting icon="settings" title="이용약관" detail="서비스 이용과 안전 안내" onPress={() => router.push('/terms')} />
        </Section>

        <Text accessibilityLiveRegion="polite" style={[styles.saveStatus, status === 'error' && styles.error]}>
          {status === 'loading' ? '설정을 불러오는 중입니다'
            : status === 'saving' ? '설정을 저장하는 중입니다'
              : status === 'error' ? '설정을 저장하지 못했습니다'
                : '설정이 저장됐습니다'}
        </Text>
        <Text style={styles.data}>TimeAgent는 일정 계산에 필요한 정보만 저장하며 설정에서 언제든 변경할 수 있어요.</Text>
      </Screen>
      <BottomNav />
    </View>
  );
}

function Section({ label, children }: PropsWithChildren<{ label: string }>) {
  const styles = useThemedStyles(createStyles);
  return <View style={{ gap: space.sm }}><Text style={styles.section}>{label}</Text><Card style={{ paddingVertical: 4 }}>{children}</Card></View>;
}

/**
 * One tap, one change. The knob sits on the side the current mode is on and carries that mode's
 * sign — sun on the left for light, moon on the right for dark — so the control reads as the state
 * it is in rather than as a question about it.
 */
function ColorModeSwitch({ mode, onChange }: { mode: AppColorMode; onChange: (mode: AppColorMode) => void }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const dark = mode === 'dark';
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="다크 모드"
      accessibilityState={{ checked: dark }}
      accessibilityHint="누르면 화이트 모드와 다크 모드가 바로 바뀝니다"
      onPress={() => onChange(dark ? 'light' : 'dark')}
      style={({ pressed }) => [styles.modeSwitch, dark ? styles.modeSwitchDark : styles.modeSwitchLight, pressed && styles.pressed]}
    >
      {dark ? <Text style={[styles.modeLabel, styles.modeLabelDark]}>다크 모드</Text> : null}
      <View style={[styles.modeKnob, dark ? styles.modeKnobDark : styles.modeKnobLight]}>
        <AppIcon name={dark ? 'darkMode' : 'lightMode'} size={22} iconColor={dark ? c.navy : '#F7B733'} />
      </View>
      {dark ? null : <Text style={[styles.modeLabel, styles.modeLabelLight]}>화이트 모드</Text>}
    </Pressable>
  );
}

function DetailPanel({ children }: PropsWithChildren) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.detailPanel}>{children}</View>;
}

function MetricRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  return <View style={styles.metricRow}><View style={{ flex: 1 }}><Text style={styles.metricLabel}>{label}</Text><Text style={type.caption}>{detail}</Text></View><Text style={styles.metricValue}>{value}</Text></View>;
}

function formatRate(value: number | null) {
  return value === null ? '측정 대기' : `${value}%`;
}

function ChoicePanel<T extends string | number>({
  options,
  selected,
  onSelect,
  label = String,
  description,
  compact = false,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  label?: (value: T) => string;
  description?: string;
  compact?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  return (
    <DetailPanel>
      {description ? <Text style={type.bodyMuted}>{description}</Text> : null}
      <View style={[styles.choices, compact && styles.choicesCompact]}>
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={String(option)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onSelect(option)}
              style={[styles.choice, compact && styles.choiceCompact, active && styles.choiceActive]}>
              {/* Compact rows share the width between every option, so a longer label shrinks to
                  fit rather than wrapping to a second line or being cut off mid-word. */}
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit={compact}
                minimumFontScale={0.75}
                style={[styles.choiceText, compact && styles.choiceTextCompact, active && styles.choiceTextActive]}>
                {label(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </DetailPanel>
  );
}

function Setting({
  icon,
  title,
  detail,
  toggle,
  onToggle,
  onPress,
  expanded,
}: {
  icon: AppIconName;
  title: string;
  detail: string;
  toggle?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  expanded?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const content = (
    <>
      <View style={styles.icon}><AppIcon name={icon} size={20} /></View>
      <View style={{ flex: 1 }}><Text style={type.body}>{title}</Text><Text style={type.caption}>{detail}</Text></View>
      {onToggle ? <Switch accessibilityLabel={title} value={toggle} onValueChange={onToggle} trackColor={{ false: c.border, true: c.cyan }} thumbColor={c.surface} /> : null}
      {onPress ? <AppIcon name="chevronRight" size={20} iconColor={c.textMuted} style={[styles.arrow, expanded && styles.arrowExpanded]} /> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [styles.setting, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.setting}>{content}</View>;
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  section: { fontSize: 14, color: c.textMuted, fontWeight: '800', marginLeft: 4 },
  setting: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  pressed: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
  arrow: { transform: [{ rotate: '0deg' }] },
  arrowExpanded: { transform: [{ rotate: '90deg' }] },
  modeSection: { gap: space.sm },
  modeSwitch: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingHorizontal: 8, borderRadius: 32 },
  modeSwitchLight: { backgroundColor: c.primarySoft },
  modeSwitchDark: { backgroundColor: c.surfaceInverse },
  modeKnob: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  modeKnobLight: { backgroundColor: c.surface },
  modeKnobDark: { backgroundColor: c.ice },
  modeLabel: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  modeLabelLight: { color: c.deepBlue },
  modeLabelDark: { color: c.onInverse },
  detailPanel: { paddingHorizontal: space.sm, paddingVertical: space.md, gap: space.sm, backgroundColor: c.surfaceMuted, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: space.md, fontSize: 16, color: c.text },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choicesCompact: { flexWrap: 'nowrap', gap: space.xs },
  choice: { minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  choiceCompact: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  choiceActive: { backgroundColor: c.deepBlue, borderColor: c.deepBlue },
  choiceText: { color: c.textMuted, fontSize: 13, fontWeight: '800' },
  choiceTextCompact: { fontSize: 12 },
  choiceTextActive: { color: c.onInverse },
  learningRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  learningLabel: { color: c.navy, fontSize: 15, fontWeight: '800' },
  learningAverage: { color: c.deepBlue, fontSize: 14, fontWeight: '900' },
  metricIntro: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  metricRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  metricLabel: { color: c.navy, fontSize: 14, fontWeight: '800' },
  metricValue: { maxWidth: '45%', color: c.deepBlue, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  emptyLearning: { ...type.caption, paddingHorizontal: space.md, paddingVertical: space.lg },
  learningStatus: { ...type.caption, paddingHorizontal: space.md, paddingBottom: space.md },
  // No panel tint behind the reset control: the shading read as a disabled block sitting under the
  // metrics rather than as an action belonging to them.
  resetArea: { paddingHorizontal: space.sm, paddingVertical: space.md, gap: space.sm },
  resetPanel: { gap: space.sm, paddingTop: space.sm },
  deletionLabel: { color: c.navy, fontSize: 13, fontWeight: '900' },
  deletionItem: { ...type.caption, marginTop: -4, paddingLeft: space.xs },
  resetActions: { flexDirection: 'row', gap: space.sm },
  saveStatus: { ...type.caption, textAlign: 'center' },
  error: { color: c.danger },
  locationRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  locationInput: { flex: 1 },
  gpsButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: c.deepBlue, backgroundColor: c.surface },
  gpsButtonBusy: { opacity: 0.5 },
  gpsIconColor: { color: c.deepBlue },
  data: { ...type.caption, textAlign: 'center', paddingHorizontal: space.xl },
  plusNote: { ...type.caption, paddingHorizontal: space.md, paddingVertical: space.md },
  accountRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm },
  profile: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceMuted },
  profileFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.ice, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: c.deepBlue, fontSize: 20, fontWeight: '900' },
  accountName: { ...type.body, color: c.navy, fontWeight: '800' },
  accountAction: { padding: space.sm, gap: space.sm },
  });
};
