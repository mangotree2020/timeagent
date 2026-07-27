import {
  AppSettings,
  APP_SETTINGS_STORAGE_KEY,
  createDefaultAppSettings,
  loadAppSettings,
  saveAppSettings,
} from '../app-settings';

function createMemoryStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe('app settings persistence', () => {
  test('stores and restores settings changed from the UI', async () => {
    const storage = createMemoryStorage();
    const settings: AppSettings = {
      ...createDefaultAppSettings(),
      defaultLocation: '부산역',
      preferredTransport: '버스',
      bufferMinutes: 10,
      coachTone: '간결하게',
      notifications: false,
    };

    await saveAppSettings(storage, settings);

    await expect(loadAppSettings(storage)).resolves.toEqual(settings);
    expect(storage.setItem).toHaveBeenCalledWith(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  });

  test('falls back safely when saved settings are incompatible', async () => {
    const storage = createMemoryStorage('{"version":99}');

    await expect(loadAppSettings(storage)).resolves.toEqual(createDefaultAppSettings());
  });
});
