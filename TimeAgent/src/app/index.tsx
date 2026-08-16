import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Screen, SectionTitle, StatusPill, useAppType } from '@/components/app-ui';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { HomeLogoButton } from '@/components/home-logo-button';
import { VoicePulseButton } from '@/components/voice-pulse-button';
import { Timeline } from '@/components/timeline';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { useSchedule } from '@/state/schedule-context';
import { getHomeFloatingActionBottom } from '@/lib/bottom-navigation-layout';
import { ConfirmedSchedulePlan, currentOnTimeArrivalStreak, formatConfirmedPlanDate, plansForLocalDate, plansForLocalDateRange } from '@/lib/confirmed-plans';
import { createHomeGreeting } from '@/lib/home-greeting';
import { preparationCountdown, shouldAnimateHomeLogo } from '@/lib/home-attention';
import { loadCurrentDeviceWeather, WeatherPermissionNeededError } from '@/lib/device-weather-provider';
import {
  createWeatherPreviewFixture,
  roundTemperature,
  WeatherSnapshot,
  weatherPreparationAdvice,
} from '@/lib/weather';
import { useAuth } from '@/state/auth-context';
import { useTaskExecution } from '@/state/task-context';

type WeatherStatus = 'checking' | 'ready' | 'permission-needed' | 'error';

const countdownIconColor: Record<'info' | 'warning' | 'success', string> = {
  info: '#0B5FA5',
  warning: '#9A5A00',
  success: '#0D766E',
};

