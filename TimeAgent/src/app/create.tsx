import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Header, Screen, SectionTitle, type } from '@/components/app-ui';
import { AppIcon, AppIconName, IconButton, iconForRoutine, iconForTransport } from '@/components/app-icon';
import { DestinationPicker } from '@/components/destination-picker';
import { color, radius, space } from '@/constants/design';
import { isGeneratedScheduleTitle, ScheduleDraft, TransportMode } from '@/lib/schedule-draft';
import { addRoutine } from '@/lib/ui-controls';
import { useSchedule } from '@/state/schedule-context';

const steps = ['약속 정보', '이동 정보', '준비 행동'];
const transports: TransportMode[] = ['AI 추천', '도보', '버스', '지하철', '자가용', '택시'];

export default function CreateScreen() {
  const { beginDraft, draft, draftStatus, finalizeDraft, setDraftStep, updateDraft } = useSchedule();
  const params = useLocalSearchParams<{ new?: string; calendarImport?: string }>();
  const { step } = draft;
  const [planError, setPlanError] = useState('');

  useEffect(() => {
    beginDraft(params.new === '1');
  }, [beginDraft, params.new]);

  const createPlan = async () => {
    try {
      setPlanError('');
      await finalizeDraft();
      router.replace('/plan');
    } catch {
      setPlanError('약속 시간을 00:00부터 23:59 사이의 형식으로 확인해 주세요.');
    }
  };

  const nextFromAppointment = () => {
    if (!draft.title.trim() || !draft.date.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.appointmentTime)) {
      setPlanError('일정 이름·날짜와 약속 시간을 확인해 주세요. 시간은 00:00부터 23:59 사이로 입력합니다.');
      return;
    }
    if (!draft.destination.trim() || !draft.destinationCoordinate) {
      setPlanError('목적지를 검색 결과에서 선택하거나 지도에서 위치를 지정해 주세요.');
      return;
    }
    setPlanError('');
    setDraftStep(1);
  };

  return (
    <Screen>
      <Header title="새 일정 만들기" eyebrow="1분 안에 등록할 수 있어요" right={<IconButton name="close" label="닫기" variant="plain" onPress={() => router.back()} />} />
      <View style={styles.steps}>{steps.map((label, index) => <View key={label} style={styles.stepItem}><View style={[styles.stepDot, index <= step && styles.stepDotActive]}><Text style={[styles.stepNumber, index <= step && styles.stepNumberActive]}>{index + 1}</Text></View><Text style={[styles.stepLabel, index === step && styles.stepLabelActive]}>{label}</Text></View>)}</View>

      {step === 0 && params.calendarImport ? <Card style={styles.importNotice} accessibilityLabel="캘린더 일정 가져오기 안내"><View style={styles.importNoticeTitle}><AppIcon name="calendar" size={20} /><Text style={styles.importNoticeHeading}>캘린더에서 가져왔어요</Text></View><Text style={type.bodyMuted}>{params.calendarImport === 'all-day' ? '종일 일정에는 약속 시간이 없습니다. 다음으로 가기 전에 시간을 입력해 주세요.' : '날짜·시간·목적지를 확인한 뒤 필요한 내용을 수정해 주세요.'}</Text></Card> : null}
      {step === 0 ? <AppointmentForm draft={draft} onChange={updateDraft} /> : null}
      {step === 1 ? <TransportForm draft={draft} onChange={updateDraft} /> : null}
      {step === 2 ? <RoutineForm draft={draft} onChange={updateDraft} /> : null}

      {step === 0 ? <Button label="음성 대화로 다시 확인" variant="secondary" accessibilityHint="AI가 현재 입력 내용을 바탕으로 모호한 항목만 다시 묻습니다" onPress={() => router.push('/voice-schedule')} /> : null}
      <View style={styles.actions}>
        {step > 0 ? <Button label="이전" variant="secondary" onPress={() => setDraftStep((step - 1) as 0 | 1)} /> : null}
        <View style={{ flex: 1 }}><Button label={step === 2 ? 'AI 계획 만들기' : '다음'} onPress={() => step === 2 ? void createPlan() : step === 0 ? nextFromAppointment() : setDraftStep(2)} /></View>
      </View>
      {planError ? <Text accessibilityRole="alert" style={styles.formError}>{planError}</Text> : null}
      <Text accessibilityLiveRegion="polite" style={[styles.saved, draftStatus === 'error' && styles.savedError]}>
        {draftStatus === 'loading' ? '저장된 일정을 불러오는 중입니다'
          : draftStatus === 'saving' ? '입력 내용을 저장하는 중입니다'
            : draftStatus === 'error' ? '자동 저장하지 못했습니다. 입력 내용은 현재 화면에 유지됩니다'
              : '입력 내용이 자동 저장됐습니다'}
      </Text>
    </Screen>
  );
}

