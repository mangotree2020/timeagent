import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { PropsWithChildren, useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Header, Screen, type } from '@/components/app-ui';
import { AppIcon, AppIconName } from '@/components/app-icon';
import { color, radius, space } from '@/constants/design';
import {
  AnalyticsSummary,
  clearAnalyticsStore,
  createEmptyAnalyticsStore,
  loadAnalyticsStore,
  summarizeAnalytics,
} from '@/lib/analytics';
import {
  AppSettings,
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
import { PermissionState, permissionStatusLabel } from '@/lib/permission-state';
import { useSchedule } from '@/state/schedule-context';

type DetailKey = 'location' | 'transport' | 'buffer' | 'routine' | 'tone';

const transports: PreferredTransport[] = ['도보', '버스', '지하철', '자가용', '택시'];
const bufferOptions: AppSettings['bufferMinutes'][] = [3, 5, 10];
const routineOptions: RoutinePreset[] = ['기본 외출 준비', '빠른 준비'];
const toneOptions: CoachTone[] = ['친근하게', '간결하게', '단호하게'];
const emptyPlusEligibility: PlusOfferEligibility = { eligible: false, completedSchedules: 0, remainingSchedules: 3 };

export default function SettingsScreen() {
  const { personalizationProfile, personalizationStatus, resetPersonalization, setPersonalizationEnabled } = useSchedule();
  const [settings, setSettings] = useState(createDefaultAppSettings);
  const settingsRef = useRef(settings);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [expanded, setExpanded] = useState<DetailKey | null>(null);
  const [locationInput, setLocationInput] = useState(settings.defaultLocation);
  const [locationPermission, setLocationPermission] = useState<PermissionState>('loading');
  const [notificationPermission, setNotificationPermission] = useState<PermissionState>('loading');
  const [showLearningReset, setShowLearningReset] = useState(false);
  const [showAnalyticsReset, setShowAnalyticsReset] = useState(false);
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary>(() => summarizeAnalytics(createEmptyAnalyticsStore()));
  const [plusEligibility, setPlusEligibility] = useState(emptyPlusEligibility);
  const [plusInterest, setPlusInterest] = useState<PlusInterestState>(createEmptyPlusInterestState);
  const learnedStats = [...personalizationProfile.routines, ...personalizationProfile.transports];
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

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="설정" eyebrow="내 생활에 맞게 ON:TIME을 조정하세요" />

        <Section label="기본 설정">
          <Setting icon="location" title="기본 출발 위치" detail={settings.defaultLocation} expanded={expanded === 'location'} onPress={() => toggleDetail('location')} />
          {expanded === 'location' ? (
            <DetailPanel>
              <TextInput
                accessibilityLabel="기본 출발 위치 입력"
                value={locationInput}
                onChangeText={setLocationInput}
                placeholder="동네 또는 주소를 입력하세요"
                style={styles.input}
              />
              <Button label="출발 위치 저장" onPress={saveLocation} disabled={!locationInput.trim()} />
            </DetailPanel>
          ) : null}

          <Setting icon="subway" title="선호 이동수단" detail={settings.preferredTransport} expanded={expanded === 'transport'} onPress={() => toggleDetail('transport')} />
          {expanded === 'transport' ? <ChoicePanel options={transports} selected={settings.preferredTransport} onSelect={(preferredTransport) => update({ preferredTransport })} /> : null}

          <Setting icon="time" title="기본 여유 시간" detail={`${settings.bufferMinutes}분`} expanded={expanded === 'buffer'} onPress={() => toggleDetail('buffer')} />
          {expanded === 'buffer' ? <ChoicePanel options={bufferOptions} selected={settings.bufferMinutes} label={(value) => `${value}분`} onSelect={(bufferMinutes) => update({ bufferMinutes })} /> : null}
        </Section>

        <Section label="준비 루틴">
          <Setting icon="routine" title="사용할 준비 루틴" detail={settings.routinePreset} expanded={expanded === 'routine'} onPress={() => toggleDetail('routine')} />
          {expanded === 'routine' ? <ChoicePanel options={routineOptions} selected={settings.routinePreset} onSelect={(routinePreset) => update({ routinePreset })} /> : null}
          <Setting icon="quick" title="빠른 준비" detail="총 22분 · 샤워와 필수 준비 중심" />
        </Section>

        <Section label="실제 시간 학습">
          <Setting icon="time" title="다음 계획에 실제 시간 반영" detail={personalizationProfile.enabled ? `사용 중 · 실제 기록 ${learnedSamples}개` : '사용 안 함 · 기본 입력 시간 사용'} toggle={personalizationProfile.enabled} onToggle={(enabled) => void setPersonalizationEnabled(enabled)} />
          {learnedStats.length > 0 ? <DetailPanel>{learnedStats.slice(0, 5).map((stat) => <View key={stat.key} style={styles.learningRow}><View style={{ flex: 1 }}><Text style={styles.learningLabel}>{stat.label}</Text><Text style={type.caption}>최근 실제 {stat.lastActualMinutes}분 · 기록 {stat.sampleCount}회</Text></View><Text style={styles.learningAverage}>평균 {stat.averageMinutes}분</Text></View>)}{!showLearningReset ? <Button label="학습 기록 초기화" variant="secondary" onPress={() => setShowLearningReset(true)} /> : <View style={styles.resetPanel}><Text style={type.body}>누적 실제 기록 {learnedSamples}개를 이 기기에서 삭제할까요?</Text><Text style={type.caption}>삭제 후에는 복구할 수 없으며 다음 계획부터 기본 입력 시간을 사용합니다.</Text><View style={styles.resetActions}><View style={{ flex: 1 }}><Button label="취소" variant="secondary" onPress={() => setShowLearningReset(false)} /></View><View style={{ flex: 1 }}><Button label="기록 모두 삭제" onPress={() => { setShowLearningReset(false); void resetPersonalization(); }} /></View></View></View>}</DetailPanel> : <Text style={styles.emptyLearning}>완료한 일정의 실제 소요 시간이 쌓이면 항목별 평균을 보여드려요.</Text>}
          <Text accessibilityLiveRegion="polite" style={[styles.learningStatus, personalizationStatus === 'error' && styles.error]}>{personalizationStatus === 'loading' ? '학습 기록을 불러오는 중입니다' : personalizationStatus === 'saving' ? '학습 설정을 저장하는 중입니다' : personalizationStatus === 'error' ? '학습 설정을 저장하지 못했습니다' : '학습 설정이 저장됐습니다'}</Text>
        </Section>

        <Section label="ON:TIME Plus · 사전 수요 검증">
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
          <Setting
            icon="chart"
            title="Phase 0 테스트 결과"
            detail="비식별 집계 확인 · 내가 선택해서 공유"
            onPress={() => router.push('/pilot-summary')}
          />
        </Section>

        <Section label="MVP 지표 · 이 기기">
          <View style={styles.metricIntro}><AppIcon name="chart" size={20} /><View style={{ flex: 1 }}><Text style={type.body}>제품 경험 측정</Text><Text style={type.caption}>일정 내용이나 위치는 보내지 않고 이 기기에 이벤트 수치만 저장합니다.</Text></View></View>
          <MetricRow label="첫 일정 생성 완료율" value={formatRate(analyticsSummary.scheduleCompletionRate)} detail={`${analyticsSummary.scheduleCompletions}/${analyticsSummary.scheduleStarts}회 완료`} />
          <MetricRow label="평균 일정 생성 시간" value={analyticsSummary.averageScheduleCreationSeconds === null ? '측정 대기' : `${analyticsSummary.averageScheduleCreationSeconds}초`} detail="등록 시작부터 AI 계획 생성까지" />
          <MetricRow label="알림에서 준비 진입" value={formatRate(analyticsSummary.notificationStartRate)} detail={`알림 응답 ${analyticsSummary.notificationOpens}회`} />
          <MetricRow label="지연안 적용 / 거절" value={`${formatRate(analyticsSummary.delayApplyRate)} / ${formatRate(analyticsSummary.delayRejectRate)}`} detail={`지연 제안 ${analyticsSummary.delayProposals}회`} />
          <MetricRow label="평균 단계 시간 오차" value={analyticsSummary.averageStepErrorMinutes === null ? '측정 대기' : `${analyticsSummary.averageStepErrorMinutes}분`} detail="계획과 실제 소요 시간의 절대 차이" />
          <MetricRow label="정시 도착률" value={formatRate(analyticsSummary.onTimeArrivalRate)} detail={`누적 이벤트 ${analyticsSummary.eventCount}개`} />
          <MetricRow label="Plus 관심 / 철회" value={`${analyticsSummary.plusInterestSelections} / ${analyticsSummary.plusInterestWithdrawals}`} detail={`Plus 화면 확인 ${analyticsSummary.plusOfferViews}회`} />
          <MetricRow label="Phase 0 결과 공유" value={`${analyticsSummary.pilotSummaryShares}회`} detail="사용자가 완료를 확인한 공유" />
          <DetailPanel>
            {!showAnalyticsReset ? <Button label="측정 데이터 초기화" variant="secondary" onPress={() => setShowAnalyticsReset(true)} /> : <View style={styles.resetPanel}><Text style={type.body}>이 기기의 MVP 측정 데이터를 삭제할까요?</Text><Text style={type.caption}>학습 기록과 일정은 유지되며 측정 지표만 초기화됩니다.</Text><View style={styles.resetActions}><View style={{ flex: 1 }}><Button label="취소" variant="secondary" onPress={() => setShowAnalyticsReset(false)} /></View><View style={{ flex: 1 }}><Button label="지표 삭제" onPress={() => { setShowAnalyticsReset(false); void clearAnalyticsStore(AsyncStorage).then(() => setAnalyticsSummary(summarizeAnalytics(createEmptyAnalyticsStore()))); }} /></View></View></View>}
          </DetailPanel>
        </Section>

        <Section label="AI 코치">
          <Setting icon="coach" title="코치 말투" detail={settings.coachTone} expanded={expanded === 'tone'} onPress={() => toggleDetail('tone')} />
          {expanded === 'tone' ? <ChoicePanel options={toneOptions} selected={settings.coachTone} onSelect={(coachTone) => update({ coachTone })} /> : null}
          <Setting icon="voice" title="음성으로 일정 제어" detail="등록 · 수정 · 확인" toggle={settings.voiceControl} onToggle={(voiceControl) => update({ voiceControl })} />
        </Section>

        <Section label="알림 및 권한">
          <Setting icon="alert" title="준비·출발 알림" detail={`${permissionStatusLabel(notificationPermission)} · ${settings.notifications ? '앱 알림 켬' : '앱 내 안내 사용'}`} onPress={() => router.push({ pathname: '/permissions', params: { focus: 'notifications' } })} />
          <Setting icon="location" title="위치 권한" detail={`${permissionStatusLabel(locationPermission)} · 거부 시 수동 출발지 사용`} onPress={() => router.push({ pathname: '/permissions', params: { focus: 'location' } })} />
        </Section>

        <Text accessibilityLiveRegion="polite" style={[styles.saveStatus, status === 'error' && styles.error]}>
          {status === 'loading' ? '설정을 불러오는 중입니다'
            : status === 'saving' ? '설정을 저장하는 중입니다'
              : status === 'error' ? '설정을 저장하지 못했습니다'
                : '설정이 저장됐습니다'}
        </Text>
        <Text style={styles.data}>ON:TIME은 일정 계산에 필요한 정보만 저장하며 설정에서 언제든 변경할 수 있어요.</Text>
      </Screen>
      <BottomNav />
    </View>
  );
}

