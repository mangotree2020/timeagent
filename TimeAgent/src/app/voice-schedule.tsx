import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon, IconButton, iconForTransport } from '@/components/app-icon';
import { Button } from '@/components/app-ui';
import { DestinationPicker } from '@/components/destination-picker';
import { radius, space } from '@/constants/design';
import { canUseAppTts } from '@/lib/screen-reader-state';
import { ScheduleDraft, TransportMode } from '@/lib/schedule-draft';
import {
  applyVoiceSchedulePatch,
  canConfirmVoiceSchedule,
  createVoiceFirstScheduleDraft,
  updateVoiceActivity,
  voiceScheduleMissingFields,
  VoiceScheduleAssistantReply,
  VoiceScheduleClarification,
  VoiceSchedulePatch,
  VoiceTaskProposal,
} from '@/lib/voice-schedule-assistant';
import {
  createConfiguredVoiceScheduleProvider,
  inferVoiceScheduleAudioMimeType,
  VoiceScheduleHistoryTurn,
  VoiceScheduleInput,
} from '@/lib/voice-schedule-api';
import { useSchedule } from '@/state/schedule-context';
import { useTaskExecution } from '@/state/task-context';
import { useAppTheme } from '@/state/theme-context';

type FlowStatus = 'ready' | 'speaking' | 'recording' | 'processing' | 'review' | 'confirmed' | 'error';
type ChatMessage = { id: string; role: 'assistant' | 'user'; text: string };
type EditableField = 'title' | 'date' | 'time' | 'destination' | 'duration' | 'recurrence' | 'preparation' | null;

const INITIAL_PROMPT = '새 일정이나 할 일을 말해 주세요. “내일 3시 강남에서 병원” 또는 “보고서 작성해야 해”처럼 편하게 말하면 돼요.';
const TTS_RELEASE_DELAY_MS = 500;
const transports: TransportMode[] = ['AI 추천', '도보', '버스', '지하철', '자가용', '택시'];

const RESULT_FIXTURE: VoiceScheduleAssistantReply = {
  entryType: 'schedule',
  transcript: '내일 3시 강남에서 병원, 준비는 30분',
  assistantMessage: '내일 오후 3시 병원 일정으로 정리했어요. 장소 위치만 확인해 주세요.',
  question: null,
  readyToApply: true,
  clarification: null,
  task: null,
  patch: {
    title: '병원',
    date: '8월 12일 (내일)',
    appointmentTime: '15:00',
    destination: '강남 세브란스병원',
    destinationAddress: '서울 강남구 언주로 211',
    destinationCoordinate: { latitude: 37.492, longitude: 127.046 },
    durationMinutes: 60,
    recurrence: '반복 없음',
    preparationMinutes: 30,
    transport: 'AI 추천',
  },
};

const CLARIFICATION_FIXTURE: VoiceScheduleAssistantReply = {
  entryType: 'schedule',
  transcript: '금요일 오후에 치과',
  assistantMessage: '금요일 치과 일정으로 이해했어요. 오후 시간을 정해 주세요.',
  question: '금요일 오후 몇 시로 등록할까요?',
  readyToApply: false,
  clarification: { field: 'time', prompt: '금요일 오후 몇 시로 등록할까요?', options: ['13:00', '15:00', '17:00', '직접 입력'] },
  task: null,
  patch: { title: '치과', date: '8월 14일 (금요일)', destination: '치과' },
};

const TASK_FIXTURE: VoiceScheduleAssistantReply = {
  entryType: 'task',
  transcript: '보고서 작성해야 해',
  assistantMessage: '지금 시작할 수 있는 세 단계로 작게 나눴어요.',
  question: null,
  readyToApply: true,
  clarification: null,
  task: {
    title: '보고서 작성',
    actions: [
      { label: '문서 열기', estimatedMinutes: 2 },
      { label: '제목 쓰기', estimatedMinutes: 3 },
      { label: '자료 하나 붙이기', estimatedMinutes: 5 },
    ],
  },
  patch: {},
};