function AppointmentForm({ draft, onChange }: DraftFormProps) {
  return <View style={styles.form}><SectionTitle>언제, 어디에서 만나나요?</SectionTitle><Field label="일정 이름" value={draft.title} replaceOnInput={isGeneratedScheduleTitle(draft.title)} onChangeText={(title) => onChange({ title })} /><View style={styles.row}><View style={{ flex: 1 }}><Field label="날짜" value={draft.date} onChangeText={(date) => onChange({ date })} /></View><View style={{ flex: 1 }}><Field label="약속 시간" value={draft.appointmentTime} onChangeText={(appointmentTime) => onChange({ appointmentTime })} /></View></View><DestinationPicker value={draft} onChange={onChange} /></View>;
}

function TransportForm({ draft, onChange }: DraftFormProps) {
  return <View style={styles.form}><SectionTitle>어떻게 이동할까요?</SectionTitle><View style={styles.choiceGrid}>{transports.map((item) => { const active = draft.transport === item; return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} key={item} onPress={() => onChange({ transport: item })} style={[styles.choice, active && styles.choiceActive]}><AppIcon name={iconForTransport(item)} size={26} strokeWidth={2} iconColor={active ? color.cyan : color.deepBlue} /><Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{item}</Text></Pressable>; })}</View><Card><Text style={type.heading}>도착 우선순위</Text><Text style={[type.bodyMuted, { marginTop: 4 }]}>중요한 약속이라 정시 도착을 우선해요.</Text><View style={styles.segment}><Pressable accessibilityRole="radio" accessibilityState={{ checked: draft.priority === 'on-time' }} onPress={() => onChange({ priority: 'on-time' })} style={[styles.segmentOption, draft.priority === 'on-time' && styles.segmentActive]}><Text style={[styles.segmentText, draft.priority === 'on-time' && styles.segmentTextActive]}>정시 도착 우선</Text></Pressable><Pressable accessibilityRole="radio" accessibilityState={{ checked: draft.priority === 'cost' }} onPress={() => onChange({ priority: 'cost' })} style={[styles.segmentOption, draft.priority === 'cost' && styles.segmentActive]}><Text style={[styles.segmentText, draft.priority === 'cost' && styles.segmentTextActive]}>비용 우선</Text></Pressable></View></Card></View>;
}

function RoutineForm({ draft, onChange }: DraftFormProps) {
  const [showAddRoutine, setShowAddRoutine] = useState(false);
  const [routineLabel, setRoutineLabel] = useState('');
  const changeMinutes = (id: string, delta: number) => {
    onChange({ routines: draft.routines.map((routine) => routine.id === id ? { ...routine, minutes: Math.max(1, routine.minutes + delta) } : routine) });
  };
  const submitRoutine = () => {
    const next = addRoutine(draft.routines, routineLabel, `custom-${Date.now()}`);
    if (next === draft.routines) return;
    onChange({ routines: next });
    setRoutineLabel('');
    setShowAddRoutine(false);
  };

  return <View style={styles.form}><SectionTitle>무엇을 준비해야 하나요?</SectionTitle><Text style={type.bodyMuted}>설정한 기본 추천과 최근 기록을 시작점으로 보여드려요. 나에게 맞게 항목과 시간을 조정할 수 있어요.</Text>{draft.routines.map((item) => <Card key={item.id} style={styles.routine}><View style={styles.routineIcon}><AppIcon name={iconForRoutine(item.id, item.icon)} size={22} /></View><Text style={[type.body, { flex: 1, fontWeight: '800' }]}>{item.label}</Text><View style={styles.minuteControls}><Pressable accessibilityLabel={`${item.label} 1분 줄이기`} onPress={() => changeMinutes(item.id, -1)} style={styles.minuteButton}><AppIcon name="minus" size={18} /></Pressable><Text style={styles.minuteText}>{item.minutes}분</Text><Pressable accessibilityLabel={`${item.label} 1분 늘리기`} onPress={() => changeMinutes(item.id, 1)} style={styles.minuteButton}><AppIcon name="plus" size={18} /></Pressable></View></Card>)}{showAddRoutine ? <Card style={styles.addRoutinePanel}><Field label="추가할 준비 행동" value={routineLabel} onChangeText={setRoutineLabel} /><View style={styles.addRoutineActions}><View style={{ flex: 1 }}><Button label="취소" variant="secondary" onPress={() => { setRoutineLabel(''); setShowAddRoutine(false); }} /></View><View style={{ flex: 1 }}><Button label="행동 추가" onPress={submitRoutine} disabled={!routineLabel.trim()} /></View></View></Card> : <Pressable accessibilityRole="button" accessibilityLabel="준비 행동 추가" onPress={() => setShowAddRoutine(true)} style={styles.addRoutine}><AppIcon name="plus" size={18} /><Text style={styles.addRoutineText}>준비 행동 추가</Text></Pressable>}</View>;
}

