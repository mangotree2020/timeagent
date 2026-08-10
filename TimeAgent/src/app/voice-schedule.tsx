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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, IconButton } from '@/components/app-icon';
import { Button } from '@/components/app-ui';
import { VoicePulseButton } from '@/components/voice-pulse-button';
import { radius, space } from '@/constants/design';
import { canUseAppTts } from '@/lib/screen-reader-state';
import { ScheduleDraft } from '@/lib/schedule-draft';
import {
  applyVoiceSchedulePatch,
  completeGuidedVoicePatch,
  GUIDED_VOICE_QUESTIONS,
  isGuidedVoiceFieldCaptured,
  updateVoiceActivity,
  voicePatchForGuidedField,
  VoiceScheduleAssistantReply,
} from '@/lib/voice-schedule-assistant';
import {
  createConfiguredVoiceScheduleProvider,
  inferVoiceScheduleAudioMimeType,
  VoiceScheduleHistoryTurn,
  VoiceScheduleInput,
} from '@/lib/voice-schedule-api';
import { useSchedule } from '@/state/schedule-context';
import { useAppTheme } from '@/state/theme-context';

type VoiceMode = 'guided' | 'one-shot';
type FlowStatus = 'ready' | 'speaking' | 'recording' | 'processing' | 'result' | 'error';
type ChatMessage = { id: string; role: 'assistant' | 'user'; text: string };

const RESULT_FIXTURE: VoiceScheduleAssistantReply = {
  transcript: '지수랑 이번 주 토요일 저녁 7시에 홍대입구역 근처에서 지하철로 만날래',
  assistantMessage: '다 됐어. 아래에서 확인해 줘.',
  question: null,
  readyToApply: true,
  patch: { title: '지수랑 저녁 약속', date: '8월 8일 (토요일)', appointmentTime: '19:00', destination: '홍대입구역 근처', transport: '지하철' },
};

const TTS_RELEASE_DELAY_MS = 700;

