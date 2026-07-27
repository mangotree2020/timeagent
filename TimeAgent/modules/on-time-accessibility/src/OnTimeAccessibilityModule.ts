import { NativeModule, requireOptionalNativeModule } from 'expo';

import { OnTimeAccessibilityModuleEvents } from './OnTimeAccessibility.types';

declare class OnTimeAccessibilityModule extends NativeModule<OnTimeAccessibilityModuleEvents> {
  isScreenReaderEnabled(): boolean;
}

export default requireOptionalNativeModule<OnTimeAccessibilityModule>('OnTimeAccessibility');
