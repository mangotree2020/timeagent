import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Screen, SectionTitle, StatusPill, useAppType } from '@/components/app-ui';
import { AppIcon } from '@/components/app-icon';
import { Timeline } from '@/components/timeline';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { useSchedule } from '@/state/schedule-context';
import { describeRepeatWeekdays, normalizeRepeatWeekdays } from '@/lib/appointment-recurrence';
import { ConfirmedSchedulePlan, currentOnTimeArrivalStreak, formatConfirmedPlanDate, plansForLocalDate, plansForLocalDateRange } from '@/lib/confirmed-plans';
import { preparationCountdown } from '@/lib/home-attention';
import { useTaskExecution } from '@/state/task-context';


const countdownIconColor: Record<'info' | 'warning' | 'success', string> = {
  info: '#0B5FA5',
  warning: '#9A5A00',
  success: '#0D766E',
};

export default function HomeScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const params = useLocalSearchParams<{ e2eStreak?: string }>();
  const [today, setToday] = useState(() => new Date());


  const { currentTask } = useTaskExecution();
  const { confirmedPlans, confirmedPlansStatus, progressSession, selectConfirmedPlan, startProgress } = useSchedule();
  const todayPlans = plansForLocalDate(confirmedPlans, today)
    .filter((plan) => plan.state === 'scheduled' || plan.state === 'active');
  const homePlans = plansForLocalDateRange(confirmedPlans, today, 2)
    .filter((plan) => plan.state === 'scheduled' || plan.state === 'active');
  const fixtureStreak = __DEV__ && params.e2eStreak ? Number(params.e2eStreak) : null;
  const onTimeStreak = Number.isFinite(fixtureStreak) && fixtureStreak !== null
    ? Math.max(0, Math.floor(fixtureStreak))
    : currentOnTimeArrivalStreak(confirmedPlans);
  const nextTodayPlan = todayPlans.find((plan) => plan.state === 'active') ?? todayPlans[0] ?? null;
  // The countdown is only useful while it keeps counting; a minute is the smallest unit shown.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const nextHomePlan = homePlans.find((plan) => plan.state === 'active') ?? homePlans[0] ?? null;
  const schedule = nextHomePlan?.schedule ?? null;
  const countdown = nextHomePlan ? preparationCountdown(nextHomePlan.prepStartAt, nowTick) : null;
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

        {schedule ? <Card style={styles.hero}>
          {/* The box answers "what, when do I move, when is it" and opens the live preparation
              screen — same place as the round 시작 button. The pencil is the only way out to the
              plan detail, for reading or changing the plan. Buttons stay siblings of the pressable
              areas: nesting one button in another is invalid on web and swallows the outer press. */}
          <View style={styles.heroTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${schedule.title}, 실시간 준비 화면 열기`}
              accessibilityHint="시작 버튼과 같은 실시간 준비 화면으로 이동합니다"
              onPress={() => void startPreparationNow()}
              style={({ pressed }) => [styles.heroTitleLead, pressed && styles.buttonPressed]}
            >
              <Text numberOfLines={2} style={styles.heroTitle}>{schedule.title}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="준비 계획 상세 보기"
              accessibilityHint="계획을 확인하고 수정할 수 있습니다"
              onPress={() => nextHomePlan && openRegisteredPlan(nextHomePlan.id)}
              style={({ pressed }) => [styles.heroEdit, pressed && styles.buttonPressed]}
            >
              <AppIcon name="edit" size={20} iconColor={c.deepBlue} />
            </Pressable>
          </View>
          <View style={styles.heroTimeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`준비 시작 ${nextHomePlan?.plan.prepStart ?? ''}${countdown ? `, ${countdown.label}` : ''}, 약속 ${schedule.appointmentTime}. 실시간 준비 화면 열기`}
              accessibilityLiveRegion="polite"
              onPress={() => void startPreparationNow()}
              style={({ pressed }) => [styles.heroTimesPressable, pressed && styles.buttonPressed]}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62} style={styles.heroTimes}>
                <Text style={[styles.heroPrepTime, countdown && { color: countdownIconColor[countdown.tone] }]}>{nextHomePlan?.plan.prepStart}</Text>
                {countdown ? <Text style={[styles.heroCountdown, { color: countdownIconColor[countdown.tone] }]}>{` (${countdown.label})`}</Text> : null}
                <Text style={styles.heroSlash}>{' / '}</Text>
                <Text style={styles.heroAppointmentTime}>{schedule.appointmentTime}</Text>
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={preparationRunning ? '시작. 진행 중인 준비 화면 열기' : '시작. 지금 바로 준비 시작'}
              onPress={() => void startPreparationNow()}
              style={({ pressed }) => [styles.startCircle, pressed && styles.buttonPressed]}
            >
              <Text style={styles.startCircleText}>시작</Text>
            </Pressable>
          </View>
        </Card> : <Pressable
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
          <SectionTitle action={<Pressable accessibilityRole="button" onPress={() => router.push('/schedules')} style={styles.sectionAction}><Text style={styles.link}>전체 보기</Text></Pressable>}>오늘·내일 등록 약속 {homePlans.length}개</SectionTitle>
          <RegisteredPlanList plans={homePlans} onSelect={openRegisteredPlan} />
        </> : null}

        {onTimeStreak > 0 ? <OnTimeArrivalBadge
          streak={onTimeStreak}
          onPress={() => router.push({ pathname: '/schedules', params: { tab: 'past' } })}
        /> : null}

        {/* The link has to follow the card's own source, or it offers "전체 보기" over an empty state. */}
        <SectionTitle action={nextTodayPlan ? <Pressable accessibilityRole="button" onPress={() => router.push('/plan')} style={styles.sectionAction}><Text style={styles.link}>전체 보기</Text></Pressable> : undefined}>오늘의 준비 계획</SectionTitle>
        {nextTodayPlan?.plan.timeline.length ? <Card><Timeline steps={nextTodayPlan.plan.timeline} compact transport={nextTodayPlan.schedule.transport} /></Card> : <Card style={styles.todayEmpty}><Text style={type.bodyMuted}>오늘 확정한 계획이 있으면 준비 행동과 자동 시작 시각을 여기에 보여드려요.</Text></Card>}

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

function RegisteredPlanList({ plans, onSelect }: { plans: ConfirmedSchedulePlan[]; onSelect: (id: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  return (
    <View accessibilityLabel={`등록한 일정 ${plans.length}개`} style={styles.registeredList}>
      {plans.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`등록 일정, ${item.schedule.title}, ${item.schedule.appointmentTime}, ${item.schedule.destination}, ${item.state === 'active' ? '자동 실행 중' : `${item.plan.prepStart} 자동 시작`}`}
          accessibilityHint="저장된 준비 계획을 확인합니다"
          onPress={() => onSelect(item.id)}
          style={({ pressed }) => [styles.registeredPressable, pressed && styles.todayEventPressed]}
        >
          <Card style={styles.registeredCard}>
            <View style={styles.registeredTime}><Text style={styles.registeredTimeText}>{item.schedule.appointmentTime}</Text><Text style={styles.registeredDate}>{formatConfirmedPlanDate(item.appointmentAt)}</Text></View>
            <View style={styles.registeredCopy}>
              <View style={styles.registeredTitleRow}><Text numberOfLines={1} style={styles.registeredTitle}>{item.schedule.title}</Text><StatusPill label={item.state === 'active' ? '실행 중' : `${item.plan.prepStart} 시작`} tone={item.state === 'active' ? 'success' : 'info'} /></View>
              <View style={styles.locationRow}><AppIcon name="location" size={15} iconColor={c.textMuted} /><Text numberOfLines={1} style={styles.registeredLocation}>{item.schedule.destination}</Text></View>
              {normalizeRepeatWeekdays(item.schedule.repeatWeekdays).length ? <View style={styles.locationRow}><AppIcon name="routine" size={15} iconColor={c.textMuted} /><Text numberOfLines={1} style={styles.registeredLocation}>{describeRepeatWeekdays(item.schedule.repeatWeekdays ?? [])} 반복</Text></View> : null}
            </View>
            <AppIcon name="chevronRight" size={20} iconColor={c.textMuted} />
          </Card>
        </Pressable>
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
  hero: { minHeight: 148, gap: space.md, padding: space.xl, borderColor: 'transparent', boxShadow: '0 10px 28px rgba(15,23,42,0.055)', elevation: 2 },
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
  startCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.deepBlue, boxShadow: '0 6px 16px rgba(27,100,218,0.35)', elevation: 4 },
  startCircleText: { color: c.onPrimary, fontSize: 15, fontWeight: '900' },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  registeredList: { gap: space.sm },
  registeredPressable: { minHeight: 44, borderRadius: radius.lg },
  registeredCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  registeredTime: { width: 76, alignSelf: 'stretch', justifyContent: 'center', borderRightWidth: 1, borderRightColor: c.border, paddingRight: space.sm },
  registeredTimeText: { color: c.deepBlue, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  registeredDate: { color: c.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  registeredCopy: { flex: 1, gap: 6 },
  registeredTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  registeredTitle: { flex: 1, color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  registeredLocation: { flex: 1, color: c.textMuted, fontSize: 13, lineHeight: 18 },
  link: { color: c.deepBlue, fontSize: 14, fontWeight: '800' },
  sectionAction: { minHeight: 44, minWidth: 52, alignItems: 'flex-end', justifyContent: 'center' },
  todayEventPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  todayEmpty: { gap: space.md },
  streakPressable: { minHeight: 44, borderRadius: radius.lg },
  streakCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderColor: 'transparent' },
  streakIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFB547', flexShrink: 0 },
  streakCopy: { flex: 1, gap: 2 },
  streakTitle: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  streakDetail: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
  streakLink: { minWidth: 44, minHeight: 44, textAlign: 'right', textAlignVertical: 'center', color: c.deepBlue, fontSize: 13, lineHeight: 44, fontWeight: '900' },
});
