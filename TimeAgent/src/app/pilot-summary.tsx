import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { AppIcon, IconButton } from '@/components/app-icon';
import { Button, Card, Header, Screen, StatusPill, type } from '@/components/app-ui';
import { color, radius, space } from '@/constants/design';
import { AnalyticsStore, createEmptyAnalyticsStore, loadAnalyticsStore, recordAnalyticsEvent } from '@/lib/analytics';
import { PlusInterestState, createEmptyPlusInterestState, loadPlusInterest } from '@/lib/monetization';
import {
  PILOT_SEGMENTS,
  PilotSegment,
  buildPilotSummary,
  formatPilotSummaryText,
} from '@/lib/pilot-summary';

type ScreenStatus = 'loading' | 'ready' | 'sharing' | 'awaiting-confirmation' | 'shared' | 'cancelled' | 'error';

export default function PilotSummaryScreen() {
  const [analytics, setAnalytics] = useState<AnalyticsStore>(createEmptyAnalyticsStore);
  const [interest, setInterest] = useState<PlusInterestState>(createEmptyPlusInterestState);
  const [segment, setSegment] = useState<PilotSegment | null>(null);
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadState = useCallback(() => Promise.all([
    loadAnalyticsStore(AsyncStorage),
    loadPlusInterest(AsyncStorage),
  ]).then(([savedAnalytics, savedInterest]) => {
    setAnalytics(savedAnalytics);
    setInterest(savedInterest);
    setHasLoaded(true);
    setStatus('ready');
  }).catch(() => {
    setHasLoaded(false);
    setStatus('error');
  }), []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const preview = useMemo(
    () => buildPilotSummary(analytics, interest, segment ?? 'prefer-not-to-answer'),
    [analytics, interest, segment],
  );

  const shareSummary = async () => {
    if (!segment || !consented || status === 'sharing') return;
    const summary = buildPilotSummary(analytics, interest, segment);
    setStatus('sharing');
    try {
      const result = await Share.share({
        title: 'TimeAgent Phase 0 테스트 결과',
        message: formatPilotSummaryText(summary),
      });
      if (result.action === Share.sharedAction) {
        setStatus('awaiting-confirmation');
      } else {
        setStatus('cancelled');
      }
    } catch {
      setStatus('error');
    }
  };

  const confirmShared = async () => {
    if (!segment || status !== 'awaiting-confirmation') return;
    const summary = buildPilotSummary(analytics, interest, segment);
    setStatus('sharing');
    try {
      await recordAnalyticsEvent(AsyncStorage, 'pilot_summary_shared', {
        segment,
        completedSchedules: summary.completedSchedules,
      });
      setStatus('shared');
    } catch {
      setStatus('error');
    }
  };

  const canShare = hasLoaded && segment !== null && consented && status !== 'sharing';

  return (
    <Screen>
      <Header
        title="Phase 0 테스트 결과"
        eyebrow="내가 확인하고 선택해서 공유"
        right={<IconButton name="close" label="테스트 결과 닫기" onPress={() => router.back()} />}
      />

      <Card dark style={styles.hero}>
        <StatusPill label="비식별 집계" tone="info" />
        <Text style={styles.heroTitle}>수익화 검증에 필요한 수치만</Text>
        <Text style={styles.heroBody}>일정 내용이나 위치 대신 이 기기의 완료 횟수와 Plus 관심 결과만 확인해요.</Text>
      </Card>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={type.heading}>나와 가까운 사용자 유형</Text>
        <Text style={type.bodyMuted}>하나를 직접 선택하세요. 선택 전에는 공유할 수 없습니다.</Text>
      </View>

      <View accessibilityRole="radiogroup" style={styles.segmentList}>
        {PILOT_SEGMENTS.map((option) => {
          const selected = segment === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${option.label}${selected ? ', 선택됨' : ''}`}
              onPress={() => { setSegment(option.id); setStatus('ready'); }}
              style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && styles.pressed]}
            >
              <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
              <View style={styles.flex}><View style={styles.segmentTitleRow}><Text style={styles.segmentLabel}>{option.label}</Text>{selected ? <Text style={styles.selectedText}>선택됨</Text> : null}</View><Text style={type.caption}>{option.detail}</Text></View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={type.heading}>공유될 집계값</Text>
        <Text style={type.bodyMuted}>아래 내용은 공유창이 열리기 전에도 모두 확인할 수 있어요.</Text>
      </View>

      <Card style={styles.metrics}>
        <Metric label="사용자 유형" value={segment ? preview.segmentLabel : '선택 필요'} />
        <Metric label="완료 일정" value={`${preview.completedSchedules}회`} />
        <Metric label="첫 일정 생성 완료율" value={formatRate(preview.scheduleCompletionRate)} />
        <Metric label="알림에서 준비 시작률" value={formatRate(preview.notificationStartRate)} />
        <Metric label="지연안 적용 / 거절" value={`${formatRate(preview.delayApplyRate)} / ${formatRate(preview.delayRejectRate)}`} />
        <Metric label="평균 단계 시간 오차" value={preview.averageStepErrorMinutes === null ? '측정 대기' : `${preview.averageStepErrorMinutes}분`} />
        <Metric label="정시 도착률" value={formatRate(preview.onTimeArrivalRate)} />
        <Metric label="Plus 화면 확인" value={`${preview.plusOfferViews}회`} />
        <Metric label="Plus 관심 / 철회" value={`${preview.plusInterestSelections} / ${preview.plusInterestWithdrawals}회`} />
        <Metric label="현재 관심 상태" value={preview.interestStatusLabel} />
        <Metric label="선택 가격안" value={preview.selectedPlanLabel} last />
      </Card>

      <Card style={styles.privacy}>
        <View style={styles.privacyHeader}><AppIcon name="check" size={22} /><Text style={[type.heading, styles.flex]}>포함하지 않는 정보</Text></View>
        <Text style={type.bodyMuted}>일정명 · 장소 · 위치 · 음성 · 연락처 · 기기 식별자 · 정확한 이벤트 시각</Text>
        <Text style={type.caption}>앱은 서버로 자동 전송하지 않고 수신자를 선택하지 않아요.</Text>
      </Card>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consented }}
        accessibilityLabel="공유할 집계값과 제외 정보를 확인했습니다"
        onPress={() => setConsented((current) => !current)}
        style={({ pressed }) => [styles.consent, consented && styles.consentChecked, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, consented && styles.checkboxChecked]}>{consented ? <AppIcon name="check" size={18} iconColor={color.surface} /> : null}</View>
        <Text style={[type.body, styles.flex]}>공유할 집계값과 제외 정보를 확인했습니다.</Text>
      </Pressable>

      {status === 'error' ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>{hasLoaded ? '공유창을 열지 못했어요' : '테스트 결과를 불러오지 못했어요'}</Text>
          <Text style={type.bodyMuted}>{hasLoaded ? '데이터는 전송되지 않았습니다. 다시 시도할 수 있어요.' : '기본 빈 집계 상태를 유지했습니다.'}</Text>
          {!hasLoaded ? <Button label="다시 불러오기" variant="secondary" onPress={() => { setStatus('loading'); void loadState(); }} /> : null}
        </Card>
      ) : null}

      {status === 'awaiting-confirmation' ? (
        <Card style={styles.confirmCard}>
          <Text style={type.heading}>실제로 결과를 전달했나요?</Text>
          <Text style={type.bodyMuted}>Android는 공유창을 닫은 것과 실제 전달을 구분하지 못해 한 번 더 확인합니다.</Text>
          <View style={styles.confirmActions}>
            <View style={styles.flex}><Button label="공유하지 않았어요" variant="secondary" onPress={() => setStatus('cancelled')} /></View>
            <View style={styles.flex}><Button label="공유 완료 확인" onPress={() => void confirmShared()} /></View>
          </View>
        </Card>
      ) : null}

      {status !== 'awaiting-confirmation' ? (
        <Button
          label={status === 'sharing' ? '처리 중' : '검증 결과 공유하기'}
          onPress={() => void shareSummary()}
          disabled={!canShare}
          accessibilityHint={!segment ? '사용자 유형을 먼저 선택하세요' : !consented ? '공유 항목 확인에 먼저 동의하세요' : '운영체제 공유창을 엽니다'}
        />
      ) : null}

      <Text accessibilityLiveRegion="polite" style={[styles.status, status === 'error' && styles.errorText]}>
        {status === 'loading' ? '테스트 결과를 불러오는 중입니다'
          : status === 'sharing' ? '운영체제 공유 결과를 처리하는 중입니다'
            : status === 'awaiting-confirmation' ? '실제 공유 완료 여부를 확인해 주세요'
              : status === 'shared' ? '사용자가 공유 완료를 확인했습니다'
              : status === 'cancelled' ? '공유를 취소했습니다. 데이터는 전송되지 않았습니다'
                : status === 'error' ? '공유하지 못했습니다. 다시 시도할 수 있습니다'
                  : !segment ? '사용자 유형을 선택해 주세요'
                    : !consented ? '공유할 항목을 확인해 주세요'
                      : '운영체제 공유창을 열 준비가 됐습니다'}
      </Text>
    </Screen>
  );
}

function Metric({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.metric, last && styles.metricLast]}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function formatRate(value: number | null) {
  return value === null ? '측정 대기' : `${value}%`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: space.md },
  heroTitle: { color: color.surface, fontSize: 28, lineHeight: 35, fontWeight: '900' },
  heroBody: { color: color.ice, fontSize: 16, lineHeight: 24 },
  section: { gap: space.xs },
  segmentList: { gap: space.sm },
  segment: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  segmentSelected: { borderWidth: 2, borderColor: color.deepBlue, backgroundColor: '#F3FAFD' },
  segmentTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  segmentLabel: { color: color.navy, fontSize: 16, lineHeight: 23, fontWeight: '900' },
  selectedText: { color: color.deepBlue, fontSize: 12, fontWeight: '900' },
  radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.deepBlue, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.deepBlue },
  pressed: { opacity: 0.72 },
  metrics: { paddingVertical: 4 },
  metric: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  metricLast: { borderBottomWidth: 0 },
  metricLabel: { flex: 1, color: color.textMuted, fontSize: 14, lineHeight: 20 },
  metricValue: { maxWidth: '48%', color: color.deepBlue, fontSize: 14, lineHeight: 20, fontWeight: '900', textAlign: 'right' },
  privacy: { gap: space.md, backgroundColor: color.surfaceMuted },
  privacyHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  consent: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  consentChecked: { borderColor: color.deepBlue, backgroundColor: '#F3FAFD' },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: color.deepBlue, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: color.deepBlue },
  errorCard: { gap: space.sm, borderColor: color.danger, backgroundColor: color.dangerSoft },
  errorTitle: { ...type.heading, color: color.danger },
  confirmCard: { gap: space.md, borderColor: color.deepBlue, backgroundColor: '#F3FAFD' },
  confirmActions: { flexDirection: 'row', gap: space.sm },
  status: { ...type.caption, textAlign: 'center', paddingHorizontal: space.md },
  errorText: { color: color.danger },
});
