import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { color, radius, space } from '@/constants/design';
import { demoSchedule } from '@/data/demo';
import {
  CalendarProviderKind,
  DeviceCalendarEvent,
  DeviceCalendarPermission,
  DeviceCalendarSnapshot,
  calendarEventToDraftPatch,
  calendarProviderLabel,
  createCalendarPreviewFixture,
  formatCalendarEventTime,
  groupCalendarEventsByDay,
} from '@/lib/device-calendar';
import { deviceCalendarProvider } from '@/lib/device-calendar-provider';
import { useSchedule } from '@/state/schedule-context';

type ScheduleTab = '내 일정' | '캘린더' | '완료';
type CalendarViewState = 'checking' | 'intro' | 'loading' | 'ready' | 'denied' | 'blocked' | 'unavailable' | 'error';
type ProviderFilter = 'all' | CalendarProviderKind;

const emptyPermission: DeviceCalendarPermission = { state: 'undetermined', canAskAgain: true };

export default function SchedulesScreen() {
  const params = useLocalSearchParams<{ e2eCalendar?: string }>();
  const fixtureMode = __DEV__ && params.e2eCalendar === 'events';
  const [tab, setTab] = useState<ScheduleTab>(fixtureMode ? '캘린더' : '내 일정');
  const [calendarView, setCalendarView] = useState<CalendarViewState>(fixtureMode ? 'ready' : 'checking');
  const [permission, setPermission] = useState<DeviceCalendarPermission>(fixtureMode ? { state: 'granted', canAskAgain: false } : emptyPermission);
  const [snapshot, setSnapshot] = useState<DeviceCalendarSnapshot | null>(fixtureMode ? createCalendarPreviewFixture() : null);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [selectedEvent, setSelectedEvent] = useState<DeviceCalendarEvent | null>(null);
  const { activePlan, activeSchedule, beginDraftWith } = useSchedule();
  const schedule = activeSchedule ?? demoSchedule;
  const prepStart = activePlan?.prepStart ?? demoSchedule.prepStart;
  const departure = activePlan?.departure ?? demoSchedule.departure;

  const loadCalendars = useCallback(async () => {
    if (fixtureMode) {
      setSnapshot(createCalendarPreviewFixture());
      setCalendarView('ready');
      return;
    }
    setCalendarView('loading');
    setSelectedEvent(null);
    try {
      setSnapshot(await deviceCalendarProvider.loadUpcoming());
      setCalendarView('ready');
    } catch {
      setCalendarView('error');
    }
  }, [fixtureMode]);

  const checkCalendarAccess = useCallback(async (preserveDenied = false) => {
    if (fixtureMode) {
      setCalendarView('ready');
      return;
    }
    setCalendarView('checking');
    try {
      const next = await deviceCalendarProvider.getPermission();
      setPermission((current) => preserveDenied && next.state !== 'granted' && (current.state === 'denied' || current.state === 'blocked') ? current : next);
      if (next.state === 'granted') await loadCalendars();
      else if (next.state === 'unavailable') setCalendarView('unavailable');
      else if (preserveDenied && (permission.state === 'denied' || permission.state === 'blocked')) setCalendarView(permission.state);
      else setCalendarView(next.state === 'blocked' ? 'blocked' : next.state === 'denied' ? 'denied' : 'intro');
    } catch {
      setCalendarView('error');
    }
  }, [fixtureMode, loadCalendars, permission.state]);

  useEffect(() => {
    if (fixtureMode || tab !== '캘린더') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkCalendarAccess(true);
    });
    return () => subscription.remove();
  }, [checkCalendarAccess, fixtureMode, tab]);

  const requestCalendarAccess = async () => {
    setCalendarView('loading');
    try {
      const next = await deviceCalendarProvider.requestPermission();
      setPermission(next);
      if (next.state === 'granted') await loadCalendars();
      else setCalendarView(next.state === 'blocked' ? 'blocked' : 'denied');
    } catch {
      setCalendarView('error');
    }
  };

  const providers = useMemo(() => {
    const values = new Set(snapshot?.calendars.map((calendar) => calendar.provider) ?? []);
    return (['google', 'apple', 'device', 'other'] as const).filter((provider) => values.has(provider));
  }, [snapshot]);
  const filteredEvents = useMemo(() => snapshot?.events.filter((event) => providerFilter === 'all' || event.provider === providerFilter) ?? [], [providerFilter, snapshot]);
  const eventGroups = useMemo(() => groupCalendarEventsByDay(filteredEvents), [filteredEvents]);

  const importSelectedEvent = () => {
    if (!selectedEvent) return;
    beginDraftWith(calendarEventToDraftPatch(selectedEvent));
    router.push({ pathname: '/create', params: { calendarImport: selectedEvent.allDay ? 'all-day' : 'timed' } });
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Header title="일정" eyebrow="다가오는 약속과 기기 캘린더를 확인하세요" />
        <View accessibilityRole="tablist" style={styles.tabs}>
          {(['내 일정', '캘린더', '완료'] as const).map((item) => (
            <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => { setTab(item); if (item === '캘린더') void checkCalendarAccess(); }} style={[styles.tab, tab === item && styles.tabActive]}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.tabDescription}>{tab} 화면입니다.</Text>

        {tab === '내 일정' ? <UpcomingSchedule schedule={schedule} prepStart={prepStart} departure={departure} /> : null}
        {tab === '완료' ? <CompletedSchedule /> : null}
        {tab === '캘린더' ? <CalendarPanel
          calendarView={calendarView}
          permission={permission}
          snapshot={snapshot}
          providerFilter={providerFilter}
          providers={providers}
          eventGroups={eventGroups}
          selectedEvent={selectedEvent}
          onProviderFilter={setProviderFilter}
          onSelectEvent={setSelectedEvent}
          onRequest={() => void requestCalendarAccess()}
          onRefresh={() => void loadCalendars()}
          onManual={() => router.push({ pathname: '/create', params: { new: '1' } })}
          onSettings={() => void Linking.openSettings()}
          onImport={importSelectedEvent}
        /> : null}
      </Screen>
      <BottomNav />
    </View>
  );
}