export default function HomeScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const params = useLocalSearchParams<{ e2eWeather?: string; e2eStreak?: string }>();
  const weatherFixtureMode = __DEV__ && params.e2eWeather === 'ready';
  const weatherErrorFixtureMode = __DEV__ && params.e2eWeather === 'error';
  const [today, setToday] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => weatherFixtureMode ? createWeatherPreviewFixture() : null);
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>(weatherFixtureMode ? 'ready' : weatherErrorFixtureMode ? 'error' : 'checking');
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { currentTask } = useTaskExecution();
  const { confirmedPlans, confirmedPlansStatus, progressSession, selectConfirmedPlan, startProgress, delayMinutes } = useSchedule();
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
  const scheduleSummary = confirmedPlansStatus === 'loading'
    ? '오늘·내일 약속 확인 중'
    : `오늘·내일 약속 ${homePlans.length}개`;
  const hasAttentionMessage = shouldAnimateHomeLogo({
    delayMinutes,
    weatherIcon: weather?.icon,
    weatherStatus,
    calendarStatus: 'ready',
  });

  const loadWeather = useCallback(async () => {
    if (weatherFixtureMode) {
      setWeather(createWeatherPreviewFixture());
      setWeatherStatus('ready');
      return;
    }
    if (weatherErrorFixtureMode) {
      setWeather(null);
      setWeatherStatus('error');
      return;
    }
    setWeatherStatus('checking');
    try {
      setWeather(await loadCurrentDeviceWeather());
      setWeatherStatus('ready');
    } catch (error) {
      setWeather(null);
      setWeatherStatus(error instanceof WeatherPermissionNeededError ? 'permission-needed' : 'error');
    }
  }, [weatherErrorFixtureMode, weatherFixtureMode]);

  useEffect(() => {
    const clock = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => void loadWeather(), 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadWeather();
    });
    return () => {
      clearTimeout(initialLoad);
      subscription.remove();
    };
  }, [loadWeather]);

  return (
    <View style={styles.page}>
      <Screen>
        <View style={styles.homeHeader}>
          <View style={styles.homeHeaderCopy}>
            <Text accessibilityRole="header" style={styles.greeting}>{createHomeGreeting(today, user?.name)}</Text>
            <Text style={styles.headerMeta}>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(today)} · {scheduleSummary}</Text>
          </View>
          <HomeLogoButton hasMessage={hasAttentionMessage} onPress={() => router.push('/alerts')} />
        </View>

        {currentTask ? <NowTaskCard task={currentTask} onPress={() => router.push('/task-focus' as Href)} /> : null}

        {schedule ? <Card style={styles.hero}>
          {/* The action sits beside the card's own tap target rather than inside it: nesting one
              button in another is invalid on web and swallows the outer press. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`다음 약속, ${schedule.title}, ${schedule.appointmentTime}, ${schedule.destination}`}
            accessibilityHint="상세 일정과 준비 계획을 확인합니다"
            onPress={() => nextHomePlan && openRegisteredPlan(nextHomePlan.id)}
            style={({ pressed }) => [styles.heroPressable, pressed && styles.buttonPressed]}
          >
            <View style={styles.heroTop}>
              <Text style={styles.nextLabel}>다음 약속</Text>
              <AppIcon name="chevronRight" size={20} iconColor={c.textMuted} />
            </View>
            <Text numberOfLines={2} style={styles.heroTitle}>{schedule.title}</Text>
            {/* People check the home card to answer "when do I have to move?", so the countdown to
                preparation sits above the appointment details and carries its own colour. */}
            {countdown ? <View accessibilityLabel={countdown.accessibilityLabel} accessibilityLiveRegion="polite" style={[styles.countdown, styles[`countdown_${countdown.tone}`]]}>
              <AppIcon name="time" size={18} iconColor={countdownIconColor[countdown.tone]} />
              <Text style={[styles.countdownText, { color: countdownIconColor[countdown.tone] }]}>{countdown.label}</Text>
              <Text style={styles.countdownAt}>{nextHomePlan?.plan.prepStart} 준비 시작</Text>
            </View> : null}
            <View style={styles.appointmentMeta}>
              <View style={styles.appointmentDetail}><AppIcon name="time" size={17} iconColor={c.deepBlue} /><Text style={styles.appointmentDetailText}>{schedule.appointmentTime}</Text></View>
              <View style={styles.appointmentDetail}><AppIcon name="location" size={17} iconColor={c.textMuted} /><Text numberOfLines={1} style={styles.heroLocation}>{schedule.destination}</Text></View>
            </View>
          </Pressable>
          {/* Being ready sooner than planned is common, and waiting for the scheduled start is
              the one thing the app should never force. This starts the same run immediately. */}
          <Button
            label={preparationRunning ? '준비 화면 열기' : '지금 시작'}
            accessibilityHint={preparationRunning ? '진행 중인 준비 화면으로 이동합니다' : '준비 시작 시각을 기다리지 않고 지금 바로 준비를 시작합니다'}
            onPress={() => void startPreparationNow()}
          />
        </Card> : <Card style={styles.emptyPlan}><View style={styles.weatherIcon}><AppIcon name="calendar" size={22} /></View><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>{confirmedPlansStatus === 'loading' ? '저장된 계획을 불러오고 있어요' : '확정된 다음 약속이 없어요'}</Text><Text style={styles.weatherStateBody}>{confirmedPlansStatus === 'loading' ? '잠시만 기다려 주세요.' : '말로 일정을 등록하면 준비 시작 시각에 자동으로 실행됩니다.'}</Text>{confirmedPlansStatus !== 'loading' ? <Button label="말로 새 일정 만들기" variant="secondary" onPress={() => router.push('/voice-schedule')} /> : null}</View></Card>}

        <HomeWeather status={weatherStatus} weather={weather} fixtureMode={weatherFixtureMode} onRetry={() => void loadWeather()} />

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
        {nextTodayPlan?.plan.timeline.length ? <Card><Timeline steps={nextTodayPlan.plan.timeline.slice(0, 4)} compact /></Card> : <Card style={styles.todayEmpty}><Text style={type.bodyMuted}>오늘 확정한 계획이 있으면 준비 행동과 자동 시작 시각을 여기에 보여드려요.</Text></Card>}

      </Screen>
      <VoicePulseButton label="음성으로 새 일정 만들기" onPress={() => router.push('/voice-schedule')} style={[styles.fab, { bottom: getHomeFloatingActionBottom(insets.bottom) - 8 }]} />
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
            </View>
            <AppIcon name="chevronRight" size={20} iconColor={c.textMuted} />
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

