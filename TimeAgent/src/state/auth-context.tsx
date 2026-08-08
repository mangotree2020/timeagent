import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { stopBackgroundJourney } from '@/lib/background-journey-service';
import { googleAuthErrorMessage, GoogleAuthUser } from '@/lib/google-auth';
import { googleAuthProvider } from '@/lib/google-auth-provider';

type AuthStatus = 'checking' | 'signedOut' | 'signingIn' | 'signedIn' | 'signingOut' | 'deleting';

type AuthContextValue = {
  configured: boolean;
  error: string | null;
  status: AuthStatus;
  user: GoogleAuthUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<GoogleAuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    googleAuthProvider.restore()
      .then((restored) => {
        if (!active) return;
        setUser(restored);
        setStatus(restored ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!active) return;
        setStatus('signedOut');
        setError('저장된 로그인 정보를 확인하지 못했어요. 다시 로그인해 주세요.');
      });
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: googleAuthProvider.configured,
    error,
    status,
    user,
    async signIn() {
      if (!googleAuthProvider.configured) {
        setError('Google 로그인 설정이 필요해요. 앱의 OAuth 클라이언트 ID를 먼저 등록해 주세요.');
        return;
      }
      setStatus('signingIn');
      setError(null);
      try {
        const result = await googleAuthProvider.signIn();
        if (result.type === 'cancelled') {
          setStatus('signedOut');
          return;
        }
        setUser(result.user);
        setStatus('signedIn');
      } catch (signInError) {
        const message = googleAuthErrorMessage(errorCode(signInError));
        setError(message);
        setStatus('signedOut');
      }
    },
    async signOut() {
      setStatus('signingOut');
      setError(null);
      try {
        await googleAuthProvider.signOut();
        setUser(null);
        setStatus('signedOut');
      } catch {
        setStatus('signedIn');
        setError('로그아웃하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      }
    },
    async deleteAccount() {
      if (!user) return;
      setStatus('deleting');
      setError(null);
      try {
        await stopBackgroundJourney().catch(() => undefined);
        await googleAuthProvider.revokeAccess(user.email || user.id);
        await AsyncStorage.clear();
        setUser(null);
        setStatus('signedOut');
      } catch {
        setStatus('signedIn');
        setError('계정 연결과 기기 데이터를 삭제하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      }
    },
  }), [error, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
