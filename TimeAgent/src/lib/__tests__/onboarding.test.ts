import { completeOnboarding, hasCompletedOnboarding, ONBOARDING_COMPLETION_VERSION, ONBOARDING_STORAGE_KEY } from '@/lib/onboarding';

describe('onboarding state', () => {
  it('is incomplete until the local completion marker is stored', async () => {
    let value: string | null = null;
    const storage = {
      getItem: jest.fn(async () => value),
      setItem: jest.fn(async (_key: string, next: string) => { value = next; }),
    };

    await expect(hasCompletedOnboarding(storage)).resolves.toBe(false);
    await completeOnboarding(storage);
    expect(storage.setItem).toHaveBeenCalledWith(ONBOARDING_STORAGE_KEY, ONBOARDING_COMPLETION_VERSION);
    await expect(hasCompletedOnboarding(storage)).resolves.toBe(true);
  });

  it.each(['1', '2'])('shows the current onboarding once to users with legacy completion marker %s', async (legacyVersion) => {
    const storage = {
      getItem: jest.fn(async () => legacyVersion),
      setItem: jest.fn(async () => undefined),
    };

    await expect(hasCompletedOnboarding(storage)).resolves.toBe(false);
  });
});
