import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  GOOGLE_AUTH_SESSION_KEY,
  GoogleAuthProvider,
  GoogleAuthSession,
  parseGoogleAuthSession,
} from '@/lib/google-auth';

// Web is used for UI verification only. Production mobile authentication lives in the native adapter.
export const googleAuthProvider: GoogleAuthProvider = {
  configured: false,
  async restore() {
    const session = parseGoogleAuthSession(await AsyncStorage.getItem(GOOGLE_AUTH_SESSION_KEY));
    return session?.user ?? null;
  },
  async signIn() {
    throw Object.assign(new Error('Native Google Sign-In is unavailable on web.'), { code: 'UNSUPPORTED_PLATFORM' });
  },
  async signOut() {
    await AsyncStorage.removeItem(GOOGLE_AUTH_SESSION_KEY);
  },
  async revokeAccess() {
    await AsyncStorage.removeItem(GOOGLE_AUTH_SESSION_KEY);
  },
  async getIdToken() {
    return null;
  },
};

export function serializeGoogleAuthSession(session: GoogleAuthSession) {
  return JSON.stringify(session);
}
