import { Platform } from 'react-native';

import OnTimeAlarmAccessModule from '../../modules/on-time-alarm-access/src/OnTimeAlarmAccessModule';

/**
 * Whether the OS will fire preparation alarms when they are due. On Android 12+ an app without the
 * "alarms & reminders" switch gets inexact alarms, and a frozen (battery-optimized) app can have even
 * those deferred until it is opened — which is exactly when the alarm was supposed to do the opening.
 */
export type ExactAlarmState = 'allowed' | 'needs-permission' | 'unsupported';
export type BatteryOptimizationState = 'exempt' | 'optimizing' | 'unsupported';

export type AlarmReliabilitySnapshot = {
  exactAlarms: ExactAlarmState;
  batteryOptimization: BatteryOptimizationState;
};

export type AlarmAccessLike = {
  canScheduleExactAlarms(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  openExactAlarmSettings(): boolean;
  openBatteryOptimizationSettings(): boolean;
};

export const UNSUPPORTED_ALARM_RELIABILITY: AlarmReliabilitySnapshot = {
  exactAlarms: 'unsupported',
  batteryOptimization: 'unsupported',
};

export function readAlarmReliability(access: AlarmAccessLike | null, platform: string = Platform.OS): AlarmReliabilitySnapshot {
  if (platform !== 'android' || !access) return UNSUPPORTED_ALARM_RELIABILITY;
  try {
    return {
      exactAlarms: access.canScheduleExactAlarms() ? 'allowed' : 'needs-permission',
      batteryOptimization: access.isIgnoringBatteryOptimizations() ? 'exempt' : 'optimizing',
    };
  } catch {
    return UNSUPPORTED_ALARM_RELIABILITY;
  }
}

export function getAlarmReliabilitySnapshot() {
  return readAlarmReliability(OnTimeAlarmAccessModule);
}

export function openExactAlarmSettings() {
  try {
    return OnTimeAlarmAccessModule?.openExactAlarmSettings() ?? false;
  } catch {
    return false;
  }
}

export function openBatteryOptimizationSettings() {
  try {
    return OnTimeAlarmAccessModule?.openBatteryOptimizationSettings() ?? false;
  } catch {
    return false;
  }
}

/** True when at least one system setting still stands between the alarm and its due time. */
export function alarmReliabilityNeedsAttention(snapshot: AlarmReliabilitySnapshot) {
  return snapshot.exactAlarms === 'needs-permission' || snapshot.batteryOptimization === 'optimizing';
}

export function exactAlarmStatusLabel(state: ExactAlarmState) {
  if (state === 'allowed') return '정확한 시각 알람 허용됨';
  if (state === 'needs-permission') return '정확한 시각 알람 허용 필요';
  return '이 기기에서는 해당 없음';
}

export function batteryOptimizationStatusLabel(state: BatteryOptimizationState) {
  if (state === 'exempt') return '배터리 최적화 예외 적용됨';
  if (state === 'optimizing') return '배터리 최적화 중 · 예외 권장';
  return '이 기기에서는 해당 없음';
}

/** One line for the settings row: what is still in the way, or that nothing is. */
export function alarmReliabilitySummary(snapshot: AlarmReliabilitySnapshot) {
  if (snapshot.exactAlarms === 'unsupported' && snapshot.batteryOptimization === 'unsupported') return '이 기기에서는 설정이 필요 없어요';
  const issues: string[] = [];
  if (snapshot.exactAlarms === 'needs-permission') issues.push('정확한 시각 알람 허용 필요');
  if (snapshot.batteryOptimization === 'optimizing') issues.push('배터리 최적화 예외 권장');
  if (issues.length === 0) return '단계 종료 알람이 제시간에 울려요';
  return issues.join(' · ');
}

/**
 * The warning under a running session: shown only while something can still delay the alarm, and
 * naming what, so the fix is a tap away instead of a guess.
 */
export function alarmReliabilityHint(snapshot: AlarmReliabilitySnapshot) {
  if (snapshot.exactAlarms === 'needs-permission') {
    return '정확한 시각 알람이 꺼져 있어 앱을 닫아두면 단계 종료 알람이 몇 분 늦을 수 있어요.';
  }
  if (snapshot.batteryOptimization === 'optimizing') {
    return '배터리 최적화 중이라 앱을 오래 닫아두면 단계 종료 알람이 늦을 수 있어요.';
  }
  return null;
}
