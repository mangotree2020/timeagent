import {
  completeGoogleMembership,
  GOOGLE_AUTH_MEMBERS_KEY,
  GOOGLE_AUTH_SESSION_KEY,
  googleAuthErrorMessage,
  isGoogleWebClientId,
  parseGoogleAuthMembers,
  parseGoogleAuthSession,
  removeGoogleMember,
} from '@/lib/google-auth';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
    values,
  };
}

describe('Google authentication', () => {
  it('accepts a complete versioned account session', () => {
    expect(parseGoogleAuthSession(JSON.stringify({
      version: 1,
      user: { id: 'google-1', email: 'seoyeon@example.com', name: '서연', photo: null },
    }))).toEqual({
      version: 1,
      user: { id: 'google-1', email: 'seoyeon@example.com', name: '서연', photo: null },
    });
  });

  it.each([
    [null],
    ['not-json'],
    [JSON.stringify({ version: 2, user: { id: 'google-1' } })],
    [JSON.stringify({ version: 1, user: { id: '', email: 'seoyeon@example.com', name: '서연' } })],
    [JSON.stringify({ version: 1, user: { id: 'google-1', email: '', name: '서연' } })],
  ])('rejects an invalid saved session', (value) => {
    expect(parseGoogleAuthSession(value)).toBeNull();
  });

  it('turns native failures into actionable Korean guidance', () => {
    expect(googleAuthErrorMessage('PLAY_SERVICES_NOT_AVAILABLE')).toContain('Google Play 서비스');
    expect(googleAuthErrorMessage('DEVELOPER_ERROR')).toContain('인증 설정');
    expect(googleAuthErrorMessage('SIGN_IN_CANCELLED')).toBeNull();
    expect(googleAuthErrorMessage('ONE_TAP_START_FAILED')).toContain('로그인 창');
    expect(googleAuthErrorMessage('CONFIGURATION_REQUIRED')).toContain('OAuth');
    expect(googleAuthErrorMessage('NETWORK_ERROR')).toContain('인터넷 연결');
    expect(googleAuthErrorMessage()).toContain('다시');
  });

  it('accepts only a Google Web OAuth client ID', () => {
    expect(isGoogleWebClientId('123456789-example.apps.googleusercontent.com')).toBe(true);
    expect(isGoogleWebClientId('123456789-example')).toBe(false);
    expect(isGoogleWebClientId('')).toBe(false);
    expect(isGoogleWebClientId(undefined)).toBe(false);
  });

  it('registers a new Google member and creates the login session immediately', async () => {
    const storage = createStorage();
    const user = { id: 'new-google-id', email: 'new@example.com', name: '새 사용자', photo: null };

    await expect(completeGoogleMembership(storage, user, 1_000)).resolves.toMatchObject({ isNewMember: true });
    expect(parseGoogleAuthSession(storage.values.get(GOOGLE_AUTH_SESSION_KEY) ?? null)?.user).toEqual(user);
    expect(parseGoogleAuthMembers(storage.values.get(GOOGLE_AUTH_MEMBERS_KEY) ?? null).members[user.id]).toMatchObject({
      user,
      createdAt: 1_000,
      lastSignedInAt: 1_000,
    });
  });

  it('logs an existing member in without recreating the membership', async () => {
    const storage = createStorage();
    const user = { id: 'google-id', email: 'member@example.com', name: '기존 사용자', photo: null };
    await completeGoogleMembership(storage, user, 1_000);

    await expect(completeGoogleMembership(storage, { ...user, name: '변경된 이름' }, 2_000))
      .resolves.toMatchObject({ isNewMember: false });
    expect(parseGoogleAuthMembers(storage.values.get(GOOGLE_AUTH_MEMBERS_KEY) ?? null).members[user.id]).toMatchObject({
      createdAt: 1_000,
      lastSignedInAt: 2_000,
      user: { name: '변경된 이름' },
    });
  });

  it('removes the selected member and active session on account deletion', async () => {
    const storage = createStorage();
    const user = { id: 'delete-id', email: 'delete@example.com', name: '삭제 사용자', photo: null };
    await completeGoogleMembership(storage, user, 1_000);
    await removeGoogleMember(storage, user.email);

    expect(parseGoogleAuthMembers(storage.values.get(GOOGLE_AUTH_MEMBERS_KEY) ?? null).members).toEqual({});
    expect(storage.values.has(GOOGLE_AUTH_SESSION_KEY)).toBe(false);
  });
});
