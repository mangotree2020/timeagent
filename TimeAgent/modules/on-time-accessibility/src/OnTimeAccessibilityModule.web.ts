import { registerWebModule, NativeModule } from 'expo';

import { OnTimeAccessibilityModuleEvents } from './OnTimeAccessibility.types';

// OnTimeAccessibilityModule is not available on the web platform.
class OnTimeAccessibilityModule extends NativeModule<OnTimeAccessibilityModuleEvents> {
  isScreenReaderEnabled() {
    return false;
  }
}

export default registerWebModule(OnTimeAccessibilityModule, 'OnTimeAccessibilityModule');
