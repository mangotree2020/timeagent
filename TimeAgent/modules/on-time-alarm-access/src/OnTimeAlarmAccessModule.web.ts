import { registerWebModule, NativeModule } from 'expo';

// Exact alarms and battery optimization are Android concerns; the web has neither.
class OnTimeAlarmAccessModule extends NativeModule {
  canScheduleExactAlarms() {
    return true;
  }
  isIgnoringBatteryOptimizations() {
    return true;
  }
  openExactAlarmSettings() {
    return false;
  }
  openBatteryOptimizationSettings() {
    return false;
  }
}

export default registerWebModule(OnTimeAlarmAccessModule, 'OnTimeAlarmAccessModule');
