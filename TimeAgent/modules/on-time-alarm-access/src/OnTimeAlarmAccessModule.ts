import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class OnTimeAlarmAccessModule extends NativeModule {
  canScheduleExactAlarms(): boolean;
  isIgnoringBatteryOptimizations(): boolean;
  openExactAlarmSettings(): boolean;
  openBatteryOptimizationSettings(): boolean;
}

export default requireOptionalNativeModule<OnTimeAlarmAccessModule>('OnTimeAlarmAccess');
