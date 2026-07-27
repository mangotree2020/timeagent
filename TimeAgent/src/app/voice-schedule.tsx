import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useId, useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Header, Screen, SectionTitle, StatusPill, type } from '@/components/app-ui';
import { AppIcon, IconButton } from '@/components/app-icon';
import { color, radius, space } from '@/constants/design';
import { canUseAppTts } from '@/lib/screen-reader-state';
import { ScheduleDraft } from '@/lib/schedule-draft';
import {
  applyVoiceSchedulePatch,
  describeVoiceScheduleChanges,
  VoiceScheduleAssistantReply,
} from '@/lib/voice-schedule-assistant';
import {
  createConfiguredVoiceScheduleProvider,
  inferVoiceScheduleAudioMimeType,
  VoiceScheduleHistoryTurn,
  VoiceScheduleInput,
} from '@/lib/voice-schedule-api';
import { useSchedule } from '@/state/schedule-context';

type FlowStatus = 'intro' | 'ready' | 'recording' | 'processing' | 'proposal' | 'error';

const PROPOSAL_FIXTURE: VoiceScheduleAssistantReply = {
  transcript: '내일 오전 10시 30분에 연산동 치과 가고 양치 5분 준비할래',
  assistantMessage: '내일 오전 10시 30분 치과 일정으로 이해했어요.',
  question: '정확한 주소를 알려주시면 이동 시간도 계산할 수 있어요.',
  readyToApply: false,
  patch: {
    title: '치과 진료', date: '7월 28일 (내일)', appointmentTime: '10:30', destination: '연산동 치과',
    routines: [{ id: 'voice-0', icon: 'routine', label: '양치', minutes: 5 }],
  },
};

