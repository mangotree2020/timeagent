import {
  alarmReliabilityHint,
  alarmReliabilityNeedsAttention,
  alarmReliabilitySummary,
  batteryOptimizationStatusLabel,
  exactAlarmStatusLabel,
  readAlarmReliability,
  UNSUPPORTED_ALARM_RELIABILITY,
} from '../alarm-reliability';

function access(exact: boolean, exempt: boolean) {
  return {
    canScheduleExactAlarms: () => exact,
    isIgnoringBatteryOptimizations: () => exempt,
    openExactAlarmSettings: () => true,
    openBatteryOptimizationSettings: () => true,
  };
}

describe('alarm reliability', () => {
  test('reads both switches from the native module on Android', () => {
    expect(readAlarmReliability(access(true, true), 'android')).toEqual({ exactAlarms: 'allowed', batteryOptimization: 'exempt' });
    expect(readAlarmReliability(access(false, false), 'android')).toEqual({ exactAlarms: 'needs-permission', batteryOptimization: 'optimizing' });
  });

  test('treats other platforms and a missing module as not applicable', () => {
    expect(readAlarmReliability(access(false, false), 'ios')).toEqual(UNSUPPORTED_ALARM_RELIABILITY);
    expect(readAlarmReliability(null, 'android')).toEqual(UNSUPPORTED_ALARM_RELIABILITY);
  });

  test('a native failure reads as not applicable rather than as a warning', () => {
    const broken = { ...access(true, true), canScheduleExactAlarms: () => { throw new Error('no service'); } };
    expect(readAlarmReliability(broken, 'android')).toEqual(UNSUPPORTED_ALARM_RELIABILITY);
  });

  test('needs attention while either switch can still delay an alarm', () => {
    expect(alarmReliabilityNeedsAttention({ exactAlarms: 'allowed', batteryOptimization: 'exempt' })).toBe(false);
    expect(alarmReliabilityNeedsAttention({ exactAlarms: 'needs-permission', batteryOptimization: 'exempt' })).toBe(true);
    expect(alarmReliabilityNeedsAttention({ exactAlarms: 'allowed', batteryOptimization: 'optimizing' })).toBe(true);
    expect(alarmReliabilityNeedsAttention(UNSUPPORTED_ALARM_RELIABILITY)).toBe(false);
  });

  test('labels and summary say the state in words, not color', () => {
    expect(exactAlarmStatusLabel('allowed')).toBe('정확한 시각 알람 허용됨');
    expect(exactAlarmStatusLabel('needs-permission')).toBe('정확한 시각 알람 허용 필요');
    expect(batteryOptimizationStatusLabel('optimizing')).toBe('배터리 최적화 중 · 예외 권장');
    expect(alarmReliabilitySummary({ exactAlarms: 'allowed', batteryOptimization: 'exempt' })).toBe('단계 종료 알람이 제시간에 울려요');
    expect(alarmReliabilitySummary({ exactAlarms: 'needs-permission', batteryOptimization: 'optimizing' })).toBe('정확한 시각 알람 허용 필요 · 배터리 최적화 예외 권장');
    expect(alarmReliabilitySummary(UNSUPPORTED_ALARM_RELIABILITY)).toBe('이 기기에서는 설정이 필요 없어요');
  });

  test('the running-session hint names the more urgent switch first and stays silent when fine', () => {
    expect(alarmReliabilityHint({ exactAlarms: 'needs-permission', batteryOptimization: 'optimizing' })).toContain('정확한 시각 알람이 꺼져 있어');
    expect(alarmReliabilityHint({ exactAlarms: 'allowed', batteryOptimization: 'optimizing' })).toContain('배터리 최적화 중이라');
    expect(alarmReliabilityHint({ exactAlarms: 'allowed', batteryOptimization: 'exempt' })).toBeNull();
    expect(alarmReliabilityHint(UNSUPPORTED_ALARM_RELIABILITY)).toBeNull();
  });
});
