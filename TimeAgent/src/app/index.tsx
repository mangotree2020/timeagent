import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Screen, SectionTitle, StatusPill, type } from '@/components/app-ui';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { HomeLogoButton } from '@/components/home-logo-button';
import { VoicePulseButton } from '@/components/voice-pulse-button';
import { Timeline } from '@/components/timeline';
import { color, radius, space } from '@/constants/design';
import { useSchedule } from '@/state/schedule-context';
import { getHomeFloatingActionBottom } from '@/lib/bottom-navigation-layout';
import { ConfirmedSchedulePlan, formatConfirmedPlanDate, plansForLocalDate, plansForLocalDateRange } from '@/lib/confirmed-plans';
import {
  DeviceCalendarEvent,
  calendarEventsForLocalDateRange,
  createTodayCalendarPreviewFixture,
  formatTodayTomorrowCalendarEventTime,
} from '@/lib/device-calendar';
import { deviceCalendarProvider } from '@/lib/device-calendar-provider';
import { createHomeGreeting } from '@/lib/home-greeting';
import { shouldAnimateHomeLogo } from '@/lib/home-attention';
import { loadCurrentDeviceWeather, WeatherPermissionNeededError } from '@/lib/device-weather-provider';
import {
  createWeatherPreviewFixture,
  roundTemperature,
  WeatherSnapshot,
  weatherPreparationAdvice,
} from '@/lib/weather';
import { useAuth } from '@/state/auth-context';

type TodayCalendarStatus = 'checking' | 'ready' | 'permission-needed' | 'unavailable' | 'error';
type WeatherStatus = 'checking' | 'ready' | 'permission-needed' | 'error';