function Section({ label, children }: PropsWithChildren<{ label: string }>) {
  return <View style={{ gap: space.sm }}><Text style={styles.section}>{label}</Text><Card style={{ paddingVertical: 4 }}>{children}</Card></View>;
}

function DetailPanel({ children }: PropsWithChildren) {
  return <View style={styles.detailPanel}>{children}</View>;
}

function MetricRow({ label, value, detail }: { label: string; value: string; detail: string }) {
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
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  label?: (value: T) => string;
}) {
  return (
    <DetailPanel>
      <View style={styles.choices}>
        {options.map((option) => {
          const active = option === selected;
          return (
            <Pressable
              key={String(option)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onSelect(option)}
              style={[styles.choice, active && styles.choiceActive]}>
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label(option)}</Text>
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
  const content = (
    <>
      <View style={styles.icon}><AppIcon name={icon} size={20} /></View>
      <View style={{ flex: 1 }}><Text style={type.body}>{title}</Text><Text style={type.caption}>{detail}</Text></View>
      {onToggle ? <Switch accessibilityLabel={title} value={toggle} onValueChange={onToggle} trackColor={{ false: color.border, true: color.cyan }} thumbColor={color.surface} /> : null}
      {onPress ? <AppIcon name="chevronRight" size={20} iconColor={color.textMuted} style={[styles.arrow, expanded && styles.arrowExpanded]} /> : null}
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

const styles = StyleSheet.create({
  section: { fontSize: 14, color: color.textMuted, fontWeight: '800', marginLeft: 4 },
  setting: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  pressed: { opacity: 0.7 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceMuted },
  arrow: { transform: [{ rotate: '0deg' }] },
  arrowExpanded: { transform: [{ rotate: '90deg' }] },
  detailPanel: { paddingHorizontal: space.sm, paddingVertical: space.md, gap: space.sm, backgroundColor: color.surfaceMuted, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, paddingHorizontal: space.md, fontSize: 16, color: color.text },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { backgroundColor: color.deepBlue, borderColor: color.deepBlue },
  choiceText: { color: color.textMuted, fontSize: 13, fontWeight: '800' },
  choiceTextActive: { color: color.surface },
  learningRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  learningLabel: { color: color.navy, fontSize: 15, fontWeight: '800' },
  learningAverage: { color: color.deepBlue, fontSize: 14, fontWeight: '900' },
  metricIntro: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  metricRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  metricLabel: { color: color.navy, fontSize: 14, fontWeight: '800' },
  metricValue: { maxWidth: '45%', color: color.deepBlue, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  emptyLearning: { ...type.caption, paddingHorizontal: space.md, paddingVertical: space.lg },
  learningStatus: { ...type.caption, paddingHorizontal: space.md, paddingBottom: space.md },
  resetPanel: { gap: space.sm, paddingTop: space.sm },
  resetActions: { flexDirection: 'row', gap: space.sm },
  saveStatus: { ...type.caption, textAlign: 'center' },
  error: { color: color.danger },
  data: { ...type.caption, textAlign: 'center', paddingHorizontal: space.xl },
  plusNote: { ...type.caption, paddingHorizontal: space.md, paddingVertical: space.md },
});