export default function VoiceScheduleScreen() {
  const params = useLocalSearchParams<{ e2eState?: string }>();
  const fixtureResult = params.e2eState === 'proposal' || params.e2eState === 'result';
  const fixtureClarification = params.e2eState === 'clarification';
  const fixtureAutoListening = params.e2eState === 'auto-listening';
  const fixtureTask = params.e2eState === 'task';
  const fixtureReply = fixtureTask ? TASK_FIXTURE : fixtureClarification ? CLARIFICATION_FIXTURE : fixtureResult ? RESULT_FIXTURE : null;
  const { beginDraft, beginDraftWith, confirmDraftWith, draft, selectConfirmedPlan } = useSchedule();
  const { addTask, startTask } = useTaskExecution();
  const { mode: colorMode, palette } = useAppTheme();
  const recordingOptions = useMemo(() => ({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }), []);
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder, 120);
  const provider = useMemo(() => { try { return createConfiguredVoiceScheduleProvider(); } catch { return null; } }, []);
  const conversationId = `voice_${useId().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const voiceDraft = useMemo(() => createVoiceFirstScheduleDraft(draft), [draft]);
  const [status, setStatus] = useState<FlowStatus>(fixtureReply ? 'review' : fixtureAutoListening ? 'recording' : 'ready');
  const [messages, setMessages] = useState<ChatMessage[]>(() => fixtureReply ? [
    { id: 'a0', role: 'assistant', text: INITIAL_PROMPT },
    { id: 'u0', role: 'user', text: fixtureReply.transcript },
    { id: 'a1', role: 'assistant', text: fixtureReply.assistantMessage },
  ] : [{ id: 'a0', role: 'assistant', text: INITIAL_PROMPT }]);
  const [proposal, setProposal] = useState<ScheduleDraft | null>(() => fixtureReply?.entryType === 'schedule' ? applyVoiceSchedulePatch(voiceDraft, fixtureReply.patch) : null);
  const [taskProposal, setTaskProposal] = useState<VoiceTaskProposal | null>(() => fixtureReply?.task ?? null);
  const [taskSourceText, setTaskSourceText] = useState(() => fixtureReply?.entryType === 'task' ? fixtureReply.transcript : '');
  const [history, setHistory] = useState<VoiceScheduleHistoryTurn[]>([]);
  const [assistantReady, setAssistantReady] = useState(fixtureReply?.readyToApply ?? false);
  const [clarification, setClarification] = useState<VoiceScheduleClarification | null>(fixtureReply?.clarification ?? null);
  const [editField, setEditField] = useState<EditableField>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const mountedRef = useRef(true);
  const autoStartedRef = useRef(false);
  const flowGenerationRef = useRef(0);
  const finishingRef = useRef(false);
  const processingRef = useRef(false);
  const recordingStartedRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceActivityRef = useRef({
    heardSpeech: false,
    speechCandidateSinceMs: null as number | null,
    silenceSinceMs: null as number | null,
  });

  const startRecording = useCallback(async () => {
    if (recordingStartedRef.current || finishingRef.current) return;
    const generation = flowGenerationRef.current;
    setErrorMessage('');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!mountedRef.current || generation !== flowGenerationRef.current) return;
      if (!permission.granted) {
        setStatus('error');
        setErrorMessage('마이크 권한이 필요해요. 기기 설정에서 허용하거나 현재 추출 결과를 직접 수정해 주세요.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!mountedRef.current || generation !== flowGenerationRef.current) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        return;
      }
      await recorder.prepareToRecordAsync();
      if (!mountedRef.current || generation !== flowGenerationRef.current) return;
      voiceActivityRef.current = { heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null };
      finishingRef.current = false;
      recordingStartedRef.current = true;
      recorder.record({ forDuration: 60 });
      setStatus('recording');
    } catch {
      if (!mountedRef.current || generation !== flowGenerationRef.current) return;
      setStatus('error');
      setErrorMessage('음성 대화를 시작하지 못했어요. 다시 듣거나 추출 결과를 직접 수정해 주세요.');
    }
  }, [recorder]);

  const speakThenListen = useCallback(async (text: string, generation = flowGenerationRef.current) => {
    if (!mountedRef.current || generation !== flowGenerationRef.current) return;
    const canSpeak = voiceOutputEnabled && await canUseAppTts();
    if (!mountedRef.current || generation !== flowGenerationRef.current) return;
    if (canSpeak) {
      setStatus('speaking');
      await new Promise<void>((resolve) => {
        let finished = false;
        const finish = () => { if (!finished) { finished = true; resolve(); } };
        const fallback = setTimeout(finish, 8_000);
        const done = () => { clearTimeout(fallback); finish(); };
        Speech.speak(text, { language: 'ko-KR', rate: 0.98, onDone: done, onStopped: done, onError: done });
      });
      await new Promise<void>((resolve) => setTimeout(resolve, TTS_RELEASE_DELAY_MS));
    }
    if (mountedRef.current && generation === flowGenerationRef.current) await startRecording();
  }, [startRecording, voiceOutputEnabled]);

  const scheduleAutoRestart = useCallback((delayMs: number, generation = flowGenerationRef.current) => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (mountedRef.current && generation === flowGenerationRef.current) void startRecording();
    }, delayMs);
  }, [startRecording]);

  const submitTurn = useCallback(async (input: VoiceScheduleInput) => {
    if (processingRef.current) return;
    const generation = flowGenerationRef.current;
    if (!provider) {
      setStatus('error');
      setErrorMessage('AI 비서 연결을 확인할 수 없어요. 다시 시도하거나 현재 내용을 직접 수정해 주세요.');
      return;
    }
    processingRef.current = true;
    setStatus('processing');
    setErrorMessage('');
    try {
      const base = proposal ?? voiceDraft;
      const reply = await provider.submitTurn({
        conversationId,
        draft: base,
        history,
        input,
        flowContext: { mode: 'one-shot' },
      });
      if (!mountedRef.current || generation !== flowGenerationRef.current) return;
      const transcript = reply.transcript.trim() || (input.kind === 'text' ? input.text.trim() : '');
      if (input.kind === 'audio' && !transcript) {
        setStatus('ready');
        scheduleAutoRestart(0, generation);
        return;
      }
      const nextProposal = applyVoiceSchedulePatch(base, reply.patch);
      const assistantText = reply.assistantMessage || reply.question || '이해한 내용을 확인해 주세요.';
      if (reply.entryType === 'task' && reply.task) {
        setTaskProposal(reply.task);
        setTaskSourceText(transcript);
        setProposal(null);
      } else {
        setProposal(nextProposal);
        setTaskProposal(null);
      }
      setAssistantReady(reply.readyToApply);
      setClarification(reply.clarification);
      setHistory((current) => [...current, { role: 'user', text: transcript }, { role: 'assistant', text: assistantText }].slice(-8) as VoiceScheduleHistoryTurn[]);
      setMessages((current) => [...current, { id: `u-${Date.now()}`, role: 'user', text: transcript }, { id: `a-${Date.now()}`, role: 'assistant', text: assistantText }]);
      setStatus('review');
      void speakThenListen(reply.clarification?.prompt ?? reply.question ?? assistantText);
    } catch (error) {
      if (!mountedRef.current || generation !== flowGenerationRef.current) return;
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'AI 비서가 말을 확인하지 못했어요. 다시 말해 주세요.');
      scheduleAutoRestart(900, generation);
    } finally {
      processingRef.current = false;
    }
  }, [conversationId, history, proposal, provider, scheduleAutoRestart, speakThenListen, voiceDraft]);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    const generation = flowGenerationRef.current;
    finishingRef.current = true;
    recordingStartedRef.current = false;
    try {
      if (recorderState.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri ?? recorderState.url;
      if (!uri) throw new Error('missing recording');
      if (!voiceActivityRef.current.heardSpeech || generation !== flowGenerationRef.current || !mountedRef.current) {
        try { new File(uri).delete(); } catch { /* cache may already be gone */ }
        return;
      }
      await submitTurn(await recordingToInput(uri));
    } catch {
      if (mountedRef.current && generation === flowGenerationRef.current) {
        setStatus('error');
        setErrorMessage('말한 내용을 확인하지 못했어요. 잠시 뒤 자동으로 다시 들을게요.');
        scheduleAutoRestart(900, generation);
      }
    } finally {
      finishingRef.current = false;
    }
  }, [recorder, recorderState.isRecording, recorderState.url, scheduleAutoRestart, submitTurn]);

  const stopAudioConversation = useCallback(async () => {
    flowGenerationRef.current += 1;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const hadActiveRecording = recordingStartedRef.current || recorderState.isRecording;
    recordingStartedRef.current = false;
    try { await Speech.stop(); } catch { /* navigation must still continue */ }
    if (hadActiveRecording) {
      try { await recorder.stop(); } catch { /* recorder may already have stopped */ }
    }
    try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch { /* screen can still close */ }
  }, [recorder, recorderState.isRecording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flowGenerationRef.current += 1;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      void Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (autoStartedRef.current || fixtureReply || fixtureAutoListening || Platform.OS === 'web') return;
    autoStartedRef.current = true;
    void startRecording();
  }, [fixtureAutoListening, fixtureReply, startRecording]);

  useEffect(() => {
    if (status !== 'recording' || fixtureAutoListening) return;
    const activity = updateVoiceActivity(voiceActivityRef.current, recorderState.metering, recorderState.durationMillis);
    voiceActivityRef.current = activity.state;
    if (activity.shouldFinish) void finishRecording();
  }, [finishRecording, fixtureAutoListening, recorderState.durationMillis, recorderState.metering, status]);

  useEffect(() => {
    if (status !== 'recording' || !recordingStartedRef.current || recorderState.isRecording || !(recorderState.url || recorder.uri)) return;
    if (!voiceActivityRef.current.heardSpeech) {
      recordingStartedRef.current = false;
      const uri = recorderState.url || recorder.uri;
      if (uri) try { new File(uri).delete(); } catch { /* cache may already be gone */ }
      void (async () => {
        try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch { /* retry can continue */ }
        if (mountedRef.current) await startRecording();
      })();
      return;
    }
    void finishRecording();
  }, [finishRecording, recorder.uri, recorderState.isRecording, recorderState.url, startRecording, status]);

  const applyManualPatch = (patch: VoiceSchedulePatch, resolvedField?: VoiceScheduleClarification['field']) => {
    setProposal((current) => {
      const next = applyVoiceSchedulePatch(current ?? voiceDraft, patch);
      const nextClarification = clarification?.field === resolvedField ? null : clarification;
      if (clarification?.field === resolvedField) setClarification(null);
      setAssistantReady(voiceScheduleMissingFields(next).length === 0 && nextClarification === null);
      return next;
    });
  };

  const confirmSchedule = async () => {
    if (!proposal || !canConfirmVoiceSchedule(proposal, assistantReady, clarification)) return;
    try {
      setStatus('processing');
      await stopAudioConversation();
      const confirmed = await confirmDraftWith({ ...proposal, step: 2 });
      selectConfirmedPlan(confirmed.id);
      setStatus('confirmed');
      router.replace('/plan');
    } catch {
      setStatus('error');
      setErrorMessage('일정을 저장하지 못했어요. 입력 내용은 유지됩니다. 다시 확정해 주세요.');
    }
  };

  const confirmTask = async () => {
    if (!taskProposal || !assistantReady) return;
    try {
      setStatus('processing');
      await stopAudioConversation();
      const task = await addTask({ ...taskProposal, sourceText: taskSourceText });
      await startTask(task.id);
      setStatus('confirmed');
      router.replace('/task-focus' as Href);
    } catch {
      setStatus('error');
      setErrorMessage('할 일을 저장하지 못했어요. 나눈 행동은 유지됩니다. 다시 확정해 주세요.');
    }
  };

  const continueWithForm = async () => {
    if (taskProposal) return;
    if (proposal) beginDraftWith(proposal);
    else beginDraft(true);
    await stopAudioConversation();
    router.replace('/create');
  };

  const closeVoiceInput = async () => {
    await stopAudioConversation();
    router.replace('/');
  };

  const toggleVoiceOutput = () => {
    setVoiceOutputEnabled((enabled) => {
      if (enabled) void Speech.stop();
      return !enabled;
    });
  };

  const conversationState = status === 'recording'
    ? '듣는 중'
    : status === 'speaking'
      ? '말하는 중'
      : status === 'processing'
        ? '정리 중'
        : '대화 대기';

  return (
    <View accessibilityLabel={`음성 일정과 할 일 ${colorMode === 'dark' ? '다크' : '화이트'} 모드`} style={[styles.page, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'right', 'bottom', 'left']}>
        <View style={styles.content}>
          <View style={styles.header}><IconButton name="close" label="음성 입력 닫기" variant="plain" iconColor={palette.text} onPress={closeVoiceInput} /><View style={styles.headerCopy}><Text style={[styles.headerTitle, { color: palette.text }]}>말로 일정·할 일</Text><Text style={[styles.headerHint, { color: palette.textMuted }]}>일정은 확인하고, 할 일은 지금 시작할 만큼 작게 나눠요</Text></View><View style={styles.headerSpacer} /></View>
          <View accessibilityLabel="AI 실시간 대화 자동 듣기 켜짐" style={[styles.aiMode, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={[styles.aiModeDot, { backgroundColor: palette.primary }]} /><Text style={[styles.aiModeText, { color: palette.text }]}>실시간 대화 · 자동 듣기</Text><Text accessibilityLiveRegion="polite" style={[styles.aiModeState, { color: palette.primary }]}>{conversationState}</Text></View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.chat}>{messages.map((message) => <View accessibilityLabel={`${message.role === 'user' ? '사용자 발화' : 'AI 응답'}: ${message.text}`} key={message.id} style={[styles.message, message.role === 'user' ? styles.userMessage : styles.assistantMessage, { backgroundColor: message.role === 'user' ? palette.primary : palette.assistantBubble }]}><Text style={[styles.messageText, { color: message.role === 'user' || colorMode === 'dark' ? '#FFFFFF' : palette.text }]}>{message.text}</Text></View>)}</View>

            {clarification ? <ClarificationCard clarification={clarification} palette={palette} onChoose={(option) => option === '직접 입력' ? setEditField(fieldToEditable(clarification.field)) : void submitTurn({ kind: 'text', text: option })} /> : null}

            {proposal ? <VoiceReview
              proposal={proposal}
              assistantReady={assistantReady}
              clarification={clarification}
              detailsOpen={detailsOpen}
              editField={editField}
              palette={palette}
              processing={status === 'processing'}
              onChange={applyManualPatch}
              onConfirm={() => void confirmSchedule()}
              onEditField={setEditField}
              onToggleDetails={() => setDetailsOpen((current) => !current)}
            /> : null}

            {taskProposal ? <TaskReview
              proposal={taskProposal}
              palette={palette}
              onChange={setTaskProposal}
            /> : null}

            {errorMessage ? <View style={[styles.error, { backgroundColor: palette.surface, borderColor: '#C2413A' }]}><Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text><View style={styles.errorActions}>{Platform.OS !== 'web' ? <Button label="마이크 설정" variant="secondary" onPress={() => void Linking.openSettings()} /> : null}<Button label="직접 입력으로 계속" variant="secondary" onPress={() => void continueWithForm()} /></View></View> : null}
            {!taskProposal ? <Pressable accessibilityRole="button" onPress={() => void continueWithForm()} style={styles.keyboardAction}><Text style={[styles.keyboardActionText, { color: palette.primary }]}>키보드로 직접 입력·수정</Text></Pressable> : null}
          </ScrollView>

          {taskProposal ? <View style={styles.taskCtaArea}><Button label="저장하고 5분만 시작" disabled={status === 'processing' || !taskProposal.title.trim() || taskProposal.actions.some((action) => !action.label.trim())} onPress={() => void confirmTask()} /></View> : null}
        </View>
        <Pressable
          accessibilityLabel={voiceOutputEnabled ? 'AI 음성 출력 끄기' : 'AI 음성 출력 켜기'}
          accessibilityRole="switch"
          accessibilityState={{ checked: voiceOutputEnabled }}
          onPress={toggleVoiceOutput}
          style={({ pressed }) => [styles.speakerFab, { backgroundColor: voiceOutputEnabled ? palette.primary : palette.surface, borderColor: palette.border, bottom: taskProposal ? 112 : 72 }, pressed && styles.pressed]}
        ><AppIcon name={voiceOutputEnabled ? 'speaker' : 'mute'} size={24} iconColor={voiceOutputEnabled ? '#FFFFFF' : palette.textMuted} /></Pressable>
      </SafeAreaView>
    </View>
  );
}

function TaskReview({ proposal, palette, onChange }: {
  proposal: VoiceTaskProposal;
  palette: ReturnType<typeof useAppTheme>['palette'];
  onChange: (proposal: VoiceTaskProposal) => void;
}) {
  const updateAction = (index: number, values: Partial<VoiceTaskProposal['actions'][number]>) => {
    onChange({ ...proposal, actions: proposal.actions.map((action, actionIndex) => actionIndex === index ? { ...action, ...values } : action) });
  };
  return <View accessibilityLabel="AI가 나눈 할 일 확인" style={[styles.review, { backgroundColor: palette.surface, borderColor: palette.border }]}>
    <View style={styles.reviewHeading}><View style={styles.reviewHeadingCopy}><Text style={[styles.reviewLead, { color: palette.primary }]}>지금 시작할 만큼 나눴어요</Text><Text style={[styles.reviewHint, { color: palette.textMuted }]}>각 행동은 2~5분이에요. 필요한 곳만 바로 고치세요.</Text></View><View style={[styles.confidence, { backgroundColor: '#E7F8F3' }]}><Text style={[styles.confidenceText, { color: '#0D766E' }]}>제안</Text></View></View>
    <Text style={[styles.taskInputLabel, { color: palette.textMuted }]}>할 일</Text>
    <TextInput accessibilityLabel="할 일 이름 수정" value={proposal.title} onChangeText={(title) => onChange({ ...proposal, title })} style={[styles.taskInput, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surfaceMuted }]} />
    <Text style={[styles.taskInputLabel, { color: palette.textMuted }]}>지금–다음–나중</Text>
    {proposal.actions.map((action, index) => <View key={index} style={styles.taskActionRow}>
      <View style={[styles.taskOrder, { backgroundColor: index === 0 ? palette.primary : palette.surfaceMuted }]}><Text style={[styles.taskOrderText, { color: index === 0 ? '#FFFFFF' : palette.textMuted }]}>{index === 0 ? '지금' : index === 1 ? '다음' : '나중'}</Text></View>
      <TextInput accessibilityLabel={`${index + 1}번째 행동 수정`} value={action.label} onChangeText={(label) => updateAction(index, { label })} style={[styles.taskActionInput, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surfaceMuted }]} />
      <Text style={[styles.taskMinutes, { color: palette.primary }]}>{action.estimatedMinutes}분</Text>
    </View>)}
    <Text style={[styles.confirmHint, { color: palette.textMuted }]}>AI 제안은 확정 전까지 저장되지 않으며, 언제든 수정하거나 닫을 수 있어요.</Text>
  </View>;
}

function ClarificationCard({ clarification, palette, onChoose }: { clarification: VoiceScheduleClarification; palette: ReturnType<typeof useAppTheme>['palette']; onChoose: (value: string) => void }) {
  return <View accessibilityRole="alert" style={[styles.clarification, { backgroundColor: palette.surface, borderColor: palette.primary }]}><View style={styles.clarificationTitle}><AppIcon name="quick" size={19} iconColor={palette.primary} /><Text style={[styles.clarificationPrompt, { color: palette.text }]}>{clarification.prompt}</Text></View><View style={styles.optionList}>{clarification.options.map((option) => <Pressable key={option} accessibilityRole="button" onPress={() => onChoose(option)} style={({ pressed }) => [styles.option, { borderColor: palette.border, backgroundColor: palette.surfaceMuted }, pressed && styles.pressed]}><Text style={[styles.optionText, { color: palette.primary }]}>{option}</Text></Pressable>)}</View></View>;
}

function VoiceReview({ proposal, assistantReady, clarification, detailsOpen, editField, palette, processing, onChange, onConfirm, onEditField, onToggleDetails }: {
  proposal: ScheduleDraft;
  assistantReady: boolean;
  clarification: VoiceScheduleClarification | null;
  detailsOpen: boolean;
  editField: EditableField;
  palette: ReturnType<typeof useAppTheme>['palette'];
  processing: boolean;
  onChange: (patch: VoiceSchedulePatch, resolvedField?: VoiceScheduleClarification['field']) => void;
  onConfirm: () => void;
  onEditField: (field: EditableField) => void;
  onToggleDetails: () => void;
}) {
  const missing = voiceScheduleMissingFields(proposal);
  const canConfirm = canConfirmVoiceSchedule(proposal, assistantReady, clarification);
  const endTime = addMinutes(proposal.appointmentTime, proposal.durationMinutes ?? 60);
  const preparationMinutes = proposal.routines.reduce((sum, item) => sum + item.minutes, 0);
  return <View accessibilityLabel="AI가 추출한 일정 확인" style={[styles.review, { backgroundColor: palette.surface, borderColor: palette.border }]}>
    <View style={styles.reviewHeading}><View style={styles.reviewHeadingCopy}><Text style={[styles.reviewLead, { color: palette.primary }]}>이렇게 등록할까요?</Text><Text style={[styles.reviewHint, { color: palette.textMuted }]}>추출된 값만 눌러 바로 수정할 수 있어요</Text></View><View style={[styles.confidence, { backgroundColor: canConfirm ? '#E7F8F3' : '#FFF4E5' }]}><Text style={[styles.confidenceText, { color: canConfirm ? '#0D766E' : '#9A5A00' }]}>{canConfirm ? '확인 완료' : '확인 필요'}</Text></View></View>
    <EditableRow label="일정명" value={proposal.title} field="title" editing={editField === 'title'} palette={palette} onEdit={onEditField} onSubmit={(title) => onChange({ title }, 'title')} />
    <EditableRow label="날짜" value={proposal.date} field="date" editing={editField === 'date'} palette={palette} onEdit={onEditField} onSubmit={(date) => onChange({ date }, 'date')} />
    <EditableRow label="시간" value={proposal.appointmentTime ? `${proposal.appointmentTime}–${endTime}` : ''} editValue={proposal.appointmentTime} field="time" editing={editField === 'time'} palette={palette} onEdit={onEditField} onSubmit={(appointmentTime) => onChange({ appointmentTime }, 'time')} />
    <EditableRow label="장소" value={proposal.destination} field="destination" editing={editField === 'destination'} palette={palette} onEdit={onEditField} onSubmit={(destination) => onChange({ destination, destinationAddress: '', destinationCoordinate: null }, 'destination')} />
    {proposal.destination ? <DestinationPicker title="지도에서 장소 확인" value={proposal} onChange={(value) => onChange(value, 'destination')} autoSearch autoSelectExact showSelectedMap /> : null}
    {detailsOpen ? <View style={styles.details}>
      <EditableRow label="소요 시간" value={`${proposal.durationMinutes ?? 60}분`} editValue={String(proposal.durationMinutes ?? 60)} field="duration" editing={editField === 'duration'} palette={palette} onEdit={onEditField} onSubmit={(value) => onChange({ durationMinutes: Number(value) || 60 })} keyboardType="number-pad" />
      <EditableRow label="반복" value={proposal.recurrence ?? '반복 없음'} field="recurrence" editing={editField === 'recurrence'} palette={palette} onEdit={onEditField} onSubmit={(recurrence) => onChange({ recurrence }, 'recurrence')} />
      <EditableRow label="준비 시간" value={`${preparationMinutes}분`} editValue={String(preparationMinutes)} field="preparation" editing={editField === 'preparation'} palette={palette} onEdit={onEditField} onSubmit={(value) => onChange({ preparationMinutes: Number(value) || preparationMinutes }, 'preparation')} keyboardType="number-pad" />
      <Text style={[styles.detailLabel, { color: palette.textMuted }]}>이동수단</Text><View style={styles.transportList}>{transports.map((transport) => { const active = proposal.transport === transport; return <Pressable key={transport} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onChange({ transport })} style={[styles.transport, { borderColor: active ? palette.primary : palette.border, backgroundColor: active ? palette.primary : palette.surfaceMuted }]}><AppIcon name={iconForTransport(transport)} size={18} iconColor={active ? '#FFFFFF' : palette.primary} /><Text style={[styles.transportText, { color: active ? '#FFFFFF' : palette.text }]}>{transport}</Text></Pressable>; })}</View>
    </View> : null}
    {missing.length ? <Text accessibilityLiveRegion="polite" style={styles.missing}>확인할 항목: {missing.join(' · ')}{proposal.destination && !proposal.destinationCoordinate ? ' · 지도 위치' : ''}</Text> : proposal.destination && !proposal.destinationCoordinate ? <Text accessibilityLiveRegion="polite" style={styles.missing}>지도에서 정확한 장소를 선택해 주세요.</Text> : null}
    <View style={styles.reviewActions}><Pressable accessibilityRole="button" onPress={() => onEditField(editField ? null : 'time')} style={styles.textAction}><Text style={[styles.textActionLabel, { color: palette.primary }]}>시간 수정</Text></Pressable><Pressable accessibilityRole="button" onPress={onToggleDetails} style={styles.textAction}><Text style={[styles.textActionLabel, { color: palette.primary }]}>{detailsOpen ? '세부 닫기' : '세부 설정'}</Text></Pressable></View>
    <Button label="확정하고 일정 등록" disabled={!canConfirm || processing} onPress={onConfirm} />
    {!canConfirm ? <Text style={[styles.confirmHint, { color: palette.textMuted }]}>AI 확인 질문과 지도 위치를 완료하면 한 번에 등록할 수 있어요.</Text> : null}
  </View>;
}

function EditableRow({ label, value, editValue = value, field, editing, palette, onEdit, onSubmit, keyboardType = 'default' }: {
  label: string;
  value: string;
  editValue?: string;
  field: Exclude<EditableField, null>;
  editing: boolean;
  palette: ReturnType<typeof useAppTheme>['palette'];
  onEdit: (field: EditableField) => void;
  onSubmit: (value: string) => void;
  keyboardType?: 'default' | 'number-pad';
}) {
  const inputRef = useRef(editValue);
  const submit = () => { onSubmit(inputRef.current.trim()); onEdit(null); };
  if (editing) return <View style={styles.editRow}><Text style={[styles.summaryLabel, { color: palette.textMuted }]}>{label}</Text><TextInput accessibilityLabel={`${label} 직접 수정`} autoFocus defaultValue={editValue} keyboardType={keyboardType} onChangeText={(value) => { inputRef.current = value; }} onBlur={submit} onSubmitEditing={submit} style={[styles.editInput, { color: palette.text, borderColor: palette.primary, backgroundColor: palette.surfaceMuted }]} /></View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value || '확인 필요'} 수정`} onPress={() => { inputRef.current = editValue; onEdit(field); }} style={({ pressed }) => [styles.summaryRow, pressed && styles.pressed]}><Text style={[styles.summaryLabel, { color: palette.textMuted }]}>{label}</Text><Text style={[styles.summaryValue, { color: value ? palette.text : '#B45309' }]}>{value || '확인 필요'}</Text><AppIcon name="chevronRight" size={17} iconColor={palette.textMuted} /></Pressable>;
}

