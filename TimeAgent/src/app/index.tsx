import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BottomNav } from '@/components/bottom-nav';
import { Card, Screen, StatusPill } from '@/components/app-ui';
import { AppIcon, IconButton } from '@/components/app-icon';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { useSchedule } from '@/state/schedule-context';
import { describeRepeatWeekdays, normalizeRepeatWeekdays } from '@/lib/appointment-recurrence';
import { ConfirmedSchedulePlan, currentOnTimeArrivalStreak, formatConfirmedPlanDate, isPlanAlarmEnabled, plansForLocalDate, plansForLocalDateRange } from '@/lib/confirmed-plans';
import { describeNextAlarm } from '@/lib/home-attention';
import { useTaskExecution } from '@/state/task-context';



export default function HomeScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const params = useLocalSearchParams<{ e2eStreak?: string }>();
  const [today, setToday] = useState(() => new Date());


  const { currentTask } = useTaskExecution();
  const { confirmedPlans, confirmedPlansStatus, progressSession, selectConfirmedPlan, setPlanAlarmEnabled, startProgress } = useSchedule();
  const homePlans = plansForLocalDateRange(confirmedPlans, today, 2)
    .filter((plan) => plan.state === 'scheduled' || plan.state === 'active');
  const fixtureStreak = __DEV__ && params.e2eStreak ? Number(params.e2eStreak) : null;
  const onTimeStreak = Number.isFinite(fixtureStreak) && fixtureStreak !== null
    ? Math.max(0, Math.floor(fixtureStreak))
    : currentOnTimeArrivalStreak(confirmedPlans);
  // The countdown is only useful while it keeps counting; a minute is the smallest unit shown.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayCount = plansForLocalDate(homePlans, today).length;
  const planCounts = `오늘 ${['일', '월', '화', '수', '목', '금', '토'][today.getDay()]}요일 약속 ${todayCount}개 · 내일 ${homePlans.length - todayCount}개`;
  const alarmablePlans = homePlans.filter(isPlanAlarmEnabled);
  const nextHomePlan = alarmablePlans.find((plan) => plan.state === 'active') ?? alarmablePlans[0] ?? null;
  const nextAlarm = nextHomePlan ? describeNextAlarm(nextHomePlan.prepStartAt, nowTick) : null;
  const schedule = nextHomePlan?.schedule ?? null;
  const preparationRunning = progressSession?.state === 'active';
  const startPreparationNow = async () => {
    if (!nextHomePlan) return;
    if (!preparationRunning) await startProgress('direct', nextHomePlan.id);
    router.push('/progress');
  };
  const openRegisteredPlan = (id: string) => {
    selectConfirmedPlan(id);
    router.push('/plan');
  };
  useEffect(() => {
    const clock = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(clock);
  }, []);

  return (
    <View style={styles.page}>
      <Screen>
        {currentTask ? <NowTaskCard task={currentTask} onPress={() => router.push('/task-focus' as Href)} /> : null}

        {schedule && nextAlarm ? <View style={styles.alarmTop}>
          {/* The start control leads, clock-app style: a rounded play triangle on the left, and to
              its right when the preparation alarm rings — both open the live preparation screen. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={preparationRunning ? '시작. 진행 중인 준비 화면 열기' : '시작. 지금 바로 준비 시작'}
            onPress={() => void startPreparationNow()}
            style={({ pressed }) => [styles.startArrow, pressed && styles.buttonPressed]}
          >
            <Svg width={56} height={56} viewBox="0 0 64 64">
              <Path d="M23 16 L49 32 L23 48 Z" fill={c.deepBlue} stroke={c.deepBlue} strokeWidth={13} strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
            <Text style={styles.startArrowText}>시작</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${preparationRunning ? `${schedule.title} 진행하고 있어요` : `${nextAlarm.remaining} 준비 알람이 울립니다`}, ${nextAlarm.at}, ${schedule.title}. ${planCounts}. 실시간 준비 화면 열기`}
            accessibilityLiveRegion="polite"
            onPress={() => void startPreparationNow()}
            style={({ pressed }) => [styles.alarmCopy, pressed && styles.buttonPressed]}
          >
            <Text numberOfLines={3} style={styles.alarmHeadline}>{preparationRunning ? `${schedule.title}\n진행하고 있어요` : `${nextAlarm.remaining} 준비\n알람이 울립니다`}</Text>
            <Text numberOfLines={1} style={styles.alarmAt}>{planCounts}</Text>
          </Pressable>
                </View> : homePlans.length ? <View style={styles.alarmTop}>
          <View style={styles.alarmCopy}>
            <Text style={styles.alarmHeadline}>{'켜진\n준비 알람이 없어요'}</Text>
            <Text numberOfLines={1} style={styles.alarmAt}>{planCounts}</Text>
          </View>
        </View> : <Pressable
          accessibilityRole="button"
          accessibilityLabel="확정된 다음 약속이 없어요. 새 일정 만들기"
          accessibilityHint="일정 생성 화면으로 이동합니다"
          disabled={confirmedPlansStatus === 'loading'}
          onPress={() => router.push({ pathname: '/create', params: { new: '1' } })}
          style={({ pressed }) => [styles.heroPressable, pressed && styles.buttonPressed]}
        >
          {/* One quiet box instead of a pitch: what is true now, one line of what happens next,
              and the whole box goes to the create screen. */}
          <Card style={styles.emptyPlan}><View style={styles.emptyIcon}><AppIcon name="plus" size={22} /></View><View style={styles.emptyCopy}><Text style={styles.emptyTitle}>{confirmedPlansStatus === 'loading' ? '저장된 계획을 불러오고 있어요' : '확정된 다음 약속이 없어요'}</Text><Text style={styles.emptyBody}>{confirmedPlansStatus === 'loading' ? '잠시만 기다려 주세요.' : '일정을 등록하면 준비 시작 시각에 자동으로 실행돼요.'}</Text></View><AppIcon name="chevronRight" size={20} iconColor={c.textMuted} /></Card>
        </Pressable>}

        {homePlans.length ? <>
          {/* Just the +, on the right where the section heading used to end: the counts already
              read out under the alarm notice, so the heading said it twice. */}
          <View style={styles.addRow}><IconButton name="plus" label="새 일정 직접 등록" variant="primary" onPress={() => router.push({ pathname: '/create', params: { new: '1' } })} /></View>
          <RegisteredPlanList plans={homePlans} onSelect={openRegisteredPlan} onToggleAlarm={(id, enabled) => void setPlanAlarmEnabled(id, enabled)} />
        </> : null}

        {onTimeStreak > 0 ? <OnTimeArrivalBadge
          streak={onTimeStreak}
          onPress={() => router.push({ pathname: '/schedules', params: { tab: 'past' } })}
        /> : null}


      </Screen>
      <BottomNav />
    </View>
  );
}

