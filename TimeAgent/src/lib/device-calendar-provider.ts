import { DeviceCalendarProvider } from '@/lib/device-calendar';

export const deviceCalendarProvider: DeviceCalendarProvider = {
  async getPermission() {
    return { state: 'unavailable', canAskAgain: false };
  },
  async requestPermission() {
    return { state: 'unavailable', canAskAgain: false };
  },
  async loadUpcoming() {
    throw new Error('Device calendars are available only on iOS and Android.');
  },
};
