import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  type OneTapUser,
} from 'react-native-nitro-google-signin';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearGoogleAuthSession,
  completeGoogleMembership,
  GoogleAuthProvider,
  GoogleAuthUser,
  isGoogleWebClientId,
  loadGoogleAuthSession,
  removeGoogleMember,
} from '@/lib/google-auth';

const defaultWebClientId =
  '18828044372-ta832lgj7vetva7u93lqilebvrhgv73j.apps.googleusercontent.com';
const configuredWebClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || defaultWebClientId;
const webClientId = isGoogleWebClientId(configuredWebClientId) ? configuredWebClientId : undefined;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();

if (webClientId) {
  GoogleOneTapSignIn.configure({
    webClientId,
    iosClientId: iosClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
    autoSelectOnSignIn: false,
  });
}

function toAuthUser(user: OneTapUser): GoogleAuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    name: user.name ?? user.email?.split('@')[0] ?? 'TimeAgent 사용자',
    photo: user.photo,
  };
}

export const googleAuthProvider: GoogleAuthProvider = {
  configured: Boolean(webClientId),
  async restore() {
    if (!webClientId) return null;
    const currentUser = GoogleOneTapSignIn.getCurrentUser();
    if (currentUser?.user) {
      const user = toAuthUser(currentUser.user);
      await completeGoogleMembership(AsyncStorage, user);
      return user;
    }
    return (await loadGoogleAuthSession(AsyncStorage))?.user ?? null;
  },
  async signIn() {
    if (!webClientId) throw Object.assign(new Error('Google OAuth client ID is missing.'), { code: 'CONFIGURATION_REQUIRED' });
    await GoogleOneTapSignIn.checkPlayServices(true);
    // createAccount shows every Google account on the device, including accounts
    // that have never authorized TimeAgent. It also handles existing accounts.
    let response = await GoogleOneTapSignIn.createAccount();
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.presentExplicitSignIn();
    }
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.signIn();
    }
    if (isCancelledResponse(response)) return { type: 'cancelled' };
    if (isSuccessResponse(response)) {
      const user = toAuthUser(response.data.user);
      const { isNewMember } = await completeGoogleMembership(AsyncStorage, user);
      return { type: 'success', user, isNewMember };
    }
    return { type: 'cancelled' };
  },
  async signOut() {
    if (webClientId) await GoogleOneTapSignIn.signOut();
    await clearGoogleAuthSession(AsyncStorage);
  },
  async revokeAccess(emailOrUniqueId) {
    if (webClientId) await GoogleOneTapSignIn.revokeAccess(emailOrUniqueId);
    await removeGoogleMember(AsyncStorage, emailOrUniqueId);
  },
};