async function recordingToInput(uri: string): Promise<VoiceScheduleInput> {
  const file = new File(uri);
  try {
    const base64 = await file.base64();
    const mimeType = inferVoiceScheduleAudioMimeType(uri, file.type);
    if (!mimeType) throw new Error('unsupported recording format');
    return { kind: 'audio', base64, mimeType };
  } finally {
    try { file.delete(); } catch { /* OS cache may already be gone */ }
  }
}

function fieldToEditable(field: VoiceScheduleClarification['field']): EditableField {
  if (field === 'time') return 'time';
  if (field === 'date') return 'date';
  if (field === 'title') return 'title';
  if (field === 'destination') return 'destination';
  if (field === 'recurrence') return 'recurrence';
  if (field === 'preparation') return 'preparation';
  return null;
}

function addMinutes(clock: string, minutes: number) {
  const match = /^(\d{2}):(\d{2})$/.exec(clock);
  if (!match) return '확인 필요';
  const total = (Number(match[1]) * 60 + Number(match[2]) + minutes) % 1_440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, safe: { flex: 1 },
  content: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm, gap: space.sm },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerCopy: { flex: 1, alignItems: 'center', paddingHorizontal: space.sm },
  headerTitle: { fontSize: 20, lineHeight: 27, fontWeight: '900' }, headerHint: { marginTop: 1, textAlign: 'center', fontSize: 12, lineHeight: 17, fontWeight: '700' }, headerSpacer: { width: 44 },
  aiMode: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1 }, aiModeDot: { width: 8, height: 8, borderRadius: 4 }, aiModeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '800' }, aiModeState: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  body: { flex: 1, minHeight: 0 }, bodyContent: { gap: space.md, paddingBottom: 76 }, chat: { gap: space.sm, paddingTop: space.sm }, message: { maxWidth: '88%', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: 18 }, assistantMessage: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 }, userMessage: { alignSelf: 'flex-end', borderBottomRightRadius: 5 }, messageText: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  clarification: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 2 }, clarificationTitle: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }, clarificationPrompt: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: '900' }, optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1 }, optionText: { fontSize: 14, fontWeight: '900' },
  review: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 }, reviewHeading: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs }, reviewHeadingCopy: { flex: 1 }, reviewLead: { fontSize: 18, lineHeight: 25, fontWeight: '900' }, reviewHint: { fontSize: 12, lineHeight: 17, fontWeight: '700' }, confidence: { minHeight: 30, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill }, confidenceText: { fontSize: 12, fontWeight: '900' },
  summaryRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8E3EC' }, summaryLabel: { width: 58, fontSize: 13, fontWeight: '800' }, summaryValue: { flex: 1, textAlign: 'right', fontSize: 15, lineHeight: 21, fontWeight: '900' }, editRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: space.sm }, editInput: { flex: 1, minHeight: 46, borderWidth: 2, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16, fontWeight: '800' },
  details: { gap: space.sm, paddingTop: space.xs }, detailLabel: { fontSize: 13, fontWeight: '800' }, transportList: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, transport: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1 }, transportText: { fontSize: 12, fontWeight: '900' }, missing: { color: '#B45309', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  reviewActions: { flexDirection: 'row', justifyContent: 'center', gap: space.lg }, textAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm }, textActionLabel: { fontSize: 14, fontWeight: '900' }, confirmHint: { textAlign: 'center', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  keyboardAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg }, keyboardActionText: { fontSize: 13, fontWeight: '900' },
  taskCtaArea: { gap: 2, paddingTop: space.xs },
  speakerFab: { position: 'absolute', right: space.lg, width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 8, boxShadow: '0 8px 20px rgba(20, 55, 85, 0.22)' },
  taskInputLabel: { fontSize: 12, lineHeight: 18, fontWeight: '900', marginTop: space.xs },
  taskInput: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16, fontWeight: '900' },
  taskActionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  taskOrder: { width: 45, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  taskOrderText: { fontSize: 11, fontWeight: '900' },
  taskActionInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 14, fontWeight: '800' },
  taskMinutes: { width: 28, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  error: { gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1 }, errorText: { color: '#C2413A', fontSize: 14, lineHeight: 21, fontWeight: '800' }, errorActions: { gap: space.sm }, pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
