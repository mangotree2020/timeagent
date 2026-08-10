import { ScheduleDraft } from '@/lib/schedule-draft';

export type CalendarProviderKind = 'google' | 'apple' | 'device' | 'other';
export type CalendarPermissionState = 'undetermined' | 'granted' | 'denied' | 'blocked' | 'unavailable';

export type RawDeviceCalendar = {
  id: string;
  title: string;
  sourceName?: string | null;
  sourceType?: string | null;
  ownerAccount?: string | null;
  isLocalAccount?: boolean;
  color?: string | null;
  isVisible?: boolean;
  isSynced?: boolean;
};

export type RawDeviceCalendarEvent = {
  id: string;
  calendarId: string;
  title?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay?: boolean;
  location?: string | null;
  status?: string | null;
};

export type DeviceCalendar = {
  id: string;
  title: string;
  provider: CalendarProviderKind;
  providerLabel: string;
  accountLabel: string;
  color: string | null;
};

export type DeviceCalendarEvent = {
  id: string;
  occurrenceKey: string;
  calendarId: string;
  calendarTitle: string;
  provider: CalendarProviderKind;
  providerLabel: string;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location: string;
};

export type DeviceCalendarSnapshot = {
  calendars: DeviceCalendar[];
  events: DeviceCalendarEvent[];
  rangeStart: string;
  rangeEnd: string;
};

export type DeviceCalendarPermission = {
  state: CalendarPermissionState;
  canAskAgain: boolean;
};

export type DeviceCalendarProvider = {
  getPermission: () => Promise<DeviceCalendarPermission>;
  requestPermission: () => Promise<DeviceCalendarPermission>;
  loadUpcoming: (now?: Date, days?: number) => Promise<DeviceCalendarSnapshot>;
};

export function calendarProviderLabel(provider: CalendarProviderKind) {
  if (provider === 'google') return 'Google';
  if (provider === 'apple') return 'Apple/iCloud';
  if (provider === 'device') return '기기';
  return '기타';
}

export function classifyCalendarProvider(source: Pick<RawDeviceCalendar, 'sourceName' | 'sourceType' | 'ownerAccount' | 'isLocalAccount'>): CalendarProviderKind {
  const signature = [source.sourceName, source.sourceType, source.ownerAccount].filter(Boolean).join(' ').toLowerCase();
  if (/google|gmail|com\.google/.test(signature)) return 'google';
  if (/icloud|mobileme|apple/.test(signature)) return 'apple';
  if (source.isLocalAccount || /(^|\s)local($|\s)|phone|device|samsung|휴대전화|내 캘린더/.test(signature)) return 'device';
  return 'other';
}

export function normalizeDeviceCalendars(values: RawDeviceCalendar[]) {
  return values
    .filter((calendar) => calendar.id && calendar.isVisible !== false && calendar.isSynced !== false)
    .map<DeviceCalendar>((calendar) => {
      const provider = classifyCalendarProvider(calendar);
      return {
        id: calendar.id,
        title: calendar.title.trim() || '이름 없는 캘린더',
        provider,
        providerLabel: calendarProviderLabel(provider),
        accountLabel: calendar.ownerAccount?.trim() || calendar.sourceName?.trim() || calendarProviderLabel(provider),
        color: typeof calendar.color === 'string' && /^#[0-9a-f]{6,8}$/i.test(calendar.color) ? calendar.color : null,
      };
    })
    .sort((left, right) => left.providerLabel.localeCompare(right.providerLabel, 'ko') || left.title.localeCompare(right.title, 'ko'));
}

export function normalizeDeviceCalendarEvents(values: RawDeviceCalendarEvent[], calendars: DeviceCalendar[]) {
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  return values.flatMap<DeviceCalendarEvent>((event) => {
    const calendar = calendarById.get(event.calendarId);
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);
    if (!calendar || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || event.status === 'canceled') return [];
    const allDay = Boolean(event.allDay);
    const startDate = allDay ? `${rawCalendarDateKey(event.startDate, start)}T00:00:00.000Z` : start.toISOString();
    const endDate = allDay ? `${rawCalendarDateKey(event.endDate, end)}T00:00:00.000Z` : end.toISOString();
    return [{
      id: event.id,
      occurrenceKey: `${event.id}:${startDate}`,
      calendarId: calendar.id,
      calendarTitle: calendar.title,
      provider: calendar.provider,
      providerLabel: calendar.providerLabel,
      title: event.title?.trim() || '제목 없는 일정',
      startDate,
      endDate,
      allDay,
      location: event.location?.trim() || '',
    }];
  }).sort(compareCalendarEvents);
}

