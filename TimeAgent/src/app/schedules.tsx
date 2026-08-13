import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BottomNav } from '@/components/bottom-nav';
import { Button, Card, Header, Screen, StatusPill, appType, useAppType } from '@/components/app-ui';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { ConfirmedSchedulePlan } from '@/lib/confirmed-plans';
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

type ScheduleTab = '내 일정' | '캘린더' | '지난 일정';
type CalendarViewState = 'checking' | 'intro' | 'loading' | 'ready' | 'denied' | 'blocked' | 'unavailable' | 'error';
type ProviderFilter = 'all' | CalendarProviderKind;

const emptyPermission: DeviceCalendarPermission = { state: 'undetermined', canAskAgain: true };

export default function SchedulesScreen() {
  const styles = useThemedStyles(createStyles);
  const params = useLocalSearchParams<{ e2eCalendar?: string; tab?: string }>();
  const fixtureMode = __DEV__ && params.e2eCalendar === 'events';
  const [tab, setTab] = useState<ScheduleTab>(params.tab === 'past' ? '지난 일정' : fixtureMode || params.tab === 'calendar' ? '캘린더' : '내 일정');
  const [calendarView, setCalendarView] = useState<CalendarViewState>(fixtureMode ? 'ready' : 'checking');
  const [permission, setPermission] = useState<DeviceCalendarPermission>(fixtureMode ? { state: 'granted', canAskAgain: false } : emptyPermission);
  const [snapshot, setSnapshot] = useState<DeviceCalendarSnapshot | null>(fixtureMode ? createCalendarPreviewFixture() : null);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [selectedEvent, setSelectedEvent] = useState<DeviceCalendarEvent | null>(null);
  const { beginDraftWith, confirmedPlans, confirmedPlansStatus, deleteConfirmedPlan, selectConfirmedPlan } = useSchedule();
  const upcomingPlans = confirmedPlans.filter((plan) => plan.state === 'scheduled' || plan.state === 'active');
  const closedPlans = confirmedPlans
    .filter((plan) => plan.state === 'completed' || plan.state === 'incomplete')
    .sort((left, right) => right.appointmentAt - left.appointmentAt);

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
    if (fixtureMode || tab !== '캘린더' || calendarView !== 'checking') return;
    const initialCheck = setTimeout(() => void checkCalendarAccess(), 0);
    return () => clearTimeout(initialCheck);
  }, [calendarView, checkCalendarAccess, fixtureMode, tab]);

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
          {(['내 일정', '캘린더', '지난 일정'] as const).map((item) => (
            <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => { setTab(item); if (item === '캘린더') void checkCalendarAccess(); }} style={[styles.tab, tab === item && styles.tabActive]}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.tabDescription}>{tab} 화면입니다.</Text>

        {tab === '내 일정' ? <UpcomingSchedules plans={upcomingPlans} status={confirmedPlansStatus} onSelect={(id) => { selectConfirmedPlan(id); router.push('/plan'); }} /> : null}
        {tab === '지난 일정' ? <ClosedSchedules plans={closedPlans} status={confirmedPlansStatus} onDelete={deleteConfirmedPlan} /> : null}
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
          onManual={() => router.push('/voice-schedule')}
          onSettings={() => void Linking.openSettings()}
          onImport={importSelectedEvent}
        /> : null}
      </Screen>
      <BottomNav />
    </View>
  );
}