export default function VoiceScheduleScreen() {
  const params = useLocalSearchParams<{ e2eState?: string; e2eMode?: string }>();
  const insets = useSafeAreaInsets();
  const fixtureResult = params.e2eState === 'proposal' || params.e2eState === 'result';
  const fixtureAutoListening = params.e2eState === 'auto-listening';
  const initialMode: VoiceMode = params.e2eMode === 'one-shot' ? 'one-shot' : 'guided';
  const { draft, finalizeDraftWith } = useSchedule();
  const { mode: colorMode, palette } = useAppTheme();
  const recordingOptions = useMemo(() => ({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }), []);
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder, 150);
  const provider = useMemo(() => { try { return createConfiguredVoiceScheduleProvider(); } catch { return null; } }, []);
  const conversationId = `voice_${useId().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const [voiceMode, setVoiceMode] = useState<VoiceMode>(initialMode);
  const [status, setStatus] = useState<FlowStatus>(fixtureResult ? 'result' : fixtureAutoListening ? 'recording' : 'ready');
  const [guidedStep, setGuidedStep] = useState(fixtureResult ? 4 : 0);
  const [messages, setMessages] = useState<ChatMessage[]>(fixtureResult ? [
    { id: 'a0', role: 'assistant', text: GUIDED_VOICE_QUESTIONS[0].prompt },
    { id: 'u0', role: 'user', text: '지수랑 저녁 약속이야' },
    { id: 'a1', role: 'assistant', text: GUIDED_VOICE_QUESTIONS[1].prompt },
    { id: 'u1', role: 'user', text: '이번 주 토요일 저녁 7시' },
    { id: 'a2', role: 'assistant', text: GUIDED_VOICE_QUESTIONS[2].prompt },
    { id: 'u2', role: 'user', text: '홍대입구역 근처' },
    { id: 'a3', role: 'assistant', text: GUIDED_VOICE_QUESTIONS[3].prompt },
    { id: 'u3', role: 'user', text: '지하철로 갈게' },
    { id: 'a4', role: 'assistant', text: '다 됐어. 아래에서 확인해 줘.' },
  ] : initialMode === 'guided' ? [{ id: 'a0', role: 'assistant', text: GUIDED_VOICE_QUESTIONS[0].prompt }] : []);
  const [proposal, setProposal] = useState<ScheduleDraft | null>(() => fixtureResult ? applyVoiceSchedulePatch(draft, RESULT_FIXTURE.patch) : null);
  const [history, setHistory] = useState<VoiceScheduleHistoryTurn[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);
  const flowGenerationRef = useRef(0);
  const finishingRef = useRef(false);
  const recordingStartedRef = useRef(false);
  const voiceActivityRef = useRef({ heardSpeech: false, silenceSinceMs: null as number | null });
  const seconds = Math.min(60, Math.ceil(recorderState.durationMillis / 1_000));

  const startRecording = useCallback(async () => {
    setErrorMessage('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setStatus('error');
        setErrorMessage('마이크 권한이 필요해요. 기기 설정에서 허용하거나 + 버튼으로 직접 등록해 주세요.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      voiceActivityRef.current = { heardSpeech: false, silenceSinceMs: null };
      finishingRef.current = false;
      recordingStartedRef.current = true;
      recorder.record({ forDuration: 60 });
      setStatus('recording');
    } catch {
      setStatus('error');
      setErrorMessage('음성 대화를 시작하지 못했어요. 다시 시작하거나 + 버튼으로 직접 등록해 주세요.');
    }
  }, [recorder]);

  const speakThenListen = useCallback(async (text: string, generation = flowGenerationRef.current) => {
    if (!mountedRef.current || generation !== flowGenerationRef.current) return;
    if (await canUseAppTts()) {
      setStatus('speaking');
      await new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve();
        };
        const fallback = setTimeout(finish, 8_000);
        const finishAndClear = () => { clearTimeout(fallback); finish(); };
        Speech.speak(text, { language: 'ko-KR', rate: 0.96, onDone: finishAndClear, onStopped: finishAndClear, onError: finishAndClear });
      });
      // Some Android devices keep the speaker path active briefly after onDone.
      // Let that tail clear so the assistant does not record its own last words.
      await new Promise<void>((resolve) => setTimeout(resolve, TTS_RELEASE_DELAY_MS));
    }
    if (mountedRef.current && generation === flowGenerationRef.current) await startRecording();
  }, [startRecording]);

  const submitTurn = useCallback(async (input: VoiceScheduleInput) => {
    setStatus('processing');
    setErrorMessage('');
    if (!provider) {
      setStatus('error');
      setErrorMessage('AI 비서 연결을 확인할 수 없어요. 잠시 후 다시 시작하거나 + 버튼으로 직접 등록해 주세요.');
      return;
    }
    try {
      const base = proposal ?? draft;
      const guidedQuestion = voiceMode === 'guided' ? GUIDED_VOICE_QUESTIONS[Math.min(guidedStep, 3)] : null;
      const reply = await provider.submitTurn({
        conversationId,
        draft: base,
        history,
        input,
        flowContext: {
          mode: voiceMode,
          ...(guidedQuestion ? { guidedField: guidedQuestion.field, guidedPrompt: guidedQuestion.prompt } : {}),
        },
      });
      const transcript = reply.transcript || '말한 내용';
      const fieldCaptured = guidedQuestion ? isGuidedVoiceFieldCaptured(guidedQuestion.field, reply.patch) : false;
      const guidedPatch = guidedQuestion ? voicePatchForGuidedField(guidedQuestion.field, reply.patch) : reply.patch;
      const patch = guidedQuestion && fieldCaptured
        ? completeGuidedVoicePatch(guidedQuestion.field, transcript, guidedPatch)
        : guidedPatch;
      const nextProposal = applyVoiceSchedulePatch(base, patch);
      setProposal(nextProposal);
      if (voiceMode === 'one-shot') {
        const assistantText = reply.assistantMessage || '다 됐어. 아래에서 확인해 줘.';
        setHistory((current) => [...current, { role: 'user', text: transcript }, { role: 'assistant', text: assistantText }].slice(-8) as VoiceScheduleHistoryTurn[]);
        setMessages([{ id: `u-${Date.now()}`, role: 'user', text: transcript }, { id: `a-${Date.now()}`, role: 'assistant', text: assistantText }]);
        setStatus('result');
        return;
      }
      const nextStep = fieldCaptured ? guidedStep + 1 : guidedStep;
      const nextQuestion = GUIDED_VOICE_QUESTIONS[nextStep]?.prompt;
      const assistantText = appendAssistantPrompt(
        reply.assistantMessage,
        nextQuestion ?? '다 됐어. 아래에서 확인해 줘.',
        reply.question,
      );
      setHistory((current) => [...current, { role: 'user', text: transcript }, { role: 'assistant', text: assistantText }].slice(-8) as VoiceScheduleHistoryTurn[]);
      setMessages((current) => [...current, { id: `u-${Date.now()}`, role: 'user', text: transcript }, { id: `a-${Date.now()}-next`, role: 'assistant', text: assistantText }]);
      setGuidedStep(nextStep);
      if (nextStep >= GUIDED_VOICE_QUESTIONS.length) {
        setStatus('result');
      } else {
        void speakThenListen(assistantText);
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'AI 비서가 말을 확인하지 못했어요. 다시 시작해 주세요.');
    }
  }, [conversationId, draft, guidedStep, history, proposal, provider, speakThenListen, voiceMode]);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    recordingStartedRef.current = false;
    try {
      if (recorderState.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri ?? recorderState.url;
      if (!uri) throw new Error('missing recording');
      await submitTurn(await recordingToInput(uri));
    } catch {
      setStatus('error');
      setErrorMessage('말한 내용을 확인하지 못했어요. AI 음성 대화를 다시 시작해 주세요.');
    } finally {
      finishingRef.current = false;
    }
  }, [recorder, recorderState.isRecording, recorderState.url, submitTurn]);

  const changeMode = useCallback(async (next: VoiceMode) => {
    if (next === voiceMode || status === 'processing') return;
    const generation = ++flowGenerationRef.current;
    await Speech.stop();
    if (recorder.isRecording) {
      recordingStartedRef.current = false;
      try { await recorder.stop(); } catch { /* The recorder may already be stopping. */ }
      const uri = recorder.uri;
      if (uri) try { new File(uri).delete(); } catch { /* Cache may already be gone. */ }
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    setVoiceMode(next);
    setStatus('ready');
    setProposal(null);
    setGuidedStep(0);
    setMessages(next === 'guided' ? [{ id: `a-${Date.now()}`, role: 'assistant', text: GUIDED_VOICE_QUESTIONS[0].prompt }] : []);
    setHistory([]);
    setErrorMessage('');
    if (Platform.OS !== 'web') void speakThenListen(initialAssistantPrompt(next), generation);
  }, [recorder, speakThenListen, status, voiceMode]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flowGenerationRef.current += 1;
      void Speech.stop();
      if (recorder.isRecording) void recorder.stop();
    };
  }, [recorder]);

  useEffect(() => {
    if (autoStartedRef.current || fixtureResult || fixtureAutoListening || Platform.OS === 'web') return;
    autoStartedRef.current = true;
    const generation = ++flowGenerationRef.current;
    void speakThenListen(initialAssistantPrompt(initialMode), generation);
  }, [fixtureAutoListening, fixtureResult, initialMode, speakThenListen]);

  useEffect(() => {
    if (status !== 'recording' || fixtureAutoListening) return;
    const activity = updateVoiceActivity(voiceActivityRef.current, recorderState.metering, recorderState.durationMillis);
    voiceActivityRef.current = activity.state;
    if (activity.shouldFinish) void finishRecording();
  }, [finishRecording, fixtureAutoListening, recorderState.durationMillis, recorderState.metering, status]);

  useEffect(() => {
    if (status === 'recording'
      && recordingStartedRef.current
      && !recorderState.isRecording
      && (recorderState.url || recorder.uri)) {
      if (!voiceActivityRef.current.heardSpeech) {
        recordingStartedRef.current = false;
        const uri = recorderState.url || recorder.uri;
        if (uri) try { new File(uri).delete(); } catch { /* Cache may already be gone. */ }
        void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        setStatus('error');
        setErrorMessage('목소리를 듣지 못했어요. 다시 시작하거나 + 버튼으로 직접 등록해 주세요.');
        return;
      }
      void finishRecording();
    }
  }, [finishRecording, recorder.uri, recorderState.isRecording, recorderState.url, status]);

  const createPlan = async () => {
    if (!proposal) return;
    await finalizeDraftWith({ ...proposal, step: 2 });
    void Speech.stop();
    router.replace('/plan');
  };

  return (
    <View accessibilityLabel={`음성 일정 ${colorMode === 'dark' ? '다크' : '화이트'} 모드`} style={[styles.page, { backgroundColor: palette.background }]}>
      <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]} edges={['top', 'right', 'bottom', 'left']}>
        <View style={styles.content}>
        <View style={styles.header}><IconButton name="close" label="음성 일정 닫기" variant="plain" iconColor={palette.text} onPress={() => router.back()} /><Text style={[styles.headerTitle, { color: palette.text }]}>새 약속</Text><View style={styles.headerSpacer} /></View>
        <View style={[styles.tabs, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
          <ModeTab label="단계별로 묻기" selected={voiceMode === 'guided'} onPress={() => changeMode('guided')} palette={palette} />
          <ModeTab label="한 번에 말하기" selected={voiceMode === 'one-shot'} onPress={() => changeMode('one-shot')} palette={palette} />
        </View>
        <View accessibilityLabel="AI 비서 자동 음성 모드 켜짐" style={[styles.aiMode, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={[styles.aiModeDot, { backgroundColor: palette.primary }]} /><Text style={[styles.aiModeText, { color: palette.text }]}>AI 비서 · 자동 음성 대화</Text><Text style={[styles.aiModeState, { color: palette.primary }]}>켜짐</Text></View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          {voiceMode === 'one-shot' && !messages.length && status !== 'result' ? <View style={styles.oneShotIntro}><Text style={[styles.oneShotTitle, { color: palette.text }]}>약속을 한 번에{`\n`}말해줘</Text><Text style={[styles.example, { color: palette.textMuted, backgroundColor: palette.surface }]}>예시 · “토요일 저녁 7시에 홍대에서{`\n`}지수랑 저녁 약속”</Text></View> : null}
          {messages.length ? <View style={styles.chat}>{messages.map((message) => <View key={message.id} style={[styles.message, message.role === 'user' ? styles.userMessage : styles.assistantMessage, { backgroundColor: message.role === 'user' ? palette.primary : palette.assistantBubble }]}><Text style={[styles.messageText, { color: message.role === 'user' || colorMode === 'dark' ? '#FFFFFF' : palette.text }]}>{message.text}</Text></View>)}</View> : null}
          {status === 'result' && proposal ? <VoiceResult proposal={proposal} onCreate={() => void createPlan()} palette={palette} /> : null}
          {errorMessage ? <View style={[styles.error, { backgroundColor: palette.surface, borderColor: '#C2413A' }]}><Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text>{Platform.OS !== 'web' ? <Button label="마이크 권한 설정" variant="secondary" onPress={() => void Linking.openSettings()} /> : null}</View> : null}
        </ScrollView>

        {status !== 'result' ? <View style={styles.micArea}><VoicePulseButton active={status === 'recording' || status === 'speaking'} size={72} label={status === 'recording' ? '듣기 중지하고 바로 확인' : status === 'speaking' ? 'AI 비서가 말하는 중' : status === 'processing' ? 'AI 비서가 확인하는 중' : 'AI 음성 대화 다시 시작'} onPress={() => status === 'recording' ? void finishRecording() : status === 'ready' || status === 'error' ? void startRecording() : undefined} /><Text accessibilityLiveRegion="polite" style={[styles.micCaption, { color: palette.textMuted }]}>{status === 'recording' ? `듣고 있어요 · ${seconds}초\n말이 끝나면 자동으로 확인해요` : status === 'speaking' ? 'AI 비서가 말하고 있어요.\n이어서 편하게 말해 주세요.' : status === 'processing' ? 'AI 비서가 이해한 내용을 확인하고 있어요' : 'AI 음성 대화를 다시 시작할 수 있어요'}</Text></View> : null}
        </View>
      </SafeAreaView>
      <Pressable accessibilityRole="button" accessibilityLabel="텍스트로 직접 일정 등록" accessibilityHint="수동 일정 등록 화면으로 전환합니다" onPress={() => router.replace({ pathname: '/create', params: { new: '1' } })} style={({ pressed }) => [styles.manualFab, { backgroundColor: palette.primary, bottom: insets.bottom + 12 }, pressed && styles.pressed]}><AppIcon name="plus" size={28} iconColor="#FFFFFF" strokeWidth={2.8} /></Pressable>
    </View>
  );
}

function ModeTab({ label, selected, onPress, palette }: { label: string; selected: boolean; onPress: () => void; palette: ReturnType<typeof useAppTheme>['palette'] }) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.tab, selected && { backgroundColor: palette.primary }]}><Text style={[styles.tabText, { color: selected ? '#FFFFFF' : palette.textMuted }]}>{label}</Text></Pressable>;
}

function VoiceResult({ proposal, onCreate, palette }: { proposal: ScheduleDraft; onCreate: () => void; palette: ReturnType<typeof useAppTheme>['palette'] }) {
  return <View accessibilityLabel="음성 약속 결과" style={[styles.result, { backgroundColor: palette.surface, borderColor: palette.border }]}><Text style={[styles.resultLead, { color: palette.primary }]}>이렇게 잡을게, 맞아?</Text><ResultRow label="약속" value={proposal.title} palette={palette} /><ResultRow label="일시" value={`${proposal.date} ${proposal.appointmentTime}`} palette={palette} /><ResultRow label="장소" value={proposal.destination} palette={palette} /><ResultRow label="이동" value={proposal.transport} palette={palette} /><Button label="좋아, 준비 계획 만들어줘" onPress={onCreate} /></View>;
}

function ResultRow({ label, value, palette }: { label: string; value: string; palette: ReturnType<typeof useAppTheme>['palette'] }) {
  return <View style={styles.resultRow}><Text style={[styles.resultLabel, { color: palette.textMuted }]}>{label}</Text><Text style={[styles.resultValue, { color: palette.text }]}>{value || '확인 필요'}</Text></View>;
}

async function recordingToInput(uri: string): Promise<VoiceScheduleInput> {
  const file = new File(uri);
  try {
    const base64 = await file.base64();
    const mimeType = inferVoiceScheduleAudioMimeType(uri, file.type);
    if (!mimeType) throw new Error('unsupported recording format');
    return { kind: 'audio', base64, mimeType };
  } finally {
    try { file.delete(); } catch { /* OS cache may already be gone. */ }
  }
}

function initialAssistantPrompt(mode: VoiceMode) {
  return mode === 'guided'
    ? GUIDED_VOICE_QUESTIONS[0].prompt
    : '편하게 한 번에 말해 줘. 약속 이름, 시간, 장소, 이동 방법을 알아들을게.';
}

function appendAssistantPrompt(message: string, prompt: string, serverQuestion: string | null) {
  const response = message.trim();
  if (!response) return prompt;
  if (response.includes(prompt)
    || (serverQuestion && response.includes(serverQuestion))
    || /[?？]\s*$/.test(response)) return response;
  return `${response}\n${prompt}`;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1 },
  content: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.sm, gap: space.md },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, lineHeight: 27, fontWeight: '900' }, headerSpacer: { width: 44 },
  tabs: { minHeight: 48, flexDirection: 'row', borderRadius: radius.md, borderWidth: 1, padding: 3 },
  tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  tabText: { fontSize: 14, fontWeight: '900' },
  aiMode: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1 },
  aiModeDot: { width: 8, height: 8, borderRadius: 4 }, aiModeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '800' }, aiModeState: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  body: { flex: 1, minHeight: 0 }, bodyContent: { flexGrow: 1, paddingBottom: space.sm }, chat: { gap: space.md, paddingTop: space.lg },
  message: { maxWidth: '82%', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 18 },
  assistantMessage: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 }, userMessage: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  messageText: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  oneShotIntro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl },
  oneShotTitle: { textAlign: 'center', fontSize: 25, lineHeight: 34, fontWeight: '900' },
  example: { textAlign: 'center', fontSize: 14, lineHeight: 21, paddingHorizontal: space.xl, paddingVertical: space.md, borderRadius: radius.md },
  result: { gap: space.sm, marginTop: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  resultLead: { fontSize: 16, lineHeight: 22, fontWeight: '900', marginBottom: 2 },
  resultRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: space.md },
  resultLabel: { width: 45, fontSize: 13, fontWeight: '700' }, resultValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '900' },
  micArea: { alignItems: 'center', gap: space.sm, paddingBottom: space.sm }, micCaption: { maxWidth: 270, minHeight: 38, textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  manualFab: { position: 'absolute', right: 20, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', elevation: 10, boxShadow: '0 8px 22px rgba(27,100,218,0.35)' },
  error: { gap: space.md, marginTop: space.lg, padding: space.lg, borderRadius: radius.md, borderWidth: 1 }, errorText: { color: '#C2413A', fontSize: 14, lineHeight: 21, fontWeight: '800' },
  pressed: { opacity: 0.76, transform: [{ scale: 0.96 }] },
});