function NowTaskCard({ task, onPress }: { task: NonNullable<ReturnType<typeof useTaskExecution>['currentTask']>; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const current = task.actions.find((action) => action.status === 'current');
  const next = task.actions.find((action) => action.status === 'upcoming');
  if (!current) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`지금 ${current.label}. ${task.status === 'active' ? '5분 시작 중' : '5분만 시작'}`} onPress={onPress} style={({ pressed }) => [styles.nowTaskPressable, pressed && styles.buttonPressed]}>
    <Card dark style={styles.nowTaskCard}>
      <View style={styles.nowTaskTop}><Text style={styles.nowTaskLabel}>지금 할 일</Text><StatusPill label={task.status === 'active' ? '시작 중' : '5분 시작'} tone={task.status === 'active' ? 'success' : 'info'} /></View>
      <Text numberOfLines={2} style={styles.nowTaskAction}>{current.label}</Text>
      <Text numberOfLines={1} style={styles.nowTaskNext}>다음 · {next?.label ?? '이 행동을 마치면 완료'}</Text>
    </Card>
  </Pressable>;
}

function OnTimeArrivalBadge({ streak, onPress }: { streak: number; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const remaining = Math.max(0, 6 - streak);
  const detail = remaining === 0
    ? '‘시간의 달인’ 뱃지를 달성했어요'
    : remaining === 1
      ? "한 번만 더 하면 '시간의 달인' 뱃지야"
      : `${remaining}번 더 정시 도착하면 '시간의 달인' 뱃지야`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`연속 ${streak}회 정시 도착 중. ${detail}. 지난 일정 보기`}
      accessibilityHint="지난 일정의 완료 결과를 확인합니다"
      onPress={onPress}
      style={({ pressed }) => [styles.streakPressable, pressed && styles.todayEventPressed]}
    >
      <Card style={styles.streakCard}>
        <View style={styles.streakIcon}><AppIcon name="achievement" size={24} iconColor="#FFFFFF" strokeWidth={2.4} /></View>
        <View style={styles.streakCopy}><Text style={styles.streakTitle}>연속 {streak}회 정시 도착 중</Text><Text style={styles.streakDetail}>{detail}</Text></View>
        <Text style={styles.streakLink}>보기</Text>
      </Card>
    </Pressable>
  );
}

