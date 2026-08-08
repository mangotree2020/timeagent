import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { normalizePermissionState, PermissionState } from './permission-state';

export type DevicePermissionSnapshot = {
  location: PermissionState;
  notifications: PermissionState;
};

export async function getDevicePermissionSnapshot(): Promise<DevicePermissionSnapshot> {
  if (Platform.OS === 'web') {
    return { location: 'undetermined', notifications: 'undetermined' };
  }

  const [location, notifications] = await Promise.allSettled([
    Location.getForegroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);

  return {
    location: location.status === 'fulfilled' ? normalizePermissionState(location.value) : 'error',
    notifications: notifications.status === 'fulfilled' ? normalizePermissionState(notifications.value) : 'error',
  };
}

export async function requestLocationPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'denied';
  try {
    return normalizePermissionState(await Location.requestForegroundPermissionsAsync());
  } catch {
    return 'error';
  }
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (Platform.OS === 'web') return 'denied';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('on-time-schedule', {
        name: 'TimeAgent 일정 알림',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    return normalizePermissionState(await Notifications.requestPermissionsAsync());
  } catch {
    return 'error';
  }
}