export function upcomingCalendarRange(now = new Date(), days = 30) {
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + Math.max(1, Math.floor(days)));
  return { rangeStart, rangeEnd };
}

export function calendarEventsForLocalDay(events: DeviceCalendarEvent[], day = new Date()) {
  const { rangeStart, rangeEnd } = upcomingCalendarRange(day, 1);
  const start = rangeStart.getTime();
  const end = rangeEnd.getTime();

  return events
    .filter((event) => {
      if (event.allDay) {
        const dayKey = localDateKey(day);
        return event.startDate.slice(0, 10) <= dayKey && event.endDate.slice(0, 10) > dayKey;
      }
      return new Date(event.startDate).getTime() < end && new Date(event.endDate).getTime() > start;
    })
    .sort((left, right) => {
      if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
      const leftStart = new Date(left.startDate).getTime();
      const rightStart = new Date(right.startDate).getTime();
      const leftOngoing = leftStart < start;
      const rightOngoing = rightStart < start;
      if (leftOngoing !== rightOngoing) return leftOngoing ? -1 : 1;
      if (leftStart !== rightStart) return leftStart - rightStart;
      return left.title.localeCompare(right.title, 'ko');
    });
}

export function calendarEventsForLocalDateRange(
  events: DeviceCalendarEvent[],
  day = new Date(),
  days = 2,
) {
  const { rangeStart, rangeEnd } = upcomingCalendarRange(day, days);
  const start = rangeStart.getTime();
  const end = rangeEnd.getTime();
  const startKey = localDateKey(rangeStart);
  const endKey = localDateKey(rangeEnd);

  return events
    .filter((event) => {
      if (event.allDay) {
        return event.startDate.slice(0, 10) < endKey && event.endDate.slice(0, 10) > startKey;
      }
      return new Date(event.startDate).getTime() < end && new Date(event.endDate).getTime() > start;
    })
    .sort((left, right) => {
      const leftStart = new Date(left.startDate).getTime();
      const rightStart = new Date(right.startDate).getTime();
      const leftDay = leftStart < start ? startKey : eventLocalDateKey(left);
      const rightDay = rightStart < start ? startKey : eventLocalDateKey(right);
      if (leftDay !== rightDay) return leftDay.localeCompare(rightDay);
      if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
      const leftOngoing = leftStart < start;
      const rightOngoing = rightStart < start;
      if (leftOngoing !== rightOngoing) return leftOngoing ? -1 : 1;
      if (leftStart !== rightStart) return leftStart - rightStart;
      return left.title.localeCompare(right.title, 'ko');
    });
}

export function formatTodayCalendarEventTime(event: DeviceCalendarEvent, day = new Date()) {
  if (event.allDay) return '종일';
  const { rangeStart } = upcomingCalendarRange(day, 1);
  if (new Date(event.startDate).getTime() < rangeStart.getTime()) return '진행 중';
  return localTime(new Date(event.startDate));
}

export function formatTodayTomorrowCalendarEventTime(event: DeviceCalendarEvent, day = new Date()) {
  const { rangeStart } = upcomingCalendarRange(day, 1);
  const startsBeforeToday = event.allDay
    ? event.startDate.slice(0, 10) < localDateKey(rangeStart)
    : new Date(event.startDate).getTime() < rangeStart.getTime();
  const dateLabel = startsBeforeToday || eventLocalDateKey(event) === localDateKey(rangeStart) ? '오늘' : '내일';
  const timeLabel = event.allDay ? '종일' : startsBeforeToday ? '진행 중' : localTime(new Date(event.startDate));
  return `${dateLabel}\n${timeLabel}`;
}

export function groupCalendarEventsByDay(events: DeviceCalendarEvent[]) {
  return events.reduce<{ date: string; label: string; events: DeviceCalendarEvent[] }[]>((groups, event) => {
    const date = localDateKey(new Date(event.startDate));
    const current = groups.at(-1);
    if (current?.date === date) {
      current.events.push(event);
    } else {
      groups.push({ date, label: formatCalendarDay(new Date(event.startDate)), events: [event] });
    }
    return groups;
  }, []);
}

