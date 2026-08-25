import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Header, Screen, StatusPill, appType, useAppType } from '@/components/app-ui';
import { AppIcon, IconButton } from '@/components/app-icon';
import { Timeline } from '@/components/timeline';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';

import { alarmReliabilityHint, AlarmReliabilitySnapshot, getAlarmReliabilitySnapshot, UNSUPPORTED_ALARM_RELIABILITY } from '@/lib/alarm-reliability';
import { loadAppSettings } from '@/lib/app-settings';
import {
  buildStepCoachMessage,
  ONE_MINUTE_WARNING_MIN_STEP_MINUTES,
  PROGRESS_ONE_MINUTE_MESSAGE,
  withDirectionParticle,
} from '@/lib/local-notifications';
import { canUseAppTts } from '@/lib/screen-reader-state';
import { getProgressRemainingSeconds } from '@/lib/progress-session';
import { formatCountdown, shiftClock } from '@/lib/schedule';
import { useSchedule } from '@/state/schedule-context';

export default function ProgressScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const params = useLocalSearchParams<{ source?: string; planId?: string }>();
  const {
    activePlan,
    activeSchedule,
    applyDelayProposal,
    completeCurrent,
    confirmedPlansStatus,
    delayMinutes,
    draft,
    pendingDelayProposal,
    notificationStatus,
    progressSession,
    progressStatus,
    proposeDelay,
    rejectDelayProposal,
    route,
    startProgress,
    timeline,
  } = useSchedule();
  const [now, setNow] = useState(0);
  const [showDelay, setShowDelay] = useState(false);
  // A scheduled alarm is only a promise the OS keeps if it is allowed to; say so here, where the
  // person is deciding whether to put the phone down.
  const [alarmReliability, setAlarmReliability] = useState<AlarmReliabilitySnapshot>(UNSUPPORTED_ALARM_RELIABILITY);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const refresh = () => setAlarmReliability(getAlarmReliabilitySnapshot());
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, []);
  const reliabilityHint = notificationStatus === 'scheduled' ? alarmReliabilityHint(alarmReliability) : null;
  const [decisionMessage, setDecisionMessage] = useState('');
  const startRequested = useRef(false);
  const schedule = progressSession?.schedule ?? activeSchedule ?? draft;
  const current = useMemo(() => timeline.find((step) => step.status === 'current'), [timeline]);
  const remaining = progressSession ? getProgressRemainingSeconds(progressSession, now) : 0;
  const stepDurationSeconds = Math.max(1, progressSession?.stepDurationSeconds ?? 1);
  useEffect(() => {
    if (progressStatus === 'loading' || confirmedPlansStatus === 'loading' || startRequested.current) return;
    startRequested.current = true;
    void startProgress(params.source === 'notification' ? 'notification' : 'direct', params.planId);
  }, [confirmedPlansStatus, params.planId, params.source, progressStatus, startProgress]);
  useEffect(() => {
    if (progressSession?.state === 'completed') router.replace('/complete');
  }, [progressSession?.state]);
  // The coach speaks once per step, when it becomes the current one and the screen is open.
  const spokenStepId = useRef<string | null>(null);
  useEffect(() => {
    const stepId = progressSession?.currentStepId ?? null;
    if (!stepId || progressSession?.state !== 'active' || spokenStepId.current === stepId) return;
    spokenStepId.current = stepId;
    let cancelled = false;
    void (async () => {
      const settings = await loadAppSettings(AsyncStorage);
      if (cancelled || !settings.stepCoaching || !await canUseAppTts()) return;
      const steps = progressSession.timeline;
      const index = steps.findIndex((step) => step.id === stepId);
      if (index < 0) return;
      await Speech.stop();
      if (cancelled) return;
      Speech.speak(buildStepCoachMessage(steps[index], steps[index + 1] ?? null), { language: 'ko-KR', rate: 0.95 });
    })();
    return () => { cancelled = true; };
  }, [progressSession?.currentStepId, progressSession?.state, progressSession?.timeline]);
  useEffect(() => {
    const initialTick = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, []);
  // One spoken warning per step as its last minute begins, so eyes can stay on the shower or the
  // shirt instead of the countdown. A step short enough that its last minute is its whole length
  // gets none — the start cue just played.
  const oneMinuteWarnedStepId = useRef<string | null>(null);
  useEffect(() => {
    const stepId = progressSession?.currentStepId ?? null;
    if (!stepId || progressSession?.state !== 'active' || now === 0) return;
    if (remaining === 0 || remaining > 60 || stepDurationSeconds < ONE_MINUTE_WARNING_MIN_STEP_MINUTES * 60) return;
    if (oneMinuteWarnedStepId.current === stepId) return;
    oneMinuteWarnedStepId.current = stepId;
    let cancelled = false;
    void (async () => {
      const settings = await loadAppSettings(AsyncStorage);
      if (cancelled || !settings.stepCoaching || !await canUseAppTts()) return;
      await Speech.stop();
      if (cancelled) return;
      Speech.speak(PROGRESS_ONE_MINUTE_MESSAGE, { language: 'ko-KR', rate: 0.95 });
    })();
    return () => { cancelled = true; };
  }, [now, progressSession?.currentStepId, progressSession?.state, remaining, stepDurationSeconds]);
  // A finished step rings until the person turns it off, and turning it off is the completion —
  // the button below stops the sound by advancing the step. A step planned at zero minutes (도착
  // 예정) has no time to run out of, so it never rings.
  const alarmPlayerRef = useRef<AudioPlayer | null>(null);
  const alarmRinging = progressSession?.state === 'active' && !!current
    && (progressSession?.stepDurationSeconds ?? 0) > 0 && now > 0 && remaining === 0;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const player = createAudioPlayer(require('../../assets/sounds/step-alarm.wav'));
    player.loop = true;
    player.volume = 1;
    alarmPlayerRef.current = player;
    return () => {
      alarmPlayerRef.current = null;
      try { player.remove(); } catch { /* already released with the screen */ }
    };
  }, []);
  useEffect(() => {
    const player = alarmPlayerRef.current;
    if (!player) return;
    if (!alarmRinging) {
      player.pause();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true });
        if (cancelled) return;
        await player.seekTo(0);
        if (cancelled) return;
        player.play();
      } catch { /* a device that cannot ring still shows the overdue state */ }
    })();
    return () => {
      cancelled = true;
      player.pause();
    };
  }, [alarmRinging]);
  const delayedArrival = shiftClock(activePlan?.arrival ?? schedule.appointmentTime, delayMinutes);

  if (progressStatus === 'loading' || confirmedPlansStatus === 'loading') {
    return <Screen><Header title="실시간 준비" /><Card><Text style={type.heading}>확정 계획을 확인하는 중입니다</Text><Text style={type.bodyMuted}>저장된 계획과 시작 시각을 불러오고 있어요.</Text></Card></Screen>;
  }

  if (!progressSession) {
    return (
      <Screen>
        <Header title="아직 시작 전이에요" eyebrow={`${schedule.appointmentTime} · ${schedule.destination}`} right={<IconButton name="close" label="닫기" variant="plain" onPress={() => router.replace('/schedules')} />} />
        <Card><Text style={type.heading}>준비 시작 시각까지 기다려 주세요</Text><Text style={type.bodyMuted}>확정한 계획은 준비 시작 시각에 자동으로 실행됩니다. 지금 눌러서 미리 시작하지 않아도 돼요.</Text></Card>
        <Button label="확정 계획 보기" onPress={() => router.replace('/schedules')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={schedule.title} eyebrow={`${schedule.appointmentTime} · ${schedule.destination}`} right={<IconButton name="close" label="진행 최소화" variant="plain" onPress={() => router.replace('/')} />} />
      <View style={styles.statusRow}><View><Text style={styles.statusLabel}>예상 도착</Text><Text style={styles.arrival}>{delayedArrival}</Text></View><StatusPill label={delayMinutes ? `${delayMinutes}분 지연` : '정시 도착 가능'} tone={delayMinutes ? 'warning' : 'success'} /></View>

      {delayMinutes > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`정시 도착 가능한 대안 경로 비교하기. 현재 ${delayMinutes}분 지연.`} onPress={() => router.push('/plan-b')} style={styles.solution}><View style={styles.solutionIcon}><AppIcon name="coach" size={20} iconColor={c.warning} /></View><View style={{ flex: 1 }}><Text style={styles.solutionTitle}>정시 도착 가능한 방법이 있어요</Text><Text style={styles.solutionBody}>{delayMinutes}분 지연됐어요. {withDirectionParticle(route)} 이동하는 지금 경로 대신 더 빠른 대안을 비교해 보세요.</Text></View><AppIcon name="chevronRight" size={22} iconColor={c.warning} /></Pressable> : null}

      <Card dark style={styles.currentCard}>
        <Text style={styles.currentLabel}>현재 · {current?.title ?? '이동 중'}</Text>
        <Text accessibilityLabel={`남은 시간 ${formatCountdown(remaining)}`} style={styles.timer}>{formatCountdown(remaining)}</Text>
        {remaining === 0 && current ? <Text accessibilityRole="alert" style={styles.overdue}>{alarmRinging ? '현재 단계 예정 시간이 지났습니다. 알람을 끄면 완료로 처리돼요.' : '현재 단계 예정 시간이 지났습니다. 완료 여부를 확인해 주세요.'}</Text> : null}
        <Text style={styles.expected}>완료 예정 {current ? shiftClock(current.time, current.duration) : activePlan?.arrival}</Text>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(8, 100 - remaining / stepDurationSeconds * 100)}%` }]} /></View>
        <Text style={styles.next}>다음 · {timeline.find((step) => step.status === 'upcoming' || step.status === 'changed')?.title ?? '도착 확인'}</Text>
        <Button label={alarmRinging ? `알람 끄고 ${current?.title ?? '단계'} 완료` : `${current?.title ?? '단계'} 완료`} onPress={completeCurrent} />
        <View style={styles.quickActions}><Pressable onPress={() => setShowDelay(!showDelay)} style={styles.quick}><Text style={styles.quickText}>시간 더 필요</Text></Pressable><Pressable onPress={completeCurrent} style={styles.quick}><Text style={styles.quickText}>건너뛰기</Text></Pressable></View>
      </Card>

      {showDelay && !pendingDelayProposal ? <Card><Text style={type.heading}>얼마나 더 필요한가요?</Text><View style={styles.delayChoices}>{[3, 5, 10].map((minutes) => <Pressable key={minutes} accessibilityRole="button" onPress={() => { proposeDelay(minutes); setShowDelay(false); setDecisionMessage(''); }} style={styles.delayChoice}><Text style={styles.delayText}>+{minutes}분</Text></Pressable>)}</View><Text style={type.caption}>먼저 변경 전후를 보여 드리고, 적용을 누를 때만 계획을 바꿉니다.</Text></Card> : null}

      {pendingDelayProposal ? (
        <Card style={styles.comparison} accessibilityLabel={`${pendingDelayProposal.additionalMinutes}분 지연 변경 전후 확인`}>
          <View style={styles.comparisonHeader}><View style={{ flex: 1 }}><Text style={type.heading}>변경 전후 확인</Text><Text style={type.bodyMuted}>현재 행동에 {pendingDelayProposal.additionalMinutes}분을 더 반영할까요?</Text></View><StatusPill label={`+${pendingDelayProposal.additionalMinutes}분 제안`} tone="warning" /></View>
          <View style={styles.comparisonLabels}><Text style={styles.comparisonLabel}>항목</Text><Text style={styles.comparisonValueLabel}>변경 전</Text><Text style={styles.comparisonValueLabel}>변경 후</Text></View>
          <ComparisonRow label="준비 총시간" before={`${pendingDelayProposal.before.preparationMinutes}분`} after={`${pendingDelayProposal.after.preparationMinutes}분`} />
          <ComparisonRow label="출발" before={pendingDelayProposal.before.departure} after={pendingDelayProposal.after.departure} />
          <ComparisonRow label="예상 도착" before={pendingDelayProposal.before.arrival} after={pendingDelayProposal.after.arrival} last />
          <Text style={styles.comparisonReason}>중요한 준비 행동은 삭제하지 않고 이후 출발과 도착 시간만 함께 이동합니다.</Text>
          <View style={styles.comparisonActions}>
            <View style={{ flex: 1 }}><Button label="기존 계획 유지" variant="secondary" onPress={() => { rejectDelayProposal(); setDecisionMessage('변경을 거절하고 기존 계획을 유지합니다.'); }} /></View>
            <View style={{ flex: 1 }}><Button label="변경안 적용" onPress={() => { applyDelayProposal(); setDecisionMessage(`${pendingDelayProposal.additionalMinutes}분 변경안을 적용했습니다.`); }} /></View>
          </View>
        </Card>
      ) : null}

      {decisionMessage ? <Text accessibilityLiveRegion="polite" style={styles.decisionMessage}>{decisionMessage}</Text> : null}

      <View style={styles.timelineHeading}><Text style={type.heading}>남은 계획</Text><Pressable accessibilityRole="button" accessibilityLabel="준비 계획 전체 보기" onPress={() => router.push('/plan')} style={styles.headingAction}><Text style={styles.link}>전체 보기</Text></Pressable></View>
      <Button label="이동 경로 보기" variant="secondary" onPress={() => router.push('/journey')} />
      <Card><Timeline steps={timeline} compact /></Card>
      <Text accessibilityLiveRegion="polite" style={[styles.sessionStatus, progressStatus === 'error' && styles.sessionError]}>
        {progressStatus === 'saving' ? '현재 진행 상태를 저장하는 중입니다'
            : progressStatus === 'error' ? '진행 상태를 저장하지 못했습니다'
              : '현재 진행 상태가 자동 저장됐습니다'}
      </Text>
      <Text accessibilityLiveRegion="polite" style={[styles.sessionStatus, notificationStatus === 'error' && styles.sessionError]}>
        {notificationStatus === 'scheduled'
          ? `남은 일정 알림 ${progressSession?.scheduledNotifications.length ?? 0}개가 예약됐습니다`
          : notificationStatus === 'disabled'
            ? '알림이 꺼져 있어 앱 안에서 남은 시간을 계속 안내합니다'
            : notificationStatus === 'error'
              ? '알림을 예약하지 못했지만 앱 안의 진행 안내는 계속됩니다'
              : '일정 알림 상태를 확인하는 중입니다'}
      </Text>
      {reliabilityHint ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${reliabilityHint} 준비 알람 정확도 설정 열기`} onPress={() => router.push({ pathname: '/permissions', params: { focus: 'alarms' } })} style={styles.reliabilityHint}>
          <Text style={styles.reliabilityText}>{reliabilityHint}</Text>
          <Text style={styles.reliabilityAction}>알람 설정 확인</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function ComparisonRow({ label, before, after, last = false }: { label: string; before: string; after: string; last?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.comparisonRow, !last && styles.comparisonDivider]}><Text style={styles.comparisonLabel}>{label}</Text><Text style={styles.comparisonBefore}>{before}</Text><Text style={styles.comparisonAfter}>{after}</Text></View>;
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, statusLabel: { ...type.caption, fontWeight: '700' }, arrival: { fontSize: 28, color: c.navy, fontWeight: '900' }, solution: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: c.warningSoft, borderRadius: radius.md, padding: space.lg }, solutionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }, solutionTitle: { fontSize: 14, fontWeight: '900', color: c.warning }, solutionBody: { fontSize: 13, lineHeight: 19, color: '#7C4A0A', marginTop: 2 }, currentCard: { gap: space.md }, currentLabel: { fontSize: 13, color: c.cyan, fontWeight: '900', letterSpacing: 1 }, timer: { fontSize: 58, lineHeight: 66, color: c.onInverse, fontWeight: '900', letterSpacing: -2 }, overdue: { color: '#FDE68A', fontSize: 13, lineHeight: 19, fontWeight: '700' }, expected: { color: c.onInverseMuted, fontSize: 14 }, progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.2)', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 4, backgroundColor: c.cyan }, next: { color: c.onInverseMuted, fontSize: 14 }, quickActions: { flexDirection: 'row', gap: space.sm }, quick: { flex: 1, minHeight: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,.25)', alignItems: 'center', justifyContent: 'center' }, quickText: { color: c.onInverseMuted, fontSize: 13, fontWeight: '800' }, delayChoices: { flexDirection: 'row', gap: space.sm, marginVertical: space.lg }, delayChoice: { flex: 1, minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted }, delayText: { color: c.deepBlue, fontWeight: '900' },
  comparison: { gap: space.md, borderWidth: 2, borderColor: c.cyan }, comparisonHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, comparisonLabels: { flexDirection: 'row', paddingTop: space.sm }, comparisonValueLabel: { width: 76, textAlign: 'right', color: c.textMuted, fontSize: 11, fontWeight: '800' }, comparisonRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center' }, comparisonDivider: { borderBottomWidth: 1, borderBottomColor: c.border }, comparisonLabel: { flex: 1, color: c.textMuted, fontSize: 13, fontWeight: '700' }, comparisonBefore: { width: 76, textAlign: 'right', color: c.textMuted, fontSize: 14, textDecorationLine: 'line-through' }, comparisonAfter: { width: 76, textAlign: 'right', color: c.deepBlue, fontSize: 16, fontWeight: '900' }, comparisonReason: { ...type.caption, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceMuted }, comparisonActions: { flexDirection: 'row', gap: space.sm }, decisionMessage: { ...type.caption, textAlign: 'center', color: c.deepBlue, fontWeight: '700' },
  timelineHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headingAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm }, link: { color: c.deepBlue, fontWeight: '800' }, sessionStatus: { textAlign: 'center', color: c.textMuted, fontSize: 12 }, sessionError: { color: c.danger },
  reliabilityHint: { minHeight: 44, gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border },
  reliabilityText: { color: c.text, fontSize: 14, lineHeight: 20 },
  reliabilityAction: { color: c.deepBlue, fontSize: 14, fontWeight: '800' },
  });
};