function UpcomingSchedule({ schedule, prepStart, departure }: { schedule: Pick<typeof demoSchedule, 'title' | 'date' | 'appointmentTime' | 'destination'>; prepStart: string; departure: string }) {
  return <><Text style={styles.date}>{schedule.date || '오늘'}</Text><Pressable accessibilityRole="button" accessibilityHint="준비 계획을 엽니다" onPress={() => router.push('/plan')}><Card style={styles.schedule}><View style={styles.timeRail}><Text style={styles.time}>{schedule.appointmentTime}</Text><View style={styles.line} /></View><View style={styles.flexContent}><StatusPill label="준비 전" /><Text style={type.heading}>{schedule.title}</Text><View style={styles.locationRow}><AppIcon name="location" size={16} /><Text style={type.bodyMuted}>{schedule.destination}</Text></View><Text style={styles.meta}>{prepStart} 준비 시작 · {departure} 출발</Text></View><AppIcon name="chevronRight" size={22} iconColor={color.textMuted} style={styles.arrow} /></Card></Pressable><Button label="새 일정 만들기" onPress={() => router.push({ pathname: '/create', params: { new: '1' } })} /></>;
}

function CompletedSchedule() {
  return <><Text style={styles.date}>최근 완료</Text><Pressable accessibilityRole="button" accessibilityHint="완료 기록을 엽니다" onPress={() => router.push('/complete')}><Card style={styles.schedule}><View style={styles.timeRail}><Text style={styles.time}>18:30</Text></View><View style={styles.flexContent}><StatusPill label="3분 일찍 도착" tone="success" /><Text style={type.heading}>광안리 저녁 약속</Text><View style={styles.locationRow}><AppIcon name="location" size={16} /><Text style={type.bodyMuted}>광안리 해변 식당</Text></View><Text style={styles.meta}>실제 준비·이동 기록 보기</Text></View><AppIcon name="chevronRight" size={22} iconColor={color.textMuted} style={styles.arrow} /></Card></Pressable></>;
}

type CalendarPanelProps = {
  calendarView: CalendarViewState;
  permission: DeviceCalendarPermission;
  snapshot: DeviceCalendarSnapshot | null;
  providerFilter: ProviderFilter;
  providers: CalendarProviderKind[];
  eventGroups: ReturnType<typeof groupCalendarEventsByDay>;
  selectedEvent: DeviceCalendarEvent | null;
  onProviderFilter: (provider: ProviderFilter) => void;
  onSelectEvent: (event: DeviceCalendarEvent) => void;
  onRequest: () => void;
  onRefresh: () => void;
  onManual: () => void;
  onSettings: () => void;
  onImport: () => void;
};