export default function VoiceScheduleScreen() {
  const params = useLocalSearchParams<{ e2eState?: string }>();
  const { draft, updateDraft } = useSchedule();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const provider = useMemo(() => {
    try { return createConfiguredVoiceScheduleProvider(); } catch { return null; }
  }, []);
  const conversationId = `schedule_${useId().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const fixtureMode = params.e2eState === 'proposal';
  const [status, setStatus] = useState<FlowStatus>(() => fixtureMode ? 'proposal' : 'intro');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [reply, setReply] = useState<VoiceScheduleAssistantReply | null>(() => fixtureMode ? PROPOSAL_FIXTURE : null);
  const [proposal, setProposal] = useState<ScheduleDraft | null>(() => fixtureMode ? applyVoiceSchedulePatch(draft, PROPOSAL_FIXTURE.patch) : null);
  const [history, setHistory] = useState<VoiceScheduleHistoryTurn[]>([]);

  useEffect(() => () => { void Speech.stop(); }, []);

  const startRecording = async () => {
    setErrorMessage('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        setStatus('ready');
        setErrorMessage('마이크를 허용하지 않았습니다. 아래에 직접 입력하거나 기기 설정에서 권한을 바꿀 수 있어요.');
        return;
      }
      setPermissionDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: 60 });
      setStatus('recording');
    } catch {
      setStatus('error');
      setErrorMessage('녹음을 시작하지 못했습니다. 직접 입력하거나 다시 시도해 주세요.');
    }
  };

  const finishRecording = async () => {
    try {
      if (recorderState.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri ?? recorderState.url;
      if (!uri) throw new Error('missing recording');
      const audio = await recordingToInput(uri);
      await submitTurn(audio, '말한 일정');
    } catch {
      setStatus('error');
      setErrorMessage('녹음 내용을 확인하지 못했습니다. 직접 입력하거나 다시 녹음해 주세요.');
    }
  };

  const submitTypedText = async () => {
    const text = typedText.trim();
    if (!text) return;
    setTypedText('');
    await submitTurn({ kind: 'text', text }, text);
  };

  const submitTurn = async (input: VoiceScheduleInput, userText: string) => {
    setStatus('processing');
    setErrorMessage('');
    if (!provider) {
      setStatus('error');
      setErrorMessage('AI 연결 주소가 설정되지 않았습니다. 수동 등록으로 돌아가 입력 내용을 유지할 수 있어요.');
      return;
    }
    try {
      const baseDraft = proposal ?? draft;
      const nextReply = await provider.submitTurn({
        conversationId,
        draft: baseDraft,
        history,
        input,
      });
      const nextProposal = applyVoiceSchedulePatch(baseDraft, nextReply.patch);
      setReply(nextReply);
      setProposal(nextProposal);
      setHistory((previous) => [...previous, { role: 'user', text: input.kind === 'text' ? userText : nextReply.transcript }, { role: 'assistant', text: [nextReply.assistantMessage, nextReply.question].filter(Boolean).join(' ') }].slice(-8) as VoiceScheduleHistoryTurn[]);
      setStatus('proposal');
      if (await canUseAppTts()) {
        await Speech.stop();
        Speech.speak([nextReply.assistantMessage, nextReply.question].filter(Boolean).join(' '), { language: 'ko-KR', rate: 0.95 });
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'AI 일정을 확인하지 못했습니다. 다시 시도해 주세요.');
    }
  };

  const applyProposal = () => {
    if (!proposal) return;
    updateDraft({
      title: proposal.title,
      date: proposal.date,
      appointmentTime: proposal.appointmentTime,
      destination: proposal.destination,
      destinationAddress: proposal.destinationAddress,
      destinationCoordinate: proposal.destinationCoordinate,
      transport: proposal.transport,
      priority: proposal.priority,
      routines: proposal.routines,
    });
    void Speech.stop();
    router.back();
  };

  const changes = proposal ? describeVoiceScheduleChanges(draft, proposal) : [];
  const seconds = Math.min(60, Math.ceil(recorderState.durationMillis / 1_000));

  return (
    <Screen safeBottom>
      <Header title="음성으로 일정 만들기" eyebrow="말하면 AI가 확인 질문을 해요" right={<IconButton name="close" label="음성 일정 닫기" variant="plain" onPress={() => router.back()} />} />

      {status === 'intro' ? <Card style={styles.introCard}>
        <View style={styles.iconCircle}><AppIcon name="voice" size={30} /></View>
        <Text style={type.heading}>마이크를 쓰는 이유</Text>
        <Text style={type.body}>말한 약속을 글로 바꿔 일정 변경안으로 보여드려요. AI가 부족한 정보를 질문해도, 아래 적용 버튼을 누르기 전에는 현재 초안이 바뀌지 않습니다.</Text>
        <Text style={type.bodyMuted}>녹음은 한 번에 최대 60초이며 응답 뒤 저장하지 않아요. 마이크를 허용하지 않아도 직접 입력할 수 있습니다.</Text>
        <Button label="설명 확인하고 계속" onPress={() => setStatus('ready')} />
      </Card> : null}

      {status !== 'intro' ? <>
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <AppIcon name={status === 'recording' ? 'voice' : status === 'processing' ? 'ai' : 'calendar'} size={24} />
            <View style={{ flex: 1 }}>
              <Text accessibilityLiveRegion="polite" style={type.heading}>
                {status === 'recording' ? `듣고 있어요 · ${seconds}초 / 60초`
                  : status === 'processing' ? 'AI가 일정을 확인하고 있어요'
                    : proposal ? '변경안을 확인해 주세요' : '약속 내용을 말해 주세요'}
              </Text>
              <Text style={type.bodyMuted}>{status === 'processing' ? '현재 초안은 그대로 유지됩니다.' : '날짜, 시간, 장소, 준비할 일을 함께 말하면 더 빨라요.'}</Text>
            </View>
          </View>
          {status === 'recording'
            ? <Button label="말하기 완료" onPress={() => void finishRecording()} />
            : <Button label={proposal ? '추가로 말하기' : '말하기 시작'} variant={proposal ? 'secondary' : 'primary'} disabled={status === 'processing'} onPress={() => void startRecording()} />}
        </Card>

        {errorMessage ? <Card style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text>
          {permissionDenied && Platform.OS !== 'web' ? <Button label="기기 설정에서 마이크 허용" variant="secondary" onPress={() => void Linking.openSettings()} /> : null}
        </Card> : null}

        {reply && proposal ? <>
          <Card style={styles.conversationCard}>
            <StatusPill label="음성 인식 내용" />
            <Text style={type.body}>{reply.transcript}</Text>
            <View style={styles.divider} />
            <StatusPill label="AI 확인" tone={reply.question ? 'warning' : 'success'} />
            <Text accessibilityLiveRegion="polite" style={type.body}>{reply.assistantMessage}</Text>
            {reply.question ? <Text accessibilityLiveRegion="polite" style={styles.question}>{reply.question}</Text> : null}
          </Card>
          <View style={styles.sectionGap}><SectionTitle>현재 초안과 달라지는 내용</SectionTitle>
            {changes.length ? changes.map((change) => <Card key={change.label} style={styles.changeCard}>
              <Text style={styles.changeLabel}>{change.label}</Text>
              <Text style={styles.before}>{change.before}</Text>
              <Text style={styles.arrow}>→</Text>
              <Text style={styles.after}>{change.after}</Text>
            </Card>) : <Text style={type.bodyMuted}>아직 바뀌는 항목이 없습니다. 질문에 답해 일정을 구체화해 주세요.</Text>}
          </View>
        </> : null}

        <View style={styles.textFallback}>
          <SectionTitle>말하기 어렵다면 직접 입력</SectionTitle>
          <TextInput
            accessibilityLabel="AI에게 보낼 일정 내용"
            multiline
            placeholder="예: 내일 오후 3시 서울시청에서 회의, 지하철로 갈래"
            placeholderTextColor={color.textMuted}
            value={typedText}
            onChangeText={setTypedText}
            style={styles.textInput}
          />
          <Button label="입력한 내용 확인" variant="secondary" disabled={!typedText.trim() || status === 'processing' || status === 'recording'} onPress={() => void submitTypedText()} />
        </View>

        {proposal ? <View style={styles.applyActions}>
          <Text style={type.bodyMuted}>적용 전까지 등록 화면의 일정은 바뀌지 않습니다.</Text>
          <Button label="이 일정에 적용" disabled={!changes.length || status === 'processing'} onPress={applyProposal} />
          <Button label="제안 없이 수동 등록으로 돌아가기" variant="ghost" onPress={() => router.back()} />
        </View> : <Button label="수동 등록으로 돌아가기" variant="ghost" onPress={() => router.back()} />}
      </> : null}
    </Screen>
  );
}

async function recordingToInput(uri: string): Promise<VoiceScheduleInput> {
  const file = new File(uri);
  try {
    const base64 = await file.base64();
    const mimeType = inferVoiceScheduleAudioMimeType(uri, file.type);
    if (!mimeType) throw new Error('unsupported recording format');
    return { kind: 'audio', base64, mimeType };
  } finally {
    try { file.delete(); } catch { /* The OS may already have cleared the cache entry. */ }
  }
}

const styles = StyleSheet.create({
  introCard: { gap: space.md },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: color.ice, alignItems: 'center', justifyContent: 'center' },
  statusCard: { gap: space.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  errorCard: { gap: space.md, borderColor: color.danger, backgroundColor: color.dangerSoft },
  errorText: { ...type.body, color: color.danger, fontWeight: '700' },
  conversationCard: { gap: space.md },
  divider: { height: 1, backgroundColor: color.border },
  question: { ...type.body, color: color.deepBlue, fontWeight: '800' },
  sectionGap: { gap: space.sm },
  changeCard: { padding: space.md, gap: 3 },
  changeLabel: { ...type.caption, fontWeight: '800' },
  before: { ...type.bodyMuted, textDecorationLine: 'line-through' },
  arrow: { color: color.textMuted, fontSize: 16 },
  after: { ...type.body, color: color.deepBlue, fontWeight: '800' },
  textFallback: { gap: space.md },
  textInput: { minHeight: 108, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface, padding: space.lg, fontSize: 16, lineHeight: 24, color: color.text, textAlignVertical: 'top' },
  applyActions: { gap: space.md },
});