function UpcomingSchedules({ plans, status, onSelect }: { plans: ConfirmedSchedulePlan[]; status: 'loading' | 'saving' | 'saved' | 'error'; onSelect: (id: string) => void }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  if (status === 'loading') return <StateCard icon="calendar" title="저장된 계획을 불러오고 있어요" body="확정한 계획을 시간순으로 정리합니다." />;
  return <>
    {status === 'error' ? <StateCard icon="error" title="저장된 계획을 불러오지 못했어요" body="앱을 다시 열어 확인해 주세요. 새 계획은 입력 화면에 자동 저장됩니다." /> : null}
    {!plans.length && status !== 'error' ? <StateCard icon="calendar" title="확정된 계획이 없어요" body="계획을 만든 뒤 계획 확정을 누르면 이곳에 저장됩니다." /> : null}
    {plans.map((item) => <View key={item.id} style={styles.planGroup}>
      <Text style={styles.date}>{item.schedule.date || '오늘'}</Text>
      <Pressable accessibilityRole="button" accessibilityHint="저장된 준비 계획을 엽니다" onPress={() => onSelect(item.id)}>
        <Card style={styles.schedule}><View style={styles.timeRail}><Text style={styles.time}>{item.schedule.appointmentTime}</Text><View style={styles.line} /></View><View style={styles.flexContent}><StatusPill label={item.state === 'active' ? '자동 실행 중' : `${item.plan.prepStart} 자동 시작`} tone={item.state === 'active' ? 'success' : 'info'} /><Text style={type.heading}>{item.schedule.title}</Text><View style={styles.locationRow}><AppIcon name="location" size={16} /><Text style={type.bodyMuted}>{item.schedule.destination}</Text></View><Text style={styles.meta}>{item.plan.prepStart} 준비 시작 · {item.plan.departure} 출발</Text></View><AppIcon name="chevronRight" size={22} iconColor={c.textMuted} style={styles.arrow} /></Card>
      </Pressable>
    </View>)}
    <Button label="말로 새 일정 만들기" onPress={() => router.push('/voice-schedule')} />
  </>;
}