function CalendarPanel(props: CalendarPanelProps) {
  if (props.calendarView === 'checking' || props.calendarView === 'loading') return <StateCard icon="calendar" title={props.calendarView === 'checking' ? '캘린더 연결 상태를 확인하고 있어요' : '향후 30일 일정을 불러오고 있어요'} body="기기에 있는 일정만 잠시 확인합니다." />;
  if (props.calendarView === 'intro') return <><StateCard icon="calendar" title="기기 캘린더 일정을 확인할까요?" body="Google·Apple/iCloud·기기 캘린더의 향후 30일 일정을 읽습니다. 선택한 일정만 새 ON:TIME 초안으로 가져오며 원문은 서버에 저장하지 않습니다." /><Button label="캘린더 연결하기" onPress={props.onRequest} /><Button label="직접 일정 만들기" variant="secondary" onPress={props.onManual} /></>;
  if (props.calendarView === 'denied') return <><StateCard icon="error" title="캘린더 권한이 필요해요" body="권한을 다시 허용하거나 직접 일정을 만들 수 있습니다." /><Button label="권한 다시 요청" onPress={props.onRequest} /><Button label="직접 일정 만들기" variant="secondary" onPress={props.onManual} /></>;
  if (props.calendarView === 'blocked' || (props.permission.state === 'blocked' && props.calendarView !== 'ready')) return <><StateCard icon="error" title="기기 설정에서 캘린더 권한을 켜 주세요" body="설정에서 ON:TIME의 캘린더 권한을 허용한 뒤 앱으로 돌아오면 자동으로 다시 확인합니다." /><Button label="기기 설정 열기" onPress={props.onSettings} /><Button label="직접 일정 만들기" variant="secondary" onPress={props.onManual} /></>;
  if (props.calendarView === 'unavailable') return <><StateCard icon="calendar" title="이 기기에서는 캘린더 연결을 사용할 수 없어요" body="기기 캘린더 연결은 iOS·Android 개발 빌드에서 제공됩니다. 지금은 직접 일정을 등록해 주세요." /><Button label="직접 일정 만들기" onPress={props.onManual} /></>;
  if (props.calendarView === 'error') return <><StateCard icon="error" title="캘린더를 불러오지 못했어요" body="연결 상태를 확인한 뒤 다시 시도하거나 직접 등록해 주세요." /><Button label="다시 불러오기" onPress={props.onRefresh} /><Button label="직접 일정 만들기" variant="secondary" onPress={props.onManual} /></>;

  if (!props.snapshot?.calendars.length) return <><StateCard icon="calendar" title="연결된 캘린더가 없어요" body="기기 설정에서 Google·iCloud 계정의 캘린더 동기화를 켜거나 직접 일정을 등록해 주세요." /><Button label="새로고침" onPress={props.onRefresh} /><Button label="직접 일정 만들기" variant="secondary" onPress={props.onManual} /></>;

  return <>
    <View style={styles.calendarHeadingRow}><View style={styles.flexContent}><Text accessibilityRole="header" style={type.heading}>기기 캘린더 일정</Text><Text style={type.caption}>오늘부터 30일 · 가져오기 전에는 초안이 바뀌지 않아요</Text></View><Pressable accessibilityRole="button" accessibilityLabel="캘린더 새로고침" onPress={props.onRefresh} style={styles.textButton}><Text style={styles.textButtonLabel}>새로고침</Text></Pressable></View>
    <View style={styles.filters}><FilterChip label="전체" active={props.providerFilter === 'all'} onPress={() => props.onProviderFilter('all')} />{props.providers.map((provider) => <FilterChip key={provider} label={calendarProviderLabel(provider)} active={props.providerFilter === provider} onPress={() => props.onProviderFilter(provider)} />)}</View>
    {props.eventGroups.length ? props.eventGroups.map((group) => <View key={group.date} style={styles.eventGroup}><Text accessibilityRole="header" style={styles.date}>{group.label}</Text>{group.events.map((event) => <Fragment key={event.occurrenceKey}><EventCard event={event} selected={props.selectedEvent?.occurrenceKey === event.occurrenceKey} onPress={() => props.onSelectEvent(event)} />{props.selectedEvent?.occurrenceKey === event.occurrenceKey ? <EventPreview event={event} onImport={props.onImport} /> : null}</Fragment>)}</View>) : <StateCard icon="calendar" title="표시할 일정이 없어요" body={props.providerFilter === 'all' ? '향후 30일에 등록된 일정이 없습니다.' : '선택한 캘린더 공급자에는 향후 30일 일정이 없습니다.'} />}
  </>;
}

