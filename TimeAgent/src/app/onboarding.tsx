import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, AppIconName } from '@/components/app-icon';
import { Button, Screen, type } from '@/components/app-ui';
import { color, radius, space } from '@/constants/design';
import { completeOnboarding } from '@/lib/onboarding';

const pages: {
  eyebrow: string;
  title: string;
  description: string;
  icon: AppIconName;
  detail: string;
}[] = [
  {
    eyebrow: '약속 시간에서 거꾸로',
    title: '언제 준비해야 할지\nON:TIME이 계산해요',
    description: '약속 시각, 준비 행동, 이동 시간을 합쳐 지금 해야 할 일을 순서대로 알려드려요.',
    icon: 'time',
    detail: '준비 시작 · 출발 · 예상 도착을 한눈에',
  },
  {
    eyebrow: '계획이 늦어져도 괜찮아요',
    title: '현재 속도에 맞춰\n계획을 다시 맞춰요',
    description: '준비가 길어지면 남은 시간을 다시 계산하고, 적용 전에 변경 내용을 먼저 보여드려요.',
    icon: 'coach',
    detail: '사용자 확인 없이 일정을 바꾸지 않아요',
  },
  {
    eyebrow: '이동 중에도 놓치지 않게',
    title: '현위치와 경로를 보고\n중요한 순간에 들어요',
    description: 'NAVER 지도와 TMAP 도보 경로로 남은 시간과 거리를 확인하고, 다음 행동을 음성으로 안내받아요.',
    icon: 'navigation',
    detail: '위치 권한은 이동 안내에만 사용해요',
  },
];

export default function OnboardingScreen() {
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const current = pages[page];

  const startFirstSchedule = async () => {
    if (saving) return;
    setSaving(true);
    await completeOnboarding(AsyncStorage);
    router.replace({ pathname: '/create', params: { new: '1' } });
  };

  return (
    <Screen scroll={false} safeBottom>
      <View style={styles.topBar}>
        <Text style={styles.brand}>ON:TIME</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="온보딩 건너뛰고 첫 일정 만들기" onPress={() => void startFirstSchedule()} disabled={saving} hitSlop={8}>
          <Text style={styles.skip}>건너뛰기</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.visual}>
          <View style={styles.iconHalo}><AppIcon name={current.icon} size={58} strokeWidth={2.2} iconColor={color.deepBlue} /></View>
          <View style={styles.detailPill}><AppIcon name="check" size={17} iconColor={color.success} /><Text style={styles.detail}>{current.detail}</Text></View>
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{current.eyebrow}</Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={type.bodyMuted}>{current.description}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View accessibilityLabel={`${page + 1} / ${pages.length} 페이지`} style={styles.dots}>
          {pages.map((item, index) => <View key={item.eyebrow} style={[styles.dot, index === page && styles.dotActive]} />)}
        </View>
        <Button
          label={page === pages.length - 1 ? saving ? '준비 중…' : '첫 일정 만들기' : '다음'}
          disabled={saving}
          onPress={() => page === pages.length - 1 ? void startFirstSchedule() : setPage(page + 1)}
        />
        {page > 0 ? <Button label="이전" variant="ghost" disabled={saving} onPress={() => setPage(page - 1)} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: color.navy, fontSize: 16, fontWeight: '900', letterSpacing: 0.6 },
  skip: { color: color.textMuted, fontSize: 14, fontWeight: '800', paddingVertical: space.sm },
  content: { flex: 1, justifyContent: 'center', gap: space.xxl },
  visual: { flex: 1, minHeight: 210, maxHeight: 290, borderRadius: radius.lg, backgroundColor: color.ice, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  iconHalo: { width: 108, height: 108, borderRadius: 54, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.border },
  detailPill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: color.surface, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 14 },
  detail: { flexShrink: 1, color: color.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  copy: { gap: space.md },
  eyebrow: { color: color.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  title: { color: color.navy, fontSize: 31, lineHeight: 40, fontWeight: '900', letterSpacing: -0.8 },
  footer: { gap: space.sm, paddingBottom: space.md },
  dots: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.border },
  dotActive: { width: 24, backgroundColor: color.deepBlue },
});
