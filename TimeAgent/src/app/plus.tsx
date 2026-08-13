import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon, IconButton } from '@/components/app-icon';
import { Button, Card, Header, Screen, StatusPill, appType, useAppType } from '@/components/app-ui';
import { radius, space } from '@/constants/design';
import { AppPalette, useThemedStyles } from '@/state/theme-context';
import { loadAnalyticsStore, recordAnalyticsEvent } from '@/lib/analytics';
import {
  PLUS_PLAN_OPTIONS,
  PlusInterestState,
  PlusOfferEligibility,
  PlusPlan,
  createEmptyPlusInterestState,
  getPlusOfferEligibility,
  loadPlusInterest,
  plusPlanLabel,
  savePlusInterest,
  withdrawPlusInterest,
} from '@/lib/monetization';

type ScreenStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error';

const emptyEligibility: PlusOfferEligibility = {
  eligible: false,
  completedSchedules: 0,
  remainingSchedules: 3,
};

export default function PlusScreen() {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  const viewed = useRef(false);
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [eligibility, setEligibility] = useState(emptyEligibility);
  const [interest, setInterest] = useState<PlusInterestState>(createEmptyPlusInterestState);
  const [selectedPlan, setSelectedPlan] = useState<PlusPlan>('annual');
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  const loadState = useCallback(() => {
    return Promise.all([loadAnalyticsStore(AsyncStorage), loadPlusInterest(AsyncStorage)])
      .then(([analytics, savedInterest]) => {
        const nextEligibility = getPlusOfferEligibility(analytics);
        setEligibility(nextEligibility);
        setInterest(savedInterest);
        if (savedInterest.plan) setSelectedPlan(savedInterest.plan);
        setHasLoaded(true);
        setStatus('ready');
        if (!viewed.current) {
          viewed.current = true;
          void recordAnalyticsEvent(AsyncStorage, 'plus_offer_viewed', {
            eligible: nextEligibility.eligible,
            completedSchedules: nextEligibility.completedSchedules,
          });
        }
      })
      .catch(() => {
        setHasLoaded(false);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const registerInterest = async () => {
    if (!eligibility.eligible || status === 'saving') return;
    const previousPlan = interest.plan;
    setStatus('saving');
    try {
      const next = await savePlusInterest(AsyncStorage, selectedPlan);
      setInterest(next);
      setStatus('saved');
      void recordAnalyticsEvent(AsyncStorage, 'plus_interest_selected', {
        plan: selectedPlan,
        previousPlan,
      });
    } catch {
      setStatus('error');
    }
  };

  const confirmWithdrawal = async () => {
    if (status === 'saving') return;
    const previousPlan = interest.plan;
    setStatus('saving');
    try {
      const next = await withdrawPlusInterest(AsyncStorage);
      setInterest(next);
      setShowWithdrawConfirm(false);
      setStatus('saved');
      void recordAnalyticsEvent(AsyncStorage, 'plus_interest_withdrawn', { previousPlan });
    } catch {
      setStatus('error');
    }
  };

  const selectionIsSaved = interest.status === 'interested' && interest.plan === selectedPlan;

  return (
    <Screen>
      <Header
        title="TimeAgent Plus"
        eyebrow="결제 전 사전 수요 검증"
        right={<IconButton name="close" label="Plus 미리보기 닫기" onPress={() => router.back()} />}
      />

      <Card dark style={styles.hero}>
        <StatusPill label="출시 후보" tone="info" />
        <Text style={styles.heroTitle}>반복 계획은 더 자동으로</Text>
        <Text style={styles.heroBody}>무제한 스마트 계획, 여러 캘린더 자동화, 실제 준비 시간 리포트에 대한 관심을 확인하고 있어요.</Text>
      </Card>

      <Card style={styles.gateCard} accessibilityLabel="Plus 사전등록 자격 상태">
        <View style={styles.gateHeader}>
          <View style={styles.gateIcon}><AppIcon name={eligibility.eligible ? 'success' : 'time'} size={22} /></View>
          <View style={styles.flex}>
            <Text style={type.heading}>{eligibility.eligible ? '사전등록할 수 있어요' : `일정 ${eligibility.remainingSchedules}회 더 완료해 주세요`}</Text>
            <Text style={type.bodyMuted}>누적 완료 {eligibility.completedSchedules}회 · 기준 3회</Text>
          </View>
        </View>
        <Text style={type.caption}>{eligibility.eligible ? '핵심 흐름을 충분히 경험한 뒤 원하는 가격안을 선택할 수 있어요.' : '먼저 실제 일정에서 준비 시작과 완료를 경험한 뒤 Plus 의견을 받을게요.'}</Text>
      </Card>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={type.heading}>관심 있는 가격안</Text>
        <Text style={type.bodyMuted}>가격은 확정이 아닌 검증안이며, 선택해도 결제되지 않습니다.</Text>
      </View>

      <View accessibilityRole="radiogroup" style={styles.planList}>
        {PLUS_PLAN_OPTIONS.map((plan) => {
          const selected = selectedPlan === plan.id;
          return (
            <Pressable
              key={plan.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !eligibility.eligible }}
              accessibilityLabel={`${plan.name}, ${plan.price}${selected ? ', 선택됨' : ''}`}
              disabled={!eligibility.eligible || status === 'saving'}
              onPress={() => setSelectedPlan(plan.id)}
              style={({ pressed }) => [styles.plan, selected && styles.planSelected, pressed && styles.pressed, !eligibility.eligible && styles.disabled]}
            >
              <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
              <View style={styles.flex}>
                <View style={styles.planTitleRow}><Text style={styles.planName}>{plan.name}</Text>{selected ? <Text style={styles.selectedText}>선택됨</Text> : null}</View>
                <Text style={styles.planPrice}>{plan.price}</Text>
                <Text style={type.caption}>{plan.detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.benefits}>
        <Text accessibilityRole="header" style={type.heading}>Plus 출시 후보 기능</Text>
        <Benefit text="스마트 계획·지연 재계산·AI 입력 무제한 후보" />
        <Benefit text="여러 캘린더 자동 동기화 후보" />
        <Benefit text="실제 준비 시간 기반 장기 리포트 후보" />
        <Text style={styles.candidate}>아직 제공이 확정된 기능이 아니며 의견에 따라 구성이 달라질 수 있어요.</Text>
      </Card>

      <Card style={styles.notice}>
        <View style={styles.noticeRow}><AppIcon name="check" size={20} /><Text style={[type.body, styles.flex]}>지금은 결제와 자동 갱신이 없습니다.</Text></View>
        <View style={styles.noticeRow}><AppIcon name="check" size={20} /><Text style={[type.body, styles.flex]}>연락처·일정·위치 정보도 수집하지 않습니다.</Text></View>
        <Text style={type.caption}>관심 상품과 선택 시각만 이 기기에 저장하며 언제든 철회할 수 있어요.</Text>
      </Card>

      {status === 'error' ? <Card style={styles.errorCard}><Text style={styles.errorTitle}>{hasLoaded ? '관심 상태를 저장하지 못했어요' : '관심 상태를 불러오지 못했어요'}</Text><Text style={type.bodyMuted}>{hasLoaded ? '현재 선택은 유지됩니다. 기기 저장 상태를 확인하고 다시 시도해 주세요.' : '기본 미등록 상태를 유지했습니다. 기기 저장 상태를 확인하고 다시 불러와 주세요.'}</Text>{!hasLoaded ? <Button label="다시 불러오기" variant="secondary" onPress={() => { setStatus('loading'); void loadState(); }} /> : null}</Card> : null}

      {interest.status === 'interested' ? (
        <Card style={styles.registered}>
          <StatusPill label="관심 등록됨" tone="success" />
          <Text style={type.heading}>{plusPlanLabel(interest.plan)}</Text>
          <Text style={type.bodyMuted}>결제나 출시 알림 신청은 아니며 이 기기의 수요 검증에만 반영돼요.</Text>
          {!showWithdrawConfirm ? (
            <Button label="관심 등록 철회" variant="secondary" onPress={() => setShowWithdrawConfirm(true)} />
          ) : (
            <View style={styles.withdrawPanel}>
              <Text style={type.body}>이 기기에 저장된 Plus 관심을 철회할까요?</Text>
              <View style={styles.actions}>
                <View style={styles.flex}><Button label="계속 유지" variant="secondary" onPress={() => setShowWithdrawConfirm(false)} /></View>
                <View style={styles.flex}><Button label="철회 확인" onPress={() => void confirmWithdrawal()} /></View>
              </View>
            </View>
          )}
        </Card>
      ) : null}

      {!showWithdrawConfirm ? (
        <Button
          label={selectionIsSaved ? '이 플랜에 관심 등록됨' : status === 'saving' ? '저장 중' : '이 플랜에 관심 있어요'}
          onPress={() => void registerInterest()}
          disabled={!eligibility.eligible || status === 'loading' || status === 'saving' || selectionIsSaved}
          accessibilityHint={eligibility.eligible ? '결제 없이 선택 상품을 이 기기에 저장합니다' : `일정 ${eligibility.remainingSchedules}회 완료 후 사용할 수 있습니다`}
        />
      ) : null}

      <Text accessibilityLiveRegion="polite" style={[styles.status, status === 'error' && styles.errorText]}>
        {status === 'loading' ? 'Plus 관심 상태를 불러오는 중입니다'
          : status === 'saving' ? 'Plus 관심 상태를 저장하는 중입니다'
            : status === 'error' ? '저장하지 못했습니다. 다시 시도할 수 있습니다'
              : interest.status === 'interested' ? `${plusPlanLabel(interest.plan)} 관심 상태가 이 기기에 저장됐습니다`
                : eligibility.eligible ? '가격안을 선택하고 관심을 표시할 수 있습니다'
                  : `일정을 ${eligibility.remainingSchedules}회 더 완료하면 관심을 표시할 수 있습니다`}
      </Text>
    </Screen>
  );
}

function Benefit({ text }: { text: string }) {
  const styles = useThemedStyles(createStyles);
  const type = useAppType();
  return <View style={styles.benefit}><AppIcon name="check" size={18} /><Text style={[type.bodyMuted, styles.flex]}>{text}</Text></View>;
}

const createStyles = (c: AppPalette) => {
  const type = appType(c);
  return StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: space.md },
  heroTitle: { color: c.onInverse, fontSize: 28, lineHeight: 35, fontWeight: '900' },
  heroBody: { color: c.onInverseMuted, fontSize: 16, lineHeight: 24 },
  gateCard: { gap: space.md },
  gateHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  gateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ice },
  section: { gap: space.xs },
  planList: { gap: space.sm },
  plan: { minHeight: 116, flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  planSelected: { borderWidth: 2, borderColor: c.deepBlue, backgroundColor: c.selectedSoft },
  radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.deepBlue, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.deepBlue },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  planName: { color: c.navy, fontSize: 16, lineHeight: 23, fontWeight: '900' },
  selectedText: { color: c.deepBlue, fontSize: 12, fontWeight: '900' },
  planPrice: { color: c.deepBlue, fontSize: 20, lineHeight: 28, fontWeight: '900', marginVertical: 2 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  benefits: { gap: space.md },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  candidate: { ...type.caption, color: c.warning },
  notice: { gap: space.md, backgroundColor: c.surfaceMuted },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  errorCard: { gap: space.sm, borderColor: c.danger, backgroundColor: c.dangerSoft },
  errorTitle: { ...type.heading, color: c.danger },
  registered: { gap: space.md, borderColor: c.success, backgroundColor: c.successSoft },
  withdrawPanel: { gap: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
  status: { ...type.caption, textAlign: 'center', paddingHorizontal: space.md },
  errorText: { color: c.danger },
  });
};