function StateCard({ icon, title, body }: { icon: 'calendar' | 'error'; title: string; body: string }) {
  return <Card style={styles.stateCard}><View style={styles.stateIcon}><AppIcon name={icon} size={26} /></View><Text accessibilityRole="header" style={type.heading}>{title}</Text><Text style={type.bodyMuted}>{body}</Text></Card>;
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}><Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{label}</Text></Pressable>;
}

function EventCard({ event, selected, onPress }: { event: DeviceCalendarEvent; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${event.title}, ${formatCalendarEventTime(event)}, ${event.providerLabel} ${event.calendarTitle}`} onPress={onPress} style={[styles.eventCard, selected && styles.eventCardSelected]}><View style={styles.eventTime}><Text style={styles.eventTimeText}>{event.allDay ? '종일' : formatCalendarEventTime(event).split('–')[0]}</Text></View><View style={styles.flexContent}><Text style={styles.eventTitle}>{event.title}</Text>{event.location ? <View style={styles.locationRow}><AppIcon name="location" size={15} /><Text style={styles.eventLocation}>{event.location}</Text></View> : null}<Text style={styles.eventSource}>{event.providerLabel} · {event.calendarTitle}</Text></View><AppIcon name="chevronRight" size={20} iconColor={selected ? color.deepBlue : color.textMuted} style={styles.arrow} /></Pressable>;
}

function EventPreview({ event, onImport }: { event: DeviceCalendarEvent; onImport: () => void }) {
  return <Card style={styles.preview} accessibilityLabel="선택한 일정 미리보기"><View style={styles.previewTitleRow}><StatusPill label="가져오기 전 미리보기" /><Text style={styles.previewSource}>{event.providerLabel} · {event.calendarTitle}</Text></View><Text style={type.heading}>{event.title}</Text><Text style={type.body}>{formatCalendarEventTime(event)}{event.location ? ` · ${event.location}` : ''}</Text>{event.allDay ? <Text style={styles.previewWarning}>종일 일정은 약속 시간을 직접 입력해야 합니다.</Text> : null}<Button label="이 일정 가져오기" onPress={onImport} /></Card>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: color.surfaceMuted, borderRadius: radius.pill, padding: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  tabActive: { backgroundColor: color.surface },
  tabText: { color: color.textMuted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: color.deepBlue, fontWeight: '900' },
  tabDescription: { ...type.caption, marginTop: -space.md },
  date: { fontSize: 14, color: color.textMuted, fontWeight: '800', marginTop: space.sm },
  schedule: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  timeRail: { width: 54 }, time: { fontSize: 17, color: color.navy, fontWeight: '900' }, line: { width: 2, height: 70, backgroundColor: color.cyan, marginTop: 8, marginLeft: 18 },
  flexContent: { flex: 1, gap: 5 }, meta: { fontSize: 12, color: color.deepBlue, fontWeight: '700', marginTop: 4 }, locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, arrow: { alignSelf: 'center' },
  stateCard: { alignItems: 'center', gap: space.md }, stateIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: color.ice, alignItems: 'center', justifyContent: 'center' },
  calendarHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm }, textButtonLabel: { color: color.deepBlue, fontSize: 13, fontWeight: '800' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface }, filterChipActive: { backgroundColor: color.navy, borderColor: color.navy }, filterLabel: { color: color.textMuted, fontSize: 13, fontWeight: '800' }, filterLabelActive: { color: color.surface },
  eventGroup: { gap: space.sm }, eventCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface }, eventCardSelected: { borderWidth: 2, borderColor: color.cyan, backgroundColor: '#F7FDFF' }, eventTime: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: color.border, paddingRight: space.sm }, eventTimeText: { color: color.deepBlue, fontSize: 14, fontWeight: '900' }, eventTitle: { color: color.navy, fontSize: 16, lineHeight: 22, fontWeight: '900' }, eventLocation: { flex: 1, color: color.textMuted, fontSize: 13, lineHeight: 18 }, eventSource: { color: color.deepBlue, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  preview: { gap: space.md, borderColor: color.cyan }, previewTitleRow: { gap: space.sm }, previewSource: { color: color.textMuted, fontSize: 12, fontWeight: '700' }, previewWarning: { color: color.warning, fontSize: 13, lineHeight: 19, fontWeight: '800' },
});
