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
      colorMode: 'dark',
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

  test('migrates existing settings with gender selection left optional', async () => {
    const legacy = { ...createDefaultAppSettings(), version: 1 };
    delete (legacy as Partial<AppSettings>).preparationGender;
    const storage = createMemoryStorage(JSON.stringify(legacy));

    await expect(loadAppSettings(storage)).resolves.toEqual({
      ...legacy,
      version: createDefaultAppSettings().version,
      preparationGender: 'unspecified',
      colorMode: 'light',
      stepCoaching: true,
    });
  });

  test('migrates version two settings to the default light appearance', async () => {
    const legacy = { ...createDefaultAppSettings(), version: 2 };
    delete (legacy as Partial<AppSettings>).colorMode;
    const storage = createMemoryStorage(JSON.stringify(legacy));

    await expect(loadAppSettings(storage)).resolves.toEqual({
      ...legacy,
      version: createDefaultAppSettings().version,
      colorMode: 'light',
      stepCoaching: true,
    });
  });

  it('opens on Korean for settings saved before a language could be picked', async () => {
    // The screens are written in Korean, so an upgrade that silently answered this question with
    // anything else would change what someone sees without being asked.
    expect(createDefaultAppSettings().language).toBe('ko');

    const saved = { ...createDefaultAppSettings(), version: 4, colorMode: 'dark' as const };
    delete (saved as Partial<AppSettings>).language;
    const storage = createMemoryStorage(JSON.stringify(saved));

    await expect(loadAppSettings(storage)).resolves.toEqual({
      ...saved,
      version: createDefaultAppSettings().version,
      language: 'ko',
    });
  });

  it('falls back to the defaults for a language nobody offers', async () => {
    const storage = createMemoryStorage(JSON.stringify({ ...createDefaultAppSettings(), language: 'de' }));

    await expect(loadAppSettings(storage)).resolves.toEqual(createDefaultAppSettings());
  });

  it('keeps the step coach on by default and turns it on for settings saved before it existed', async () => {
    expect(createDefaultAppSettings().stepCoaching).toBe(true);

    const storage = createMemoryStorage(JSON.stringify({
      version: 3,
      defaultLocation: '해운대구',
      preferredTransport: '버스',
      bufferMinutes: 10,
      routinePreset: '빠른 준비',
      preparationGender: 'unspecified',
      coachTone: '간결하게',
      voiceControl: true,
      notifications: true,
      colorMode: 'dark',
    }));

    const loaded = await loadAppSettings(storage);

    expect(loaded).toMatchObject({
      defaultLocation: '해운대구',
      preferredTransport: '버스',
      colorMode: 'dark',
      stepCoaching: true,
    });
  });
});
