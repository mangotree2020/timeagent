import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppLogo } from '@/components/app-logo';
import { appType, useAppType } from '@/components/app-ui';
import { GoogleAuthButton } from '@/components/google-auth-button';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { useAuth } from '@/state/auth-context';

export function AuthGate({ children }: React.PropsWithChildren) {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const { configured, error, signIn, status, user } = useAuth();

  if (status === 'checking') {
    return (
      <SafeAreaView accessibilityLabel="로그인 확인 중" style={styles.safe}>
        <AppLogo size={48} />
        <ActivityIndicator accessibilityLabel="Google 로그인 확인 중" color={c.deepBlue} size="large" />
        <Text style={type.body}>로그인 정보를 확인하고 있어요</Text>
      </SafeAreaView>
    );
  }

  if (user) return children;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <AppLogo size={36} style={styles.topLogo} />
        <View style={styles.heroFrame}>
          <Image
            accessibilityLabel="Time:Agent, 지금 해야 할 일과 남은 시간을 한눈에"
            contentFit="contain"
            source={require('../../assets/images/timeagent-login-hero-wordmark.png')}
            style={styles.heroImage}
            transition={180}
          />
        </View>
        <View style={styles.intro}>
          <Text style={styles.subtitle}>로그인하면 오늘 일정과 지금 해야 할 행동을 바로 확인할 수 있어요.</Text>
        </View>

        {!configured ? (
          <View accessibilityRole="alert" style={styles.notice}>
            <Text style={styles.noticeTitle}>Google 로그인 설정이 필요해요</Text>
            <Text style={styles.noticeText}>OAuth 클라이언트 ID를 등록한 빌드에서 로그인할 수 있어요.</Text>
          </View>
        ) : null}
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

        <GoogleAuthButton
          disabled={!configured || status === 'signingIn'}
          onPress={() => void signIn()}
          loading={status === 'signingIn'}
        />
        {status === 'signingIn' ? <Text accessibilityLiveRegion="polite" style={styles.signingIn}>계정 확인 및 가입 중…</Text> : null}
        <View style={styles.privacyRow}>
          <ShieldCheck color="#627087" size={17} strokeWidth={2.2} />
          <Text style={styles.privacy}>이름과 이메일만 로그인에 사용하며 일정과 위치 기록은 이 기기에 보관해요.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
  content: { width: '100%', maxWidth: 480, gap: 14 },
  topLogo: { alignSelf: 'flex-start' },
  heroFrame: {
    width: '100%', aspectRatio: 1731 / 909, borderRadius: 20, overflow: 'hidden',
    backgroundColor: '#071A4B', borderWidth: 1, borderColor: '#D7E7FF',
    shadowColor: '#0B4DB8', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14,
    shadowRadius: 18, elevation: 5,
  },
  heroImage: { width: '100%', height: '100%' },
  intro: { paddingHorizontal: 2, paddingVertical: 2 },
  subtitle: { fontSize: 16, lineHeight: 24, color: c.text, fontWeight: '600', letterSpacing: -0.2 },
  notice: { padding: space.lg, gap: space.xs, borderRadius: radius.md, backgroundColor: c.warningSoft, borderWidth: 1, borderColor: '#F4D58D' },
  noticeTitle: { fontSize: 16, lineHeight: 24, color: c.warning, fontWeight: '900' },
  noticeText: { fontSize: 14, lineHeight: 21, color: c.text },
  error: { ...type.body, color: c.danger },
  signingIn: { ...type.caption, textAlign: 'center', color: c.textMuted },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 7, paddingHorizontal: 8 },
  privacy: { flex: 1, maxWidth: 360, fontSize: 13, lineHeight: 19, color: '#627087', textAlign: 'left' },
  });
};