function HomeWeather({ status, weather, fixtureMode, onRetry }: { status: WeatherStatus; weather: WeatherSnapshot | null; fixtureMode: boolean; onRetry: () => void }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  if (status === 'checking') {
    return <Card style={styles.weatherState}><ActivityIndicator color={c.deepBlue} /><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>현재 날씨 확인 중</Text><Text style={styles.weatherStateBody}>승인된 현재 위치로 날씨를 불러오고 있어요.</Text></View></Card>;
  }

  if (status === 'permission-needed') {
    return <Card style={styles.weatherState}><View style={styles.weatherIcon}><AppIcon name="location" size={22} /></View><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>현재 위치 날씨를 확인하세요</Text><Text style={styles.weatherStateBody}>위치 권한을 허용하면 일정 준비에 필요한 날씨를 보여드려요.</Text><Pressable accessibilityRole="button" accessibilityLabel="위치 권한 설정" onPress={() => router.push({ pathname: '/permissions', params: { focus: 'location' } })} style={styles.weatherLink}><Text style={styles.weatherLinkText}>위치 권한 설정</Text><AppIcon name="chevronRight" size={16} /></Pressable></View></Card>;
  }

  if (status === 'error' || !weather) {
    return <Card style={styles.weatherState}><View style={styles.weatherIcon}><AppIcon name="error" size={22} /></View><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>날씨를 불러오지 못했어요</Text><Text style={styles.weatherStateBody}>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</Text><Pressable accessibilityRole="button" accessibilityLabel="날씨 다시 불러오기" onPress={onRetry} style={styles.weatherLink}><Text style={styles.weatherLinkText}>다시 불러오기</Text><AppIcon name="chevronRight" size={16} /></Pressable></View></Card>;
  }

  const locationName = weather.locationName || '주변 날씨';
  const accessibilityLabel = `${locationName} 날씨 ${weather.condition}, ${roundTemperature(weather.temperatureC)}도. 날씨 상세 보기`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="날씨 상세 화면으로 이동합니다"
      onPress={() => router.push(fixtureMode ? { pathname: '/weather', params: { e2eWeather: 'ready' } } : '/weather')}
      style={({ pressed }) => [styles.weatherPressable, pressed && styles.buttonPressed]}
    >
      <Card style={styles.weatherCard}>
        <View style={styles.weatherIcon}><AppIcon name={weatherIconName(weather)} size={24} /></View>
        <View style={styles.weatherCopy}>
          <Text style={styles.weatherCondition}>{locationName} · {weather.condition} {roundTemperature(weather.temperatureC)}°</Text>
          <Text numberOfLines={2} style={styles.weatherAdvice}>{weatherPreparationAdvice(weather)}</Text>
        </View>
        <AppIcon name="chevronRight" size={20} iconColor={c.textMuted} />
      </Card>
    </Pressable>
  );
}

function weatherIconName(weather: WeatherSnapshot): AppIconName {
  if (weather.icon === 'clear') return 'weatherClear';
  if (weather.icon === 'fog') return 'weatherFog';
  if (weather.icon === 'rain') return 'weatherRain';
  if (weather.icon === 'snow') return 'weatherSnow';
  if (weather.icon === 'storm') return 'weatherStorm';
  return 'weatherCloudy';
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  page: { flex: 1 },
  homeHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  homeHeaderCopy: { flex: 1, gap: 1 },
  greeting: { flexShrink: 1, color: c.navy, fontSize: 23, lineHeight: 30, fontWeight: '900', letterSpacing: -0.55 },
  headerMeta: { color: c.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroPressable: { minHeight: 44, borderRadius: radius.lg },
  nowTaskPressable: { minHeight: 44, borderRadius: radius.lg },
  nowTaskCard: { minHeight: 142, gap: space.md, padding: space.xl },
  nowTaskTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  nowTaskLabel: { color: c.cyan, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  nowTaskAction: { color: c.onInverse, fontSize: 24, lineHeight: 31, fontWeight: '900' },
  nowTaskNext: { color: c.onInverseMuted, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  hero: { minHeight: 148, gap: space.md, padding: space.xl, borderColor: 'transparent', boxShadow: '0 10px 28px rgba(15,23,42,0.055)', elevation: 2 },
  emptyPlan: { minHeight: 132, flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  nextLabel: { color: c.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  countdown: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.md },
  countdown_info: { backgroundColor: c.infoSoft },
  countdown_warning: { backgroundColor: c.warningSoft },
  countdown_success: { backgroundColor: c.successSoft },
  countdownText: { fontSize: 17, fontWeight: '900' },
  countdownAt: { flex: 1, textAlign: 'right', color: c.textMuted, fontSize: 13, fontWeight: '700' },
  heroTitle: { color: c.navy, fontSize: 22, lineHeight: 29, fontWeight: '900', letterSpacing: -0.45 },
  appointmentMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg },
  appointmentDetail: { minHeight: 24, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7 },
  appointmentDetailText: { color: c.deepBlue, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  heroLocation: { flexShrink: 1, color: c.textMuted, fontSize: 15, lineHeight: 21, fontWeight: '700' },
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
  weatherPressable: { minHeight: 44, borderRadius: radius.lg },
  weatherCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderColor: 'transparent', boxShadow: '0 6px 18px rgba(15,23,42,0.035)' },
  weatherIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice, flexShrink: 0 },
  weatherCopy: { flex: 1, gap: 2 },
  weatherCondition: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  weatherAdvice: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  weatherState: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  weatherStateCopy: { flex: 1, gap: 3 },
  weatherStateTitle: { color: c.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  weatherStateBody: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
  weatherLink: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  weatherLinkText: { color: c.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '900' },
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
  fab: { position: 'absolute', right: 14, zIndex: 10 },
});