type DraftFormProps = {
  draft: ScheduleDraft;
  onChange: (values: Partial<ScheduleDraft>) => void;
};

function Field({ label, value, icon, replaceOnInput = false, onChangeText }: { label: string; value: string; icon?: AppIconName; replaceOnInput?: boolean; onChangeText: (value: string) => void }) {
  return <View><Text style={styles.fieldLabel}>{label}</Text><View style={styles.field}>{icon ? <AppIcon name={icon} size={18} /> : null}<TextInput accessibilityLabel={label} accessibilityHint={replaceOnInput ? '입력을 시작하면 기본 이름이 지워집니다' : undefined} value={value} onFocus={() => { if (replaceOnInput) onChangeText(''); }} onChangeText={onChangeText} style={styles.input} /></View></View>;
}

const styles = StyleSheet.create({
  importNotice: { gap: space.sm, backgroundColor: color.ice, padding: space.lg }, importNoticeTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm }, importNoticeHeading: { color: color.navy, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md },
  stepItem: { flex: 1, alignItems: 'center', gap: 5 }, stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceMuted }, stepDotActive: { backgroundColor: color.deepBlue }, stepNumber: { color: color.textMuted, fontSize: 12, fontWeight: '900' }, stepNumberActive: { color: color.surface }, stepLabel: { fontSize: 11, color: color.textMuted }, stepLabelActive: { color: color.deepBlue, fontWeight: '800' },
  form: { gap: space.lg }, row: { flexDirection: 'row', gap: space.md }, fieldLabel: { fontSize: 13, color: color.textMuted, fontWeight: '700', marginBottom: 7 }, field: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: color.surface, borderWidth: 1, borderColor: color.border, borderRadius: radius.md, paddingHorizontal: space.lg }, input: { flex: 1, fontSize: 16, color: color.text, paddingVertical: 12 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, choice: { width: '31%', minHeight: 92, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', gap: 8 }, choiceActive: { backgroundColor: color.navy, borderColor: color.navy }, choiceLabel: { fontSize: 13, color: color.textMuted, fontWeight: '700' }, choiceLabelActive: { color: color.surface }, segment: { marginTop: space.lg, flexDirection: 'row', borderRadius: radius.pill, backgroundColor: color.surfaceMuted, padding: 4 }, segmentActive: { backgroundColor: color.deepBlue },
  segmentOption: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' }, segmentText: { color: color.textMuted, fontSize: 12, fontWeight: '700' }, segmentTextActive: { color: color.surface, fontWeight: '800' },
  routine: { flexDirection: 'row', alignItems: 'center', padding: space.lg, gap: space.sm }, routineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surfaceMuted }, minuteControls: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, backgroundColor: color.surfaceMuted }, minuteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, minuteText: { minWidth: 36, textAlign: 'center', color: color.deepBlue, fontSize: 13, fontWeight: '800' }, addRoutine: { minHeight: 48, flexDirection: 'row', gap: space.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: color.cyan, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, addRoutineText: { color: color.deepBlue, fontWeight: '800' },
  addRoutinePanel: { gap: space.md }, addRoutineActions: { flexDirection: 'row', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md }, formError: { color: color.danger, fontSize: 13, lineHeight: 18, textAlign: 'center' }, saved: { textAlign: 'center', color: color.textMuted, fontSize: 12 }, savedError: { color: color.danger },
});