function ClosedSchedules({ plans, status, onDelete }: {
  plans: ConfirmedSchedulePlan[];
  status: 'loading' | 'saving' | 'saved' | 'error';
  onDelete: (id: string) => Promise<void>;
}) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  // Deleting a record cannot be undone, so the choice is confirmed on the card it belongs to.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  if (status === 'loading') return <StateCard icon="calendar" title="지난 일정을 정리하고 있어요" body="완료 여부를 확인해 종결 상태로 표시합니다." />;
  if (!plans.length) return <StateCard icon="calendar" title="종결된 일정이 없어요" body="시간이 지난 일정은 완료 또는 미완료로 이곳에 정리됩니다." />;
  return <>
    <Text style={styles.date}>지난 일정 {plans.length}개</Text>
    {plans.map((item) => <Card key={item.id} style={styles.schedule}>
      <View style={styles.timeRail}><Text style={styles.time}>{item.schedule.appointmentTime}</Text><Text style={styles.closedDate}>{new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(item.appointmentAt)}</Text></View>
      <View style={styles.flexContent}>
        <StatusPill
          label={item.state === 'completed' ? item.completion?.onTime === true ? '정시 도착' : item.completion?.onTime === false ? '지각 도착' : '완료' : '미완료'}
          tone={item.state === 'completed' ? item.completion?.onTime === false ? 'warning' : 'success' : 'warning'}
        />
        <Text style={type.heading}>{item.schedule.title}</Text>
        <View style={styles.locationRow}><AppIcon name="location" size={16} /><Text style={type.bodyMuted}>{item.schedule.destination}</Text></View>
        <Text style={styles.meta}>{item.state === 'completed' ? item.completion ? `${item.completion.delayMinutes > 0 ? `${item.completion.delayMinutes}분 지연 기록` : '지연 없이 완료'} · 준비 행동 완료` : '준비 행동을 모두 완료한 일정' : '약속 시간까지 완료되지 않은 일정'}</Text>
        {pendingDeleteId === item.id ? <View style={styles.closedConfirm} accessibilityRole="alert">
          <Text style={type.bodyMuted}>이 기록을 삭제하면 되돌릴 수 없어요.</Text>
          <View style={styles.closedActions}>
            <View style={styles.closedAction}><Button label="삭제 취소" variant="secondary" onPress={() => setPendingDeleteId(null)} /></View>
            <View style={styles.closedAction}><Button label="기록 삭제 확인" variant="danger" onPress={() => { setPendingDeleteId(null); void onDelete(item.id); }} /></View>
          </View>
        </View> : <View style={styles.closedActions}>
          <Button label={`${item.schedule.title} 기록 삭제`} variant="dangerGhost" onPress={() => setPendingDeleteId(item.id)} />
        </View>}
      </View>
    </Card>)}
  </>;
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
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  if (props.calendarView === 'checking' || props.calendarView === 'loading') return <StateCard icon="calendar" title={props.calendarView === 'checking' ? '캘린더 연결 상태를 확인하고 있어요' : '향후 30일 일정을 불러오고 있어요'} body="기기에 있는 일정만 잠시 확인합니다." />;
  if (props.calendarView === 'intro') return <><StateCard icon="calendar" title="기기 캘린더 일정을 확인할까요?" body="Google·Apple/iCloud·기기 캘린더의 향후 30일 일정을 읽습니다. 선택한 일정만 새 TimeAgent 초안으로 가져오며 원문은 서버에 저장하지 않습니다." /><Button label="캘린더 연결하기" onPress={props.onRequest} /><Button label="말로 일정 만들기" variant="secondary" onPress={props.onManual} /></>;
  if (props.calendarView === 'denied') return <><StateCard icon="error" title="캘린더 권한이 필요해요" body="권한을 다시 허용하거나 말로 일정을 만들 수 있습니다." /><Button label="권한 다시 요청" onPress={props.onRequest} /><Button label="말로 일정 만들기" variant="secondary" onPress={props.onManual} /></>;
  if (props.calendarView === 'blocked' || (props.permission.state === 'blocked' && props.calendarView !== 'ready')) return <><StateCard icon="error" title="기기 설정에서 캘린더 권한을 켜 주세요" body="설정에서 TimeAgent의 캘린더 권한을 허용한 뒤 앱으로 돌아오면 자동으로 다시 확인합니다." /><Button label="기기 설정 열기" onPress={props.onSettings} /><Button label="말로 일정 만들기" variant="secondary" onPress={props.onManual} /></>;
  if (props.calendarView === 'unavailable') return <><StateCard icon="calendar" title="이 기기에서는 캘린더 연결을 사용할 수 없어요" body="기기 캘린더 연결은 iOS·Android 개발 빌드에서 제공됩니다. 지금은 말로 일정을 등록해 주세요." /><Button label="말로 일정 만들기" onPress={props.onManual} /></>;
  if (props.calendarView === 'error') return <><StateCard icon="error" title="캘린더를 불러오지 못했어요" body="연결 상태를 확인한 뒤 다시 시도하거나 말로 등록해 주세요." /><Button label="다시 불러오기" onPress={props.onRefresh} /><Button label="말로 일정 만들기" variant="secondary" onPress={props.onManual} /></>;

  if (!props.snapshot?.calendars.length) return <><StateCard icon="calendar" title="연결된 캘린더가 없어요" body="기기 설정에서 Google·iCloud 계정의 캘린더 동기화를 켜거나 말로 일정을 등록해 주세요." /><Button label="새로고침" onPress={props.onRefresh} /><Button label="말로 일정 만들기" variant="secondary" onPress={props.onManual} /></>;

  return <>
    <View style={styles.calendarHeadingRow}><View style={styles.flexContent}><Text accessibilityRole="header" style={type.heading}>기기 캘린더 일정</Text><Text style={type.caption}>오늘부터 30일 · 가져오기 전에는 초안이 바뀌지 않아요</Text></View><Pressable accessibilityRole="button" accessibilityLabel="캘린더 새로고침" onPress={props.onRefresh} style={styles.textButton}><Text style={styles.textButtonLabel}>새로고침</Text></Pressable></View>
    <View style={styles.filters}><FilterChip label="전체" active={props.providerFilter === 'all'} onPress={() => props.onProviderFilter('all')} />{props.providers.map((provider) => <FilterChip key={provider} label={calendarProviderLabel(provider)} active={props.providerFilter === provider} onPress={() => props.onProviderFilter(provider)} />)}</View>
    {props.eventGroups.length ? props.eventGroups.map((group) => <View key={group.date} style={styles.eventGroup}><Text accessibilityRole="header" style={styles.date}>{group.label}</Text>{group.events.map((event) => <Fragment key={event.occurrenceKey}><EventCard event={event} selected={props.selectedEvent?.occurrenceKey === event.occurrenceKey} onPress={() => props.onSelectEvent(event)} />{props.selectedEvent?.occurrenceKey === event.occurrenceKey ? <EventPreview event={event} onImport={props.onImport} /> : null}</Fragment>)}</View>) : <StateCard icon="calendar" title="표시할 일정이 없어요" body={props.providerFilter === 'all' ? '향후 30일에 등록된 일정이 없습니다.' : '선택한 캘린더 공급자에는 향후 30일 일정이 없습니다.'} />}
  </>;
}

function StateCard({ icon, title, body }: { icon: 'calendar' | 'error'; title: string; body: string }) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  return <Card style={styles.stateCard}><View style={styles.stateIcon}><AppIcon name={icon} size={26} /></View><Text accessibilityRole="header" style={type.heading}>{title}</Text><Text style={type.bodyMuted}>{body}</Text></Card>;
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}><Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{label}</Text></Pressable>;
}

