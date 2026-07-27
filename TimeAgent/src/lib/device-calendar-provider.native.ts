import * as Calendar from 'expo-calendar';
import { PermissionsAndroid, Platform } from 'react-native';

import {
  DeviceCalendarPermission,
  DeviceCalendarProvider,
  normalizeDeviceCalendarEvents,
  normalizeDeviceCalendars,
  upcomingCalendarRange,
} from '@/lib/device-calendar';

const READ_CALENDAR = PermissionsAndroid.PERMISSIONS.READ_CALENDAR;

export const deviceCalendarProvider: DeviceCalendarProvider = {
  async getPermission() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(READ_CALENDAR);
      return { state: granted ? 'granted' : 'undetermined', canAskAgain: !granted };
    }
    return normalizePermission(await Calendar.getCalendarPermissions());
  },

  async requestPermission() {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(READ_CALENDAR, {
        title: '캘린더 일정 읽기',
        message: 'ON:TIME이 향후 30일 일정을 보여주고 선택한 일정만 준비 계획으로 가져오도록 캘린더 읽기를 허용해 주세요.',
        buttonPositive: '계속',
        buttonNegative: '나중에',
      });
      if (result === PermissionsAndroid.RESULTS.GRANTED) return { state: 'granted', canAskAgain: false };
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return { state: 'blocked', canAskAgain: false };
      return { state: 'denied', canAskAgain: true };
    }
    return normalizePermission(await Calendar.requestCalendarPermissions(false));
  },

  async loadUpcoming(now = new Date(), days = 30) {
    const range = upcomingCalendarRange(now, days);
    const rawCalendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const calendars = normalizeDeviceCalendars(rawCalendars.map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      sourceName: calendar.source?.name,
      sourceType: String(calendar.source?.type ?? ''),
      ownerAccount: calendar.ownerAccount,
      isLocalAccount: calendar.source?.isLocalAccount,
      color: calendar.color,
      isVisible: calendar.isVisible,
      isSynced: calendar.isSynced,
    })));
    const events = calendars.length
      ? await Calendar.listEvents(calendars.map((calendar) => calendar.id), range.rangeStart, range.rangeEnd)
      : [];
    return {
      calendars,
      events: normalizeDeviceCalendarEvents(events.map((event) => ({
        id: event.id,
        calendarId: event.calendarId,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        allDay: event.allDay,
        location: event.location,
        status: String(event.status ?? ''),
      })), calendars),
      rangeStart: range.rangeStart.toISOString(),
      rangeEnd: range.rangeEnd.toISOString(),
    };
  },
};

function normalizePermission(permission: { granted: boolean; canAskAgain: boolean; status: string }): DeviceCalendarPermission {
  if (permission.granted) return { state: 'granted', canAskAgain: false };
  if (!permission.canAskAgain) return { state: 'blocked', canAskAgain: false };
  return { state: permission.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: true };
}
