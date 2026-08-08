export const GOOGLE_AUTH_SESSION_KEY = '@on-time/google-auth-session';
export const GOOGLE_AUTH_MEMBERS_KEY = '@on-time/google-auth-members';

export type GoogleAuthUser = {
  id: string;
  email: string;
  name: string;
  photo: string | null;
};

export type GoogleAuthSession = {
  version: 1;
  user: GoogleAuthUser;
};

export type GoogleAuthMember = {
  version: 1;
  user: GoogleAuthUser;
  createdAt: number;
  lastSignedInAt: number;
};

export type GoogleAuthMemberRegistry = {
  version: 1;
  members: Record<string, GoogleAuthMember>;
};

export type GoogleAuthResult =
  | { type: 'success'; user: GoogleAuthUser; isNewMember: boolean }
  | { type: 'cancelled' };

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

export type GoogleAuthProvider = {
  configured: boolean;
  restore: () => Promise<GoogleAuthUser | null>;
  signIn: () => Promise<GoogleAuthResult>;
  signOut: () => Promise<void>;
  revokeAccess: (emailOrUniqueId: string) => Promise<void>;
};

export function isGoogleWebClientId(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value.trim()));
}

export function parseGoogleAuthSession(value: string | null): GoogleAuthSession | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<GoogleAuthSession>;
    const user = candidate.user;
    if (
      candidate.version !== 1
      || !user
      || typeof user.id !== 'string'
      || !user.id.trim()
      || typeof user.email !== 'string'
      || !user.email.trim()
      || typeof user.name !== 'string'
      || !user.name.trim()
      || !(typeof user.photo === 'string' || user.photo === null)
    ) return null;
    return { version: 1, user: { id: user.id, email: user.email, name: user.name, photo: user.photo } };
  } catch {
    return null;
  }
}

export function parseGoogleAuthMembers(value: string | null): GoogleAuthMemberRegistry {
  if (!value) return { version: 1, members: {} };
  try {
    const candidate = JSON.parse(value) as Partial<GoogleAuthMemberRegistry>;
    if (candidate.version !== 1 || !candidate.members || typeof candidate.members !== 'object') {
      return { version: 1, members: {} };
    }
    const members = Object.fromEntries(Object.entries(candidate.members).filter(([, member]) => {
      const session = parseGoogleAuthSession(JSON.stringify({ version: 1, user: member?.user }));
      return Boolean(
        session
        && member?.version === 1
        && typeof member.createdAt === 'number'
        && Number.isFinite(member.createdAt)
        && typeof member.lastSignedInAt === 'number'
        && Number.isFinite(member.lastSignedInAt),
      );
    }));
    return { version: 1, members };
  } catch {
    return { version: 1, members: {} };
  }
}

export async function completeGoogleMembership(
  storage: StorageLike,
  user: GoogleAuthUser,
  now = Date.now(),
) {
  const registry = parseGoogleAuthMembers(await storage.getItem(GOOGLE_AUTH_MEMBERS_KEY));
  const existing = registry.members[user.id];
  const member: GoogleAuthMember = {
    version: 1,
    user,
    createdAt: existing?.createdAt ?? now,
    lastSignedInAt: now,
  };
  await storage.setItem(GOOGLE_AUTH_MEMBERS_KEY, JSON.stringify({
    version: 1,
    members: { ...registry.members, [user.id]: member },
  } satisfies GoogleAuthMemberRegistry));
  await storage.setItem(GOOGLE_AUTH_SESSION_KEY, JSON.stringify({ version: 1, user } satisfies GoogleAuthSession));
  return { member, isNewMember: !existing };
}

export async function loadGoogleAuthSession(storage: Pick<StorageLike, 'getItem'>) {
  return parseGoogleAuthSession(await storage.getItem(GOOGLE_AUTH_SESSION_KEY));
}

export async function clearGoogleAuthSession(storage: Pick<StorageLike, 'removeItem'>) {
  await storage.removeItem(GOOGLE_AUTH_SESSION_KEY);
}

export async function removeGoogleMember(storage: StorageLike, idOrEmail: string) {
  const registry = parseGoogleAuthMembers(await storage.getItem(GOOGLE_AUTH_MEMBERS_KEY));
  const members = Object.fromEntries(Object.entries(registry.members).filter(([id, member]) => (
    id !== idOrEmail && member.user.email !== idOrEmail
  )));
  await storage.setItem(GOOGLE_AUTH_MEMBERS_KEY, JSON.stringify({ version: 1, members } satisfies GoogleAuthMemberRegistry));
  await clearGoogleAuthSession(storage);
}

export function googleAuthErrorMessage(code?: string): string | null {
  if (code === 'SIGN_IN_CANCELLED') return null;
  if (code === 'PLAY_SERVICES_NOT_AVAILABLE') return 'Google Play 서비스를 업데이트한 뒤 다시 시도해 주세요.';
  if (code === 'DEVELOPER_ERROR') return 'Google 인증 설정을 확인하지 못했어요. 앱 인증 정보와 SHA-1 설정을 확인해 주세요.';
  if (code === 'CONFIGURATION_REQUIRED') return 'Google OAuth 설정을 불러오지 못했어요. 앱을 다시 설치하거나 지원팀에 문의해 주세요.';
  if (code === 'ONE_TAP_START_FAILED') return 'Google 로그인 창을 열지 못했어요. Google Play 서비스와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  if (code === 'SIGN_IN_REQUIRED') return '사용할 Google 계정을 선택한 뒤 다시 시도해 주세요.';
  if (code?.includes('NETWORK')) return '인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  if (code === 'IN_PROGRESS') return 'Google 로그인 화면이 이미 열려 있어요.';
  return 'Google 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
}