export default function HomeScreen() {
  const params = useLocalSearchParams<{ e2eCalendar?: string; e2eWeather?: string }>();
  const calendarFixtureMode = __DEV__ && params.e2eCalendar === 'today';
  const weatherFixtureMode = __DEV__ && params.e2eWeather === 'ready';
  const weatherErrorFixtureMode = __DEV__ && params.e2eWeather === 'error';
  const [today, setToday] = useState(() => new Date());
  const [todayEvents, setTodayEvents] = useState<DeviceCalendarEvent[]>(() => {
    if (!calendarFixtureMode) return [];
    return calendarEventsForLocalDateRange(createTodayCalendarPreviewFixture(today).events, today, 2);
  });
  const [todayCalendarStatus, setTodayCalendarStatus] = useState<TodayCalendarStatus>(calendarFixtureMode ? 'ready' : 'checking');
  const [weather, setWeather] = useState<WeatherSnapshot | null>(() => weatherFixtureMode ? createWeatherPreviewFixture() : null);
  const [weatherStatus, setWeatherStatus] = useState<WeatherStatus>(weatherFixtureMode ? 'ready' : weatherErrorFixtureMode ? 'error' : 'checking');
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { confirmedPlans, confirmedPlansStatus, selectConfirmedPlan, delayMinutes } = useSchedule();
  const todayPlans = plansForLocalDate(confirmedPlans, today)
    .filter((plan) => plan.state === 'scheduled' || plan.state === 'active');
  const homePlans = plansForLocalDateRange(confirmedPlans, today, 2)
    .filter((plan) => plan.state === 'scheduled' || plan.state === 'active');
  const nextTodayPlan = todayPlans.find((plan) => plan.state === 'active') ?? todayPlans[0] ?? null;
  const nextHomePlan = homePlans.find((plan) => plan.state === 'active') ?? homePlans[0] ?? null;
  const schedule = nextHomePlan?.schedule ?? null;
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
    calendarStatus: todayCalendarStatus,
  });
  const loadTodayCalendar = useCallback(async () => {
    const currentDay = new Date();
    setToday(currentDay);
    if (calendarFixtureMode) {
      setTodayEvents(calendarEventsForLocalDateRange(createTodayCalendarPreviewFixture(currentDay).events, currentDay, 2));
      setTodayCalendarStatus('ready');
      return;
    }
    setTodayCalendarStatus('checking');
    try {
      const permission = await deviceCalendarProvider.getPermission();
      if (permission.state === 'unavailable') {
        setTodayEvents([]);
        setTodayCalendarStatus('unavailable');
        return;
      }
      if (permission.state !== 'granted') {
        setTodayEvents([]);
        setTodayCalendarStatus('permission-needed');
        return;
      }
      const snapshot = await deviceCalendarProvider.loadUpcoming(currentDay, 2);
      setTodayEvents(calendarEventsForLocalDateRange(snapshot.events, currentDay, 2));
      setTodayCalendarStatus('ready');
    } catch {
      setTodayCalendarStatus('error');
    }
  }, [calendarFixtureMode]);

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
    const initialLoad = setTimeout(() => void loadTodayCalendar(), 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadTodayCalendar();
    });
    return () => {
      clearTimeout(initialLoad);
      subscription.remove();
    };
  }, [loadTodayCalendar]);

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

        {schedule ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={`다음 약속, ${schedule.title}, ${schedule.appointmentTime}, ${schedule.destination}`}
          accessibilityHint="상세 일정과 준비 계획을 확인합니다"
          onPress={() => nextHomePlan && openRegisteredPlan(nextHomePlan.id)}
          style={({ pressed }) => [styles.heroPressable, pressed && styles.buttonPressed]}
        >
          <Card style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={styles.nextLabel}>다음 약속</Text>
              <AppIcon name="chevronRight" size={20} iconColor={color.textMuted} />
            </View>
            <Text numberOfLines={2} style={styles.heroTitle}>{schedule.title}</Text>
            <View style={styles.appointmentMeta}>
              <View style={styles.appointmentDetail}><AppIcon name="time" size={17} iconColor={color.deepBlue} /><Text style={styles.appointmentDetailText}>{schedule.appointmentTime}</Text></View>
              <View style={styles.appointmentDetail}><AppIcon name="location" size={17} iconColor={color.textMuted} /><Text numberOfLines={1} style={styles.heroLocation}>{schedule.destination}</Text></View>
            </View>
          </Card>
        </Pressable> : <Card style={styles.emptyPlan}><View style={styles.weatherIcon}><AppIcon name="calendar" size={22} /></View><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>{confirmedPlansStatus === 'loading' ? '저장된 계획을 불러오고 있어요' : '확정된 다음 약속이 없어요'}</Text><Text style={styles.weatherStateBody}>{confirmedPlansStatus === 'loading' ? '잠시만 기다려 주세요.' : '일정을 만든 뒤 계획 확정을 누르면 준비 시작 시각에 자동으로 실행됩니다.'}</Text>{confirmedPlansStatus !== 'loading' ? <Button label="새 일정 만들기" variant="secondary" onPress={() => router.push({ pathname: '/create', params: { new: '1' } })} /> : null}</View></Card>}

        <HomeWeather status={weatherStatus} weather={weather} fixtureMode={weatherFixtureMode} onRetry={() => void loadWeather()} />

        {homePlans.length ? <>
          <SectionTitle action={<Pressable accessibilityRole="button" onPress={() => router.push('/schedules')} style={styles.sectionAction}><Text style={styles.link}>전체 보기</Text></Pressable>}>오늘·내일 등록 약속 {homePlans.length}개</SectionTitle>
          <RegisteredPlanList plans={homePlans} onSelect={openRegisteredPlan} />
        </> : null}

        <SectionTitle action={<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/create', params: { new: '1' } })} style={styles.sectionAction}><Text style={styles.link}>+ 추가</Text></Pressable>}>오늘·내일 약속{todayCalendarStatus === 'ready' ? ` ${todayEvents.length}개` : ''}</SectionTitle>
        <TodaySchedules
          status={todayCalendarStatus}
          events={todayEvents}
          today={today}
          onRetry={() => void loadTodayCalendar()}
        />

        <SectionTitle action={schedule ? <Pressable onPress={() => router.push('/plan')}><Text style={styles.link}>전체 보기</Text></Pressable> : undefined}>오늘의 준비 계획</SectionTitle>
        {nextTodayPlan?.plan.timeline.length ? <Card><Timeline steps={nextTodayPlan.plan.timeline.slice(0, 4)} compact /></Card> : <Card style={styles.todayEmpty}><Text style={type.bodyMuted}>오늘 확정한 계획이 있으면 준비 행동과 자동 시작 시각을 여기에 보여드려요.</Text></Card>}

      </Screen>
      <VoicePulseButton label="음성으로 새 일정 만들기" onPress={() => router.push('/voice-schedule')} style={[styles.fab, { bottom: getHomeFloatingActionBottom(insets.bottom) - 8 }]} />
      <BottomNav />
    </View>
  );
}

