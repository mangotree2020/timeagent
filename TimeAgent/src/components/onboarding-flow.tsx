import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { AppLogo } from '@/components/app-logo';
import { Button } from '@/components/app-ui';
import { radius, space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';

type OnboardingPage = {
  title: string;
  description: string;
  icon: AppIconName;
  accessibilityLabel: string;
};

const pages: OnboardingPage[] = [
  {
    title: '약속만 말해줘.\n준비는 내가 할게.',
    description: '약속 시간과 장소만 알려주면 준비 시작부터 도착까지 자동으로 계획해 드려요.',
    icon: 'time',
    accessibilityLabel: '7시 약속에서 준비 시작 시간을 역산하는 화면',
  },
  {
    title: '늦을 것 같으면\n바로 다시 짜드려요.',
    description: '준비가 늦어지면 남은 계획을 실시간으로 다시 계산하고, 적용 전에 변경 내용을 보여드려요.',
    icon: 'quick',
    accessibilityLabel: '6분 지연을 감지해 남은 계획을 다시 계산한 화면',
  },
  {
    title: '말로 하면\n3초면 끝나요.',
    description: '타이핑할 필요 없이 한 문장이든 대화든 편한 방식으로 약속을 등록해 보세요.',
    icon: 'voice',
    accessibilityLabel: '음성으로 약속을 빠르게 등록하는 화면',
  },
];

export function OnboardingFlow({ onComplete }: { onComplete: () => Promise<void> | void }) {
  const styles = useThemedStyles(createStyles);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = pages[page];

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onComplete();
    } catch {
      setError('온보딩 완료 상태를 저장하지 못했어요. 다시 시도해 주세요.');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <AppLogo size={30} variant="dark" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="온보딩 건너뛰고 Google 로그인으로 이동"
            disabled={saving}
            hitSlop={8}
            onPress={() => void finish()}
            style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
          >
            <Text style={styles.skip}>건너뛰기</Text>
          </Pressable>
        </View>

        <View accessibilityLabel={current.accessibilityLabel} style={styles.visual}>
          {page === 0 ? <TimeVisual /> : null}
          {page === 1 ? <ReplanVisual /> : null}
          {page === 2 ? <VoiceVisual /> : null}
        </View>

        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.title}>{current.title}</Text>
          <Text style={styles.description}>{current.description}</Text>
        </View>

        <View style={styles.footer}>
          <View accessibilityLabel={`${page + 1} / ${pages.length} 페이지`} style={styles.dots}>
            {pages.map((item, index) => <View key={item.title} style={[styles.dot, index === page && styles.dotActive]} />)}
          </View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Button
            label={page === pages.length - 1 ? saving ? '로그인 화면 준비 중…' : '시작하기' : '다음'}
            disabled={saving}
            accessibilityHint={page === pages.length - 1 ? 'Google 로그인 화면으로 이동합니다' : '다음 온보딩 화면을 봅니다'}
            onPress={() => page === pages.length - 1 ? void finish() : setPage((value) => value + 1)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function TimeVisual() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.timeWheel}>
      <Text style={styles.timeFaded}>6:59</Text>
      <Text style={styles.timeMain}>7:00</Text>
      <Text style={styles.timeFaded}>7:01</Text>
      <View style={styles.timeGuide}><View style={styles.guideDotActive} /><View style={styles.guideLine} /><View style={styles.guideDot} /><View style={styles.guideLine} /><View style={styles.guideDot} /></View>
    </View>
  );
}

function ReplanVisual() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.replanWrap}>
      <View style={styles.delayCard}>
        <View style={styles.warningDot} />
        <View style={styles.flex}><Text style={styles.delayTitle}>지금 6분 늦고 있어요</Text><Text style={styles.delayBody}>괜찮아요, 계획을 다시 짰어요</Text></View>
      </View>
      <View style={styles.changeCard}>
        <ChangeRow before="옷 입기 10분" after="6분으로 단축" />
        <ChangeRow before="도보 이동" after="빠른 걸음" />
        <ChangeRow before="19:40 지하철" after="탑승 가능" success />
      </View>
    </View>
  );
}

function ChangeRow({ before, after, success = false }: { before: string; after: string; success?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.changeRow}><Text style={styles.changeBefore}>{before}</Text><Text style={[styles.changeAfter, success && styles.changeSuccess]}>→ {after}</Text></View>;
}

function VoiceVisual() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  return (
    <View style={styles.voiceWrap}>
      <View style={styles.voiceHalo}><View style={styles.voiceButton}><AppIcon name="voice" size={52} iconColor={c.surface} strokeWidth={2.1} /></View></View>
      <View style={styles.speechBubble}><Text style={styles.speechText}>“토요일 7시에 홍대에서 지수랑 저녁”</Text></View>
    </View>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surfaceInverse },
  container: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
  topBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skipButton: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  skip: { color: '#AAB4C6', fontSize: 14, lineHeight: 20, fontWeight: '800' },
  visual: { flex: 1, minHeight: 250, maxHeight: 500, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: '#0D1428', borderWidth: 1, borderColor: '#1C2742', padding: space.xl, overflow: 'hidden' },
  copy: { minHeight: 126, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.sm },
  title: { color: c.onInverse, fontSize: 28, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center' },
  description: { color: '#AAB4C6', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  footer: { gap: space.sm },
  dots: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#283551' },
  dotActive: { width: 24, backgroundColor: '#4C8BF5' },
  error: { color: '#FFB4AC', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  pressed: { opacity: 0.68 },
  timeWheel: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeFaded: { color: '#44506A', fontSize: 35, lineHeight: 44, fontWeight: '500' },
  timeMain: { color: c.onInverse, fontSize: 70, lineHeight: 78, fontWeight: '900', letterSpacing: -2 },
  timeGuide: { marginTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: 8 },
  guideDotActive: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#4C8BF5' },
  guideDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#203052' },
  guideLine: { width: 36, height: 2, backgroundColor: '#202B45' },
  replanWrap: { width: '100%', maxWidth: 380, gap: space.md },
  delayCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.lg, backgroundColor: '#171F37' },
  warningDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#FF9330' },
  flex: { flex: 1 },
  delayTitle: { color: c.onInverse, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  delayBody: { color: '#8995AB', fontSize: 13, lineHeight: 18 },
  changeCard: { gap: space.md, borderRadius: radius.md, padding: space.lg, backgroundColor: '#171F37' },
  changeRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  changeBefore: { flex: 1, color: '#AAB4C6', fontSize: 14, lineHeight: 20 },
  changeAfter: { color: '#4C8BF5', fontSize: 14, lineHeight: 20, fontWeight: '900' },
  changeSuccess: { color: '#3DD68C' },
  voiceWrap: { alignItems: 'center', gap: space.xxl },
  voiceHalo: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E315F' },
  voiceButton: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4C8BF5', borderWidth: 1, borderColor: '#72A2F8' },
  speechBubble: { maxWidth: 340, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: space.lg, backgroundColor: '#171F37' },
  speechText: { color: '#DCE5F5', fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
});
