export const ONBOARDING_STORAGE_KEY = '@on-time/onboarding-complete';

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export async function hasCompletedOnboarding(storage: StorageLike) {
  return await storage.getItem(ONBOARDING_STORAGE_KEY) === '1';
}

export async function completeOnboarding(storage: StorageLike) {
  await storage.setItem(ONBOARDING_STORAGE_KEY, '1');
}
