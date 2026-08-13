import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Header, Screen, StatusPill, useAppType } from '@/components/app-ui';
import { AppIcon } from '@/components/app-icon';
import { space } from '@/constants/design';
import { AppPalette, useAppTheme, useThemedStyles } from '@/state/theme-context';
import { useSchedule } from '@/state/schedule-context';

export default function CompleteScreen() {
  const styles = useThemedStyles(createStyles);
  const c = useAppTheme().palette;
  const type = useAppType();
  const {
    lastPersonalizationLearnedCount,
    personalizationProfile,
    personalizationStatus,
    progressSession,
    resetDemo,
  } = useSchedule();
  const actualRows = progressSession?.timeline.filter((step) => step.actualDurationMinutes && step.id !== 'arrive') ?? [];
  const totalSamples = personalizationProfile.routines.reduce((total, stat) => total + stat.sampleCount, 0)
    + personalizationProfile.transports.reduce((total, stat) => total + stat.sampleCount, 0);

  return (
    <Screen>
      <Header title="일정 완료" eyebrow="오늘도 수고했어요" />
      <Card dark style={styles.hero}>
        <View style={styles.successIcon}><AppIcon name="success" size={28} iconColor={c.cyan} /></View>
        <StatusPill label="실제 시간 기록 완료" tone="success" />
        <Text style={styles.big}>도착 확인</Text>
        <Text style={styles.heroBody}>이번 일정의 실제 소요 시간을 저장했어요.</Text>
      </Card>

      <Card style={styles.coach}>
        <View style={styles.coachIcon}><AppIcon name="coach" size={20} /></View>
        <View style={{ flex: 1 }}><Text style={styles.coachTitle}>다음에는 더 정확하게</Text><Text style={type.bodyMuted}>{lastPersonalizationLearnedCount > 0 ? `이번 기록 ${lastPersonalizationLearnedCount}개를 학습해 다음 계획의 준비·이동 시간을 조정합니다.` : personalizationProfile.enabled ? '실제 시간이 기록된 단계부터 다음 계획에 반영합니다.' : '시간 학습이 꺼져 있어 이번 기록은 개인화에 사용하지 않았습니다.'}</Text></View>
      </Card>

      <Text style={type.heading}>오늘의 실제 기록</Text>
      <Card>
        {actualRows.length > 0 ? actualRows.map((step, index) => {
          const actual = step.actualDurationMinutes!;
          const difference = actual - step.duration;
          return <View key={step.id} style={[styles.row, index < actualRows.length - 1 && styles.divider]}><View style={{ flex: 1 }}><Text style={type.body}>{step.title}</Text><Text style={type.caption}>계획 {step.duration}분</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={styles.value}>실제 {actual}분</Text><Text style={[styles.difference, difference > 0 && styles.slower]}>{difference === 0 ? '계획과 같음' : difference > 0 ? `${difference}분 더 걸림` : `${Math.abs(difference)}분 빠름`}</Text></View></View>;
        }) : <Text style={type.bodyMuted}>실제 시간이 기록된 단계가 없습니다.</Text>}
      </Card>

      <Card style={styles.learningCard}>
        <View style={styles.learningHeader}><AppIcon name="time" size={22} /><View style={{ flex: 1 }}><Text style={type.heading}>개인화 학습 상태</Text><Text style={type.bodyMuted}>{personalizationProfile.enabled ? `사용 중 · 누적 실제 기록 ${totalSamples}개` : '사용 안 함 · 저장된 기록은 설정에서 초기화 가능'}</Text></View><StatusPill label={personalizationStatus === 'error' ? '저장 확인 필요' : personalizationProfile.enabled ? '반영 중' : '꺼짐'} tone={personalizationStatus === 'error' ? 'danger' : personalizationProfile.enabled ? 'success' : 'warning'} /></View>
        <Text style={type.caption}>완료한 단계의 소요 시간만 이 기기에 저장하며, 다음 계획에서 변경 전후와 기록 횟수를 보여줍니다.</Text>
      </Card>

      <Button label="홈으로 돌아가기" onPress={async () => { await resetDemo(); router.replace('/'); }} />
    </Screen>
  );
}

const createStyles = (c: AppPalette) => StyleSheet.create({
  hero: { gap: space.md, alignItems: 'flex-start' },
  successIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,180,216,.16)' },
  big: { fontSize: 42, color: c.onInverse, fontWeight: '900' },
  heroBody: { fontSize: 16, color: c.onInverseMuted },
  coach: { flexDirection: 'row', gap: space.md, backgroundColor: c.infoSoft },
  coachIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  coachTitle: { fontSize: 15, color: c.deepBlue, fontWeight: '900', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.border },
  value: { color: c.navy, fontSize: 15, fontWeight: '900' },
  difference: { color: c.success, fontSize: 12, fontWeight: '800', marginTop: 3 },
  slower: { color: c.warning },
  learningCard: { gap: space.md },
  learningHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
});