function EventCard({ event, selected, onPress }: { event: DeviceCalendarEvent; selected: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${event.title}, ${formatCalendarEventTime(event)}, ${event.providerLabel} ${event.calendarTitle}`} onPress={onPress} style={[styles.eventCard, selected && styles.eventCardSelected]}><View style={styles.eventTime}><Text style={styles.eventTimeText}>{event.allDay ? '종일' : formatCalendarEventTime(event).split('–')[0]}</Text></View><View style={styles.flexContent}><Text style={styles.eventTitle}>{event.title}</Text>{event.location ? <View style={styles.locationRow}><AppIcon name="location" size={15} /><Text style={styles.eventLocation}>{event.location}</Text></View> : null}<Text style={styles.eventSource}>{event.providerLabel} · {event.calendarTitle}</Text></View><AppIcon name="chevronRight" size={20} iconColor={selected ? c.deepBlue : c.textMuted} style={styles.arrow} /></Pressable>;
}

function EventPreview({ event, onImport }: { event: DeviceCalendarEvent; onImport: () => void }) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  return <Card style={styles.preview} accessibilityLabel="선택한 일정 미리보기"><View style={styles.previewTitleRow}><StatusPill label="가져오기 전 미리보기" /><Text style={styles.previewSource}>{event.providerLabel} · {event.calendarTitle}</Text></View><Text style={type.heading}>{event.title}</Text><Text style={type.body}>{formatCalendarEventTime(event)}{event.location ? ` · ${event.location}` : ''}</Text>{event.allDay ? <Text style={styles.previewWarning}>종일 일정은 약속 시간을 직접 입력해야 합니다.</Text> : null}<Button label="이 일정 가져오기" onPress={onImport} /></Card>;
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: c.surfaceMuted, borderRadius: radius.pill, padding: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  tabActive: { backgroundColor: c.surface },
  tabText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: c.deepBlue, fontWeight: '900' },
  tabDescription: { ...type.caption, marginTop: -space.md },
  planGroup: { gap: space.sm }, date: { fontSize: 14, color: c.textMuted, fontWeight: '800', marginTop: space.sm },
  schedule: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  closedConfirm: { gap: space.sm, marginTop: space.sm }, closedActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm }, closedAction: { flex: 1 },
  timeRail: { width: 54, gap: 4 }, time: { fontSize: 17, color: c.navy, fontWeight: '900' }, closedDate: { fontSize: 12, lineHeight: 17, color: c.textMuted, fontWeight: '700' }, line: { width: 2, height: 70, backgroundColor: c.cyan, marginTop: 8, marginLeft: 18 },
  flexContent: { flex: 1, gap: 5 }, meta: { fontSize: 12, color: c.deepBlue, fontWeight: '700', marginTop: 4 }, locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, arrow: { alignSelf: 'center' },
  stateCard: { alignItems: 'center', gap: space.md }, stateIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.ice, alignItems: 'center', justifyContent: 'center' },
  calendarHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm }, textButtonLabel: { color: c.deepBlue, fontSize: 13, fontWeight: '800' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, filterChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }, filterChipActive: { backgroundColor: c.surfaceInverse, borderColor: c.surfaceInverse }, filterLabel: { color: c.textMuted, fontSize: 13, fontWeight: '800' }, filterLabelActive: { color: c.onInverse },
  eventGroup: { gap: space.sm }, eventCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface }, eventCardSelected: { borderWidth: 2, borderColor: c.cyan, backgroundColor: c.selectedSoft }, eventTime: { width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: c.border, paddingRight: space.sm }, eventTimeText: { color: c.deepBlue, fontSize: 14, fontWeight: '900' }, eventTitle: { color: c.navy, fontSize: 16, lineHeight: 22, fontWeight: '900' }, eventLocation: { flex: 1, color: c.textMuted, fontSize: 13, lineHeight: 18 }, eventSource: { color: c.deepBlue, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  preview: { gap: space.md, borderColor: c.cyan }, previewTitleRow: { gap: space.sm }, previewSource: { color: c.textMuted, fontSize: 12, fontWeight: '700' }, previewWarning: { color: c.warning, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  });
};
