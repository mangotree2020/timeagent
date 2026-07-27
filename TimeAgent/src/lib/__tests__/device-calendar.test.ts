import {
  calendarEventToDraftPatch,
  classifyCalendarProvider,
  createCalendarPreviewFixture,
  formatCalendarEventTime,
  groupCalendarEventsByDay,
  normalizeDeviceCalendarEvents,
  normalizeDeviceCalendars,
  upcomingCalendarRange,
} from '@/lib/device-calendar';

describe('device calendar domain', () => {
  it('classifies Google, Apple/iCloud, and local device calendars from platform account metadata', () => {
    expect(classifyCalendarProvider({ ownerAccount: 'person@gmail.com' })).toBe('google');
    expect(classifyCalendarProvider({ sourceName: 'iCloud', sourceType: 'caldav' })).toBe('apple');
    expect(classifyCalendarProvider({ sourceName: '내 캘린더', isLocalAccount: true })).toBe('device');
    expect(classifyCalendarProvider({ sourceName: 'Exchange' })).toBe('other');
  });

  it('keeps visible synced calendars and normalizes events in start order', () => {
    const calendars = normalizeDeviceCalendars([
      { id: 'google', title: '회사', ownerAccount: 'work@gmail.com', color: '#4285F4' },
      { id: 'hidden', title: '숨김', sourceName: 'Local', isVisible: false },
      { id: 'stale', title: '동기화 안 됨', sourceName: 'Local', isSynced: false },
    ]);
    const events = normalizeDeviceCalendarEvents([
      { id: 'later', calendarId: 'google', title: '회의', startDate: '2026-07-29T03:00:00.000Z', endDate: '2026-07-29T04:00:00.000Z' },
      { id: 'earlier', calendarId: 'google', title: '출근', startDate: '2026-07-28T00:00:00.000Z', endDate: '2026-07-28T01:00:00.000Z' },
      { id: 'cancelled', calendarId: 'google', title: '취소', startDate: '2026-07-28T02:00:00.000Z', endDate: '2026-07-28T03:00:00.000Z', status: 'canceled' },
    ], calendars);

    expect(calendars).toHaveLength(1);
    expect(calendars[0]).toMatchObject({ provider: 'google', providerLabel: 'Google', accountLabel: 'work@gmail.com' });
    expect(events.map((event) => event.id)).toEqual(['earlier', 'later']);
  });

  it('builds a local-midnight 30-day range and groups events by local day', () => {
    const { rangeStart, rangeEnd } = upcomingCalendarRange(new Date(2026, 6, 28, 15, 30), 30);
    expect(rangeStart).toEqual(new Date(2026, 6, 28, 0, 0, 0, 0));
    expect(rangeEnd).toEqual(new Date(2026, 7, 27, 0, 0, 0, 0));

    const fixture = createCalendarPreviewFixture();
    const groups = groupCalendarEventsByDay(fixture.events);
    expect(groups).toHaveLength(2);
    expect(groups[0].events[0].title).toBe('팀 주간 회의');
    expect(formatCalendarEventTime(groups[1].events[0])).toBe('종일');
  });

  it('maps a selected timed event to a new draft and leaves all-day time blank', () => {
    const fixture = createCalendarPreviewFixture();
    expect(calendarEventToDraftPatch(fixture.events[0])).toMatchObject({
      step: 0,
      title: '팀 주간 회의',
      date: '2026-07-28',
      appointmentTime: '10:00',
      destination: '서울시청 회의실',
      destinationAddress: '서울시청 회의실',
      destinationCoordinate: null,
    });
    expect(calendarEventToDraftPatch(fixture.events[1]).appointmentTime).toBe('');
  });
});