function RegisteredPlanList({ plans, onSelect }: { plans: ConfirmedSchedulePlan[]; onSelect: (id: string) => void }) {
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
              <View style={styles.locationRow}><AppIcon name="location" size={15} iconColor={color.textMuted} /><Text numberOfLines={1} style={styles.registeredLocation}>{item.schedule.destination}</Text></View>
            </View>
            <AppIcon name="chevronRight" size={20} iconColor={color.textMuted} />
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

function HomeWeather({ status, weather, fixtureMode, onRetry }: { status: WeatherStatus; weather: WeatherSnapshot | null; fixtureMode: boolean; onRetry: () => void }) {
  if (status === 'checking') {
    return <Card style={styles.weatherState}><ActivityIndicator color={color.deepBlue} /><View style={styles.weatherStateCopy}><Text style={styles.weatherStateTitle}>현재 날씨 확인 중</Text><Text style={styles.weatherStateBody}>승인된 현재 위치로 날씨를 불러오고 있어요.</Text></View></Card>;
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
        <AppIcon name="chevronRight" size={20} iconColor={color.textMuted} />
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

function TodaySchedules({ status, events, today, onRetry }: { status: TodayCalendarStatus; events: DeviceCalendarEvent[]; today: Date; onRetry: () => void }) {
  if (status === 'checking') {
    return <Card style={styles.todayState}><ActivityIndicator color={color.deepBlue} /><View style={styles.todayStateCopy}><Text style={type.heading}>오늘·내일 약속을 확인하고 있어요</Text><Text style={type.bodyMuted}>기기 캘린더에서 오늘과 내일 약속을 불러옵니다.</Text></View></Card>;
  }
  if (status === 'error') {
    return <Card style={styles.todayEmpty}><View style={styles.todayStateIcon}><AppIcon name="error" size={24} /></View><Text style={type.heading}>오늘·내일 약속을 불러오지 못했어요</Text><Text style={type.bodyMuted}>캘린더 연결 상태를 확인한 뒤 다시 시도해 주세요.</Text><Button label="약속 다시 불러오기" variant="secondary" onPress={onRetry} /></Card>;
  }
  if (status === 'permission-needed' || status === 'unavailable') {
    return <Card style={styles.todayEmpty}><View style={styles.todayStateIcon}><AppIcon name="calendar" size={24} /></View><Text style={type.heading}>{status === 'permission-needed' ? '캘린더를 연결하면 오늘·내일 약속을 보여드려요' : '오늘·내일 약속을 직접 추가해 주세요'}</Text><Text style={type.bodyMuted}>{status === 'permission-needed' ? '권한을 허용하기 전에는 기기 일정을 읽지 않습니다.' : '기기 캘린더 연결은 iOS·Android 앱에서 사용할 수 있습니다.'}</Text><Button label={status === 'permission-needed' ? '캘린더 연결하기' : '일정 만들기'} variant="secondary" onPress={() => status === 'permission-needed' ? router.push({ pathname: '/schedules', params: { tab: 'calendar' } }) : router.push({ pathname: '/create', params: { new: '1' } })} /></Card>;
  }
  if (!events.length) {
    return <Card style={styles.todayEmpty}><View style={styles.todayStateIcon}><AppIcon name="calendar" size={24} /></View><Text style={type.heading}>오늘·내일 등록된 약속이 없어요</Text><Text style={type.bodyMuted}>새 약속을 추가하면 준비 시작 시간과 다음 행동을 계산해 드립니다.</Text><Button label="약속 추가" variant="secondary" onPress={() => router.push({ pathname: '/create', params: { new: '1' } })} /></Card>;
  }
  return <View accessibilityLabel={`오늘·내일 약속 ${events.length}개`} style={styles.todayList}>{events.map((event) => {
    const timeLabel = formatTodayTomorrowCalendarEventTime(event, today);
    return <Pressable key={event.occurrenceKey} accessibilityRole="button" accessibilityLabel={`${timeLabel.replace('\n', ' ')}, ${event.title}${event.location ? `, ${event.location}` : ''}`} accessibilityHint="기기 캘린더 일정 화면으로 이동합니다" onPress={() => router.push({ pathname: '/schedules', params: { tab: 'calendar' } })} style={({ pressed }) => [styles.todayEvent, pressed && styles.todayEventPressed]}><View style={styles.todayTime}><Text style={styles.todayTimeText}>{timeLabel}</Text></View><View style={styles.todayEventCopy}><Text style={styles.todayEventTitle}>{event.title}</Text>{event.location ? <View style={styles.locationRow}><AppIcon name="location" size={15} /><Text style={styles.todayLocation}>{event.location}</Text></View> : null}<Text style={styles.todaySource}>{event.providerLabel} · {event.calendarTitle}</Text></View><AppIcon name="chevronRight" size={20} iconColor={color.textMuted} /></Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  homeHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  homeHeaderCopy: { flex: 1, gap: 1 },
  greeting: { flexShrink: 1, color: color.navy, fontSize: 23, lineHeight: 30, fontWeight: '900', letterSpacing: -0.55 },
  headerMeta: { color: color.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroPressable: { minHeight: 44, borderRadius: radius.lg },
  hero: { minHeight: 148, gap: space.md, padding: space.xl, borderColor: 'transparent', boxShadow: '0 10px 28px rgba(15,23,42,0.055)', elevation: 2 },
  emptyPlan: { minHeight: 132, flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  nextLabel: { color: color.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  heroTitle: { color: color.navy, fontSize: 22, lineHeight: 29, fontWeight: '900', letterSpacing: -0.45 },
  appointmentMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg },
  appointmentDetail: { minHeight: 24, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7 },
  appointmentDetailText: { color: color.deepBlue, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  heroLocation: { flexShrink: 1, color: color.textMuted, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  registeredList: { gap: space.sm },
  registeredPressable: { minHeight: 44, borderRadius: radius.lg },
  registeredCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  registeredTime: { width: 76, alignSelf: 'stretch', justifyContent: 'center', borderRightWidth: 1, borderRightColor: color.border, paddingRight: space.sm },
  registeredTimeText: { color: color.deepBlue, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  registeredDate: { color: color.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  registeredCopy: { flex: 1, gap: 6 },
  registeredTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  registeredTitle: { flex: 1, color: color.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  registeredLocation: { flex: 1, color: color.textMuted, fontSize: 13, lineHeight: 18 },
  weatherPressable: { minHeight: 44, borderRadius: radius.lg },
  weatherCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderColor: 'transparent', boxShadow: '0 6px 18px rgba(15,23,42,0.035)' },
  weatherIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ice, flexShrink: 0 },
  weatherCopy: { flex: 1, gap: 2 },
  weatherCondition: { color: color.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  weatherAdvice: { color: color.textMuted, fontSize: 13, lineHeight: 18 },
  weatherState: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  weatherStateCopy: { flex: 1, gap: 3 },
  weatherStateTitle: { color: color.navy, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  weatherStateBody: { color: color.textMuted, fontSize: 13, lineHeight: 19 },
  weatherLink: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  weatherLinkText: { color: color.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  link: { color: color.deepBlue, fontSize: 14, fontWeight: '800' },
  sectionAction: { minHeight: 44, minWidth: 52, alignItems: 'flex-end', justifyContent: 'center' },
  todayList: { gap: space.sm },
  todayEvent: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  todayEventPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  todayTime: { width: 58, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: color.border, paddingRight: space.sm },
  todayTimeText: { color: color.deepBlue, fontSize: 13, lineHeight: 18, fontWeight: '900', textAlign: 'center' },
  todayEventCopy: { flex: 1, gap: 4 },
  todayEventTitle: { color: color.navy, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  todayLocation: { flex: 1, color: color.textMuted, fontSize: 13, lineHeight: 18 },
  todaySource: { color: color.deepBlue, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  todayState: { minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: space.md },
  todayStateCopy: { flex: 1, gap: 4 },
  todayEmpty: { gap: space.md },
  todayStateIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: color.ice },
  fab: { position: 'absolute', right: 14, zIndex: 10 },
});