function RegisteredPlanList({ plans, onSelect, onToggleAlarm }: { plans: ConfirmedSchedulePlan[]; onSelect: (id: string) => void; onToggleAlarm: (id: string, enabled: boolean) => void }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  return (
    <View accessibilityLabel={`등록한 일정 ${plans.length}개`} style={styles.registeredList}>
      {plans.map((item) => (
        <Card key={item.id} style={styles.registeredCard}>
          {/* The row opens the plan; the switch is the alarm itself, clock-app style, so it sits
              beside the card's tap target rather than inside it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`등록 일정, ${item.schedule.title}, ${item.schedule.appointmentTime}, ${item.schedule.destination}, ${item.state === 'active' ? '자동 실행 중' : `${item.plan.prepStart} 자동 시작`}`}
            accessibilityHint="저장된 준비 계획을 확인합니다"
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [styles.registeredPressable, pressed && styles.todayEventPressed]}
          >
            <View style={[styles.registeredBody, !isPlanAlarmEnabled(item) && styles.registeredMuted]}>
              <View style={styles.registeredTime}><Text style={styles.registeredTimeText}>{item.schedule.appointmentTime}</Text><View style={styles.registeredMetaRow}><Text style={styles.registeredDate}>{formatConfirmedPlanDate(item.appointmentAt)}</Text><StatusPill label={!isPlanAlarmEnabled(item) ? '알람 꺼짐' : item.state === 'active' ? '실행 중' : `${item.plan.prepStart} 시작`} tone={!isPlanAlarmEnabled(item) ? 'warning' : item.state === 'active' ? 'success' : 'info'} /></View></View>
              <View style={styles.registeredCopy}>
                <View style={styles.registeredTitleRow}><Text numberOfLines={1} style={styles.registeredTitle}>{item.schedule.title}</Text></View>
                <View style={styles.locationRow}><AppIcon name="location" size={15} iconColor={c.textMuted} /><Text numberOfLines={1} style={styles.registeredLocation}>{item.schedule.destination}</Text></View>
                {normalizeRepeatWeekdays(item.schedule.repeatWeekdays).length ? <View style={styles.locationRow}><AppIcon name="routine" size={15} iconColor={c.textMuted} /><Text numberOfLines={1} style={styles.registeredLocation}>{describeRepeatWeekdays(item.schedule.repeatWeekdays ?? [])} 반복</Text></View> : null}
              </View>
            </View>
          </Pressable>
          <Switch
            accessibilityLabel={`${item.schedule.title} 준비 알람 ${isPlanAlarmEnabled(item) ? '끄기' : '켜기'}`}
            value={isPlanAlarmEnabled(item)}
            onValueChange={(enabled) => onToggleAlarm(item.id, enabled)}
            trackColor={{ false: c.border, true: c.deepBlue }}
            thumbColor={c.surface}
          />
        </Card>
      ))}
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  page: { flex: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroPressable: { minHeight: 44, borderRadius: radius.lg },
  nowTaskPressable: { minHeight: 44, borderRadius: radius.lg },
  nowTaskCard: { minHeight: 142, gap: space.md, padding: space.xl },
  nowTaskTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  nowTaskLabel: { color: c.cyan, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  nowTaskAction: { color: c.onInverse, fontSize: 24, lineHeight: 31, fontWeight: '900' },
  nowTaskNext: { color: c.onInverseMuted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  alarmTop: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm },
  startArrow: { minWidth: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  startArrowText: { color: c.deepBlue, fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: -6 },
  addRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  alarmCopy: { flex: 1, gap: 6, paddingVertical: space.sm, borderRadius: radius.md },
  alarmHeadline: { color: c.navy, fontSize: 26, lineHeight: 34, fontWeight: '900', letterSpacing: -0.6 },
  alarmAt: { color: c.textMuted, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  emptyPlan: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: space.md },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice, flexShrink: 0 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  emptyBody: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  heroTitleLead: { flex: 1 },
  heroTitle: { color: c.navy, fontSize: 22, lineHeight: 29, fontWeight: '900', letterSpacing: -0.45 },
  heroEdit: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primarySoft },
  heroTimeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroTimesPressable: { flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: radius.md },
  // The appointment time keeps its size; the preparation start leads in the countdown's colour.
  heroTimes: { fontSize: 22, lineHeight: 30, fontWeight: '900', color: c.deepBlue, fontVariant: ['tabular-nums'] },
  heroPrepTime: { color: c.deepBlue },
  heroCountdown: { fontSize: 15, fontWeight: '800' },
  heroSlash: { color: c.textMuted, fontWeight: '700' },
  heroAppointmentTime: { color: c.navy },
  buttonPressed: { opacity: 0.72 },
  registeredList: { gap: space.sm },
  registeredPressable: { flex: 1, minHeight: 44, borderRadius: radius.lg },
  registeredCard: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg },
  registeredBody: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  registeredMuted: { opacity: 0.45 },
  registeredTime: { width: 122, alignSelf: 'stretch', justifyContent: 'center', borderRightWidth: 1, borderRightColor: c.border, paddingRight: space.sm },
  // Twice the old 18px: the time is what the list is scanned for, clock-app style.
  registeredTimeText: { color: c.deepBlue, fontSize: 36, lineHeight: 44, fontWeight: '900', fontVariant: ['tabular-nums'] },
  registeredDate: { color: c.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  registeredMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  registeredCopy: { flex: 1, gap: 6 },
  registeredTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  registeredTitle: { flex: 1, color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  registeredLocation: { flex: 1, color: c.textMuted, fontSize: 13, lineHeight: 18 },
  link: { color: c.deepBlue, fontSize: 14, fontWeight: '800' },
  sectionAction: { minHeight: 44, minWidth: 52, alignItems: 'flex-end', justifyContent: 'center' },
  todayEventPressed: { opacity: 0.7 },
  todayEmpty: { gap: space.md },
  streakPressable: { minHeight: 44, borderRadius: radius.lg },
  streakCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderColor: 'transparent' },
  streakIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFB547', flexShrink: 0 },
  streakCopy: { flex: 1, gap: 2 },
  streakTitle: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  streakDetail: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
  streakLink: { minWidth: 44, minHeight: 44, textAlign: 'right', textAlignVertical: 'center', color: c.deepBlue, fontSize: 13, lineHeight: 44, fontWeight: '900' },
});
