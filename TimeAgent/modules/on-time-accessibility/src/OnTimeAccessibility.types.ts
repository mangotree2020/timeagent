export type OnTimeAccessibilityModuleEvents = {
  onScreenReaderChanged: (params: ScreenReaderChangedEventPayload) => void;
};

export type ScreenReaderChangedEventPayload = {
  enabled: boolean;
};