export function formatCalendarEventTime(event: DeviceCalendarEvent) {
  if (event.allDay) return '종일';
  return `${localTime(new Date(event.startDate))}–${localTime(new Date(event.endDate))}`;
}

export function calendarEventToDraftPatch(event: DeviceCalendarEvent): Partial<ScheduleDraft> {
  return {
    step: 0,
    title: event.title,
    date: localDateKey(new Date(event.startDate)),
    appointmentTime: event.allDay ? '' : localTime(new Date(event.startDate)),
    destination: event.location,
    destinationAddress: event.location,
    destinationCoordinate: null,
  };
}

export function createCalendarPreviewFixture(): DeviceCalendarSnapshot {
  const calendars = normalizeDeviceCalendars([
    { id: 'google-work', title: '회사', sourceName: 'Google', ownerAccount: 'work@gmail.com', color: '#4285F4' },
    { id: 'icloud-personal', title: '개인', sourceName: 'iCloud', sourceType: 'caldav', color: '#FF9500' },
  ]);
  const events = normalizeDeviceCalendarEvents([
    { id: 'event-1', calendarId: 'google-work', title: '팀 주간 회의', startDate: '2026-07-28T10:00:00+09:00', endDate: '2026-07-28T11:00:00+09:00', location: '서울시청 회의실' },
    { id: 'event-2', calendarId: 'icloud-personal', title: '건강검진', startDate: '2026-07-29T00:00:00+09:00', endDate: '2026-07-30T00:00:00+09:00', allDay: true, location: '부산의료원' },
  ], calendars);
  return { calendars, events, rangeStart: '2026-07-28T00:00:00+09:00', rangeEnd: '2026-08-27T00:00:00+09:00' };
}

export function createTodayCalendarPreviewFixture(day = new Date()): DeviceCalendarSnapshot {
  const calendars = normalizeDeviceCalendars([
    { id: 'google-work', title: '회사', sourceName: 'Google', ownerAccount: 'work@gmail.com', color: '#4285F4' },
    { id: 'device-personal', title: '개인', sourceName: 'Samsung', isLocalAccount: true, color: '#00B4D8' },
  ]);
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const meetingStart = new Date(start);
  meetingStart.setHours(10, 30);
  const meetingEnd = new Date(meetingStart);
  meetingEnd.setHours(11, 20);
  const dinnerStart = new Date(start);
  dinnerStart.setHours(18, 0);
  const dinnerEnd = new Date(dinnerStart);
  dinnerEnd.setHours(19, 30);
  const tomorrowMeetingStart = new Date(start);
  tomorrowMeetingStart.setDate(tomorrowMeetingStart.getDate() + 1);
  tomorrowMeetingStart.setHours(9, 30);
  const tomorrowMeetingEnd = new Date(tomorrowMeetingStart);
  tomorrowMeetingEnd.setHours(10, 20);
  const events = normalizeDeviceCalendarEvents([
    { id: 'today-all-day', calendarId: 'device-personal', title: '재택근무', startDate: `${localDateKey(start)}T00:00:00`, endDate: `${localDateKey(end)}T00:00:00`, allDay: true },
    { id: 'today-meeting', calendarId: 'google-work', title: '팀 점검 회의', startDate: meetingStart, endDate: meetingEnd, location: '온라인 회의실' },
    { id: 'today-dinner', calendarId: 'device-personal', title: '저녁 약속', startDate: dinnerStart, endDate: dinnerEnd, location: '광안리' },
    { id: 'tomorrow-meeting', calendarId: 'google-work', title: '내일 오전 약속', startDate: tomorrowMeetingStart, endDate: tomorrowMeetingEnd, location: '서면' },
  ], calendars);
  const rangeEnd = new Date(end);
  rangeEnd.setDate(rangeEnd.getDate() + 1);
  return { calendars, events, rangeStart: start.toISOString(), rangeEnd: rangeEnd.toISOString() };
}

function compareCalendarEvents(left: DeviceCalendarEvent, right: DeviceCalendarEvent) {
  const startDifference = new Date(left.startDate).getTime() - new Date(right.startDate).getTime();
  if (startDifference !== 0) return startDifference;
  if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
  return left.title.localeCompare(right.title, 'ko');
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function eventLocalDateKey(event: DeviceCalendarEvent) {
  return event.allDay ? event.startDate.slice(0, 10) : localDateKey(new Date(event.startDate));
}

function rawCalendarDateKey(value: string | Date, parsed: Date) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function localTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatCalendarDay(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}
