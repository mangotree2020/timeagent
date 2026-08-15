import { RoutineDraft, ScheduleDraft, TransportMode } from '@/lib/schedule-draft';

export type VoiceSchedulePatch = Partial<Pick<ScheduleDraft,
  | 'title'
  | 'date'
  | 'appointmentTime'
  | 'destination'
  | 'destinationAddress'
  | 'destinationCoordinate'
  | 'transport'
  | 'priority'
  | 'routines'
  | 'durationMinutes'
  | 'recurrence'
>> & {
  preparationMinutes?: number;
};

export type VoiceClarificationField = 'title' | 'date' | 'time' | 'destination' | 'transport' | 'recurrence' | 'preparation';
export type VoiceScheduleClarification = {
  field: VoiceClarificationField;
  prompt: string;
  options: string[];
};

export type VoiceScheduleAssistantReply = {
  entryType: 'schedule' | 'task';
  transcript: string;
  assistantMessage: string;
  question: string | null;
  readyToApply: boolean;
  patch: VoiceSchedulePatch;
  clarification: VoiceScheduleClarification | null;
  task: VoiceTaskProposal | null;
};

export type VoiceTaskProposal = {
  title: string;
  actions: { label: string; estimatedMinutes: number }[];
};

export type VoiceScheduleChange = {
  label: string;
  before: string;
  after: string;
};

export type VoiceRequiredConfirmations = {
  time: boolean;
  destination: boolean;
  transport: boolean;
};

export type GuidedVoiceField = 'title' | 'dateTime' | 'destination' | 'transport';
export type VoiceActivityState = {
  heardSpeech: boolean;
  speechCandidateSinceMs: number | null;
  silenceSinceMs: number | null;
  /** Quietest level measured so far. Speech is judged against this, not only against a fixed level. */
  noiseFloorDb?: number | null;
  /** Loudest level measured since speech started, used to spot the drop back to the room. */
  peakDb?: number | null;
  /** Usable level readings so far. The noise floor is only trusted once a few have arrived. */
  meteringSamples?: number;
  meteringMissingSinceMs?: number | null;
  /** True once the device has stayed silent about levels long enough that we stop waiting for them. */
  meteringUnavailable?: boolean;
};
export const GUIDED_VOICE_QUESTIONS: { field: GuidedVoiceField; prompt: string }[] = [
  { field: 'title', prompt: '안녕! 새 약속 잡아줄게. 무슨 약속이야?' },
  { field: 'dateTime', prompt: '좋아. 언제 만나?' },
  { field: 'destination', prompt: '어디서 만나?' },
  { field: 'transport', prompt: '마지막! 어떻게 갈 거야?' },
];

export function createVoiceFirstScheduleDraft(draft: ScheduleDraft): ScheduleDraft {
  return {
    ...draft,
    step: 0,
    title: '',
    date: '',
    appointmentTime: '',
    destination: '',
    destinationAddress: '',
    destinationCoordinate: null,
    durationMinutes: 60,
    recurrence: '반복 없음',
  };
}

export function voiceScheduleMissingFields(draft: ScheduleDraft) {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push('일정명');
  if (!draft.date.trim()) missing.push('날짜');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.appointmentTime)) missing.push('시간');
  if (!draft.destination.trim()) missing.push('장소');
  return missing;
}

export function createVoiceRequiredConfirmations(): VoiceRequiredConfirmations {
  return { time: false, destination: false, transport: false };
}

export function mergeVoiceRequiredConfirmations(
  current: VoiceRequiredConfirmations,
  patch: VoiceSchedulePatch,
): VoiceRequiredConfirmations {
  return {
    time: current.time || Boolean(patch.appointmentTime),
    destination: current.destination || Boolean(patch.destination?.trim()),
    transport: current.transport || Boolean(patch.transport),
  };
}

/**
 * Turns a tapped quick choice into a patch the screen can apply on its own. Returning null means the
 * answer is open-ended and still needs the assistant.
 */
export function resolveVoiceClarificationChoice(
  field: VoiceClarificationField,
  option: string,
  now = Date.now(),
): VoiceSchedulePatch | null {
  const answer = option.trim();
  if (!answer || answer === '직접 입력') return null;
  if (field === 'transport') return transportModes.includes(answer as TransportMode) ? { transport: answer as TransportMode } : null;
  if (field === 'time') return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(answer) ? { appointmentTime: answer } : null;
  if (field === 'recurrence') return { recurrence: answer };
  if (field === 'date') {
    const spoken = /^(오늘|내일)$/.test(answer) || /^[일월화수목금토]요일$/.test(answer) || /^\d{1,2}월\s*\d{1,2}일$/.test(answer);
    return spoken ? { date: resolveSpokenDateReference(answer, now) } : null;
  }
  return null;
}

/** The next thing to ask about, covering the appointment fields a speaker most often leaves out. */
export function nextVoiceClarification(
  draft: ScheduleDraft,
  confirmations: VoiceRequiredConfirmations,
): VoiceScheduleClarification | null {
  if (!draft.title?.trim()) return { field: 'title', prompt: '무슨 약속인가요?', options: ['직접 입력'] };
  if (!draft.date?.trim()) return { field: 'date', prompt: '언제 만나나요?', options: ['오늘', '내일', '직접 입력'] };
  return nextRequiredVoiceClarification(confirmations);
}

export function nextRequiredVoiceClarification(confirmations: VoiceRequiredConfirmations): VoiceScheduleClarification | null {
  if (!confirmations.time) return { field: 'time', prompt: '약속 시간은 몇 시인가요?', options: ['직접 입력'] };
  if (!confirmations.destination) return { field: 'destination', prompt: '어디에서 만나나요?', options: ['직접 입력'] };
  if (!confirmations.transport) return { field: 'transport', prompt: '어떻게 이동할까요?', options: ['도보', '버스', '지하철', '자가용', '택시'] };
  return null;
}

const COMPACT_OPTION_MIN_COUNT = 4;
const COMPACT_OPTION_MAX_LENGTH = 3;

export function shouldUseCompactClarificationOptions(options: string[]) {
  return options.length >= COMPACT_OPTION_MIN_COUNT
    && options.every((option) => option.trim().length <= COMPACT_OPTION_MAX_LENGTH);
}

/**
 * Whether the assistant has said everything it needs to and the next move is the user's. A task is
 * judged on the actions it proposed; measuring one against the appointment fields left it forever
 * unready and its save button did nothing. While this is true the screen keeps the microphone shut,
 * because another take would only let room noise reopen questions that already have answers.
 */
export function isVoiceReplyAwaitingUser(
  reply: Pick<VoiceScheduleAssistantReply, 'entryType' | 'readyToApply' | 'task'>,
  pendingClarification: VoiceScheduleClarification | null,
) {
  if (reply.entryType === 'task') return Boolean(reply.task);
  return reply.readyToApply && pendingClarification === null;
}

/**
 * A destination the assistant heard is only a name until the map pins it, and the coordinate is what
 * schedule confirmation requires. When it is missing, the spoken guidance has to send the user to the
 * search results or the map instead of implying the schedule is ready.
 */
export function needsVoiceMapConfirmation(draft: Pick<ScheduleDraft, 'destination' | 'destinationCoordinate'>) {
  return Boolean(draft.destination.trim()) && !draft.destinationCoordinate;
}

export const VOICE_MAP_CONFIRMATION_GUIDE = '장소 검색 결과나 지도에서 정확한 위치를 확인해 주세요.';

export function canConfirmVoiceSchedule(
  draft: ScheduleDraft,
  assistantReady: boolean,
  clarification: VoiceScheduleClarification | null,
  requiredConfirmations: VoiceRequiredConfirmations,
) {
  return assistantReady
    && clarification === null
    && nextRequiredVoiceClarification(requiredConfirmations) === null
    && voiceScheduleMissingFields(draft).length === 0
    && Boolean(draft.destinationCoordinate);
}

export function resolveSpokenDateReference(text: string, now = Date.now()) {
  const reference = new Date(now);
  const explicit = /(\d{1,2})월\s*(\d{1,2})일/.exec(text);
  let target = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (explicit) {
    target = new Date(reference.getFullYear(), Number(explicit[1]) - 1, Number(explicit[2]));
    if (target.getTime() < new Date(reference.getFullYear(), reference.getMonth(), reference.getDate()).getTime()) target.setFullYear(target.getFullYear() + 1);
  } else if (text.includes('내일')) {
    target.setDate(target.getDate() + 1);
  } else {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays.findIndex((day) => text.includes(`${day}요일`));
    if (weekday >= 0) target.setDate(target.getDate() + ((weekday - target.getDay() + 7) % 7));
  }
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const suffix = dayDiff === 0 ? '오늘' : dayDiff === 1 ? '내일' : `${['일', '월', '화', '수', '목', '금', '토'][target.getDay()]}요일`;
  return `${target.getMonth() + 1}월 ${target.getDate()}일 (${suffix})`;
}

export function completeGuidedVoicePatch(field: GuidedVoiceField, transcript: string, patch: VoiceSchedulePatch, now = Date.now()) {
  if (field !== 'dateTime' || patch.date) return patch;
  return { ...patch, date: resolveSpokenDateReference(transcript, now) };
}

export function isGuidedVoiceFieldCaptured(field: GuidedVoiceField, patch: VoiceSchedulePatch) {
  if (field === 'title') return Boolean(patch.title?.trim());
  if (field === 'dateTime') return Boolean(patch.appointmentTime?.trim());
  if (field === 'destination') return Boolean(patch.destination?.trim());
  return Boolean(patch.transport);
}

export function voicePatchForGuidedField(field: GuidedVoiceField, patch: VoiceSchedulePatch): VoiceSchedulePatch {
  if (field === 'title') return patch.title ? { title: patch.title } : {};
  if (field === 'dateTime') return {
    ...(patch.date ? { date: patch.date } : {}),
    ...(patch.appointmentTime ? { appointmentTime: patch.appointmentTime } : {}),
  };
  if (field === 'destination') return {
    ...(patch.destination ? { destination: patch.destination } : {}),
    ...(patch.destinationAddress ? { destinationAddress: patch.destinationAddress } : {}),
  };
  return patch.transport ? { transport: patch.transport } : {};
}

export function createVoiceActivityState(): VoiceActivityState {
  return {
    heardSpeech: false,
    speechCandidateSinceMs: null,
    silenceSinceMs: null,
    noiseFloorDb: null,
    peakDb: null,
    meteringSamples: 0,
    meteringMissingSinceMs: null,
    meteringUnavailable: false,
  };
}

export function updateVoiceActivity(
  previous: VoiceActivityState,
  metering: number | undefined,
  durationMillis: number,
  options: {
    speechThresholdDb?: number;
    minimumListeningMs?: number;
    speechOnsetMs?: number;
    trailingSilenceMs?: number;
    noiseFloorRiseDb?: number;
    noiseFloorConfirmDb?: number;
    floorConfidenceSamples?: number;
    speechDropDb?: number;
    missingMeteringGraceMs?: number;
    maxListeningMs?: number;
  } = {},
) {
  const { maxListeningMs = 20_000 } = options;
  const measured = measureVoiceActivity(previous, metering, durationMillis, options);
  // Every turn has to end on its own. Without an upper bound a room whose noise never drops would
  // keep the microphone open until the recorder's own limit, which is what forced a manual button.
  if (durationMillis >= maxListeningMs) return { ...measured, shouldFinish: true };
  return measured;
}

function measureVoiceActivity(
  previous: VoiceActivityState,
  metering: number | undefined,
  durationMillis: number,
  {
    speechThresholdDb = -55,
    minimumListeningMs = 350,
    speechOnsetMs = 120,
    // One utterance usually carries the title, time, place, and transport together, and speakers
    // pause between those clauses. A short window cut them off mid-sentence, so the turn ends only
    // after a pause long enough to mean the speaker is done.
    trailingSilenceMs = 1_200,
    noiseFloorRiseDb = 12,
    noiseFloorConfirmDb = 8,
    floorConfidenceSamples = 3,
    speechDropDb = 18,
    missingMeteringGraceMs = 4_000,
  }: {
    speechThresholdDb?: number;
    minimumListeningMs?: number;
    speechOnsetMs?: number;
    trailingSilenceMs?: number;
    noiseFloorRiseDb?: number;
    noiseFloorConfirmDb?: number;
    floorConfidenceSamples?: number;
    speechDropDb?: number;
    missingMeteringGraceMs?: number;
  },
) {
  if (durationMillis < minimumListeningMs) return { state: previous, shouldFinish: false };

  // Some devices never report levels. Waiting for speech we cannot measure would strand the turn,
  // so after a grace period the recording is submitted and the transcript decides whether it counted.
  if (metering === undefined) {
    const meteringMissingSinceMs = previous.meteringMissingSinceMs ?? durationMillis;
    const meteringUnavailable = durationMillis - meteringMissingSinceMs >= missingMeteringGraceMs;
    return {
      state: { ...previous, meteringMissingSinceMs, meteringUnavailable },
      shouldFinish: meteringUnavailable,
    };
  }

  const noiseFloorDb = previous.noiseFloorDb === null || previous.noiseFloorDb === undefined
    ? metering
    : Math.min(previous.noiseFloorDb, metering);
  const meteringSamples = (previous.meteringSamples ?? 0) + 1;
  const base = { ...previous, noiseFloorDb, meteringSamples, meteringMissingSinceMs: null, meteringUnavailable: false };
  // The fixed threshold is only a stand-in until enough readings exist to know how quiet the room
  // is. Once the floor is measured, speech has to rise above the room instead of above a constant,
  // otherwise a room that is simply louder than the constant registers as continuous speech.
  const floorMeasured = meteringSamples > floorConfidenceSamples;
  const isSpeechLevel = metering >= noiseFloorDb + noiseFloorRiseDb
    || (!floorMeasured && metering >= speechThresholdDb);
  // Speech accepted on the fixed threshold alone is withdrawn if the loudest reading turns out to
  // be no louder than the room.
  if (floorMeasured && previous.heardSpeech
    && previous.peakDb !== null && previous.peakDb !== undefined
    && previous.peakDb < noiseFloorDb + noiseFloorConfirmDb) {
    return {
      state: { ...base, heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null, peakDb: null },
      shouldFinish: false,
    };
  }
  // A room noisier than the fixed threshold stays "speech" forever by absolute level alone, so the
  // drop back down from the loudest measured level also counts as the speaker stopping.
  const droppedFromSpeech = previous.peakDb !== null && previous.peakDb !== undefined
    && metering <= previous.peakDb - speechDropDb;

  if (isSpeechLevel && !droppedFromSpeech) {
    const peakDb = previous.peakDb === null || previous.peakDb === undefined
      ? metering
      : Math.max(previous.peakDb, metering);
    if (previous.heardSpeech) {
      return { state: { ...base, peakDb, silenceSinceMs: null }, shouldFinish: false };
    }
    const speechCandidateSinceMs = previous.speechCandidateSinceMs ?? durationMillis;
    const heardSpeech = durationMillis - speechCandidateSinceMs >= speechOnsetMs;
    return {
      state: { ...base, peakDb: heardSpeech ? peakDb : previous.peakDb ?? null, speechCandidateSinceMs, heardSpeech, silenceSinceMs: null },
      shouldFinish: false,
    };
  }
  if (!previous.heardSpeech) {
    return {
      state: { ...base, heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null, peakDb: null },
      shouldFinish: false,
    };
  }
  const silenceSinceMs = previous.silenceSinceMs ?? durationMillis;
  return {
    state: { ...base, silenceSinceMs },
    shouldFinish: durationMillis - silenceSinceMs >= trailingSilenceMs,
  };
}

export type VoiceRecorderTake = {
  /** The screen started a take and has not handled its end yet. */
  started: boolean;
  /** The polled recorder state has reported this take as running at least once. */
  observedRunning: boolean;
  /** Whether the newest polled recorder state reports a recording in progress. */
  polledRecording: boolean;
};

/**
 * The recorder state is polled, so it still reads "not recording" for a moment after a take starts,
 * and preparing a take already fills in the recording file path. Reading that gap as a finished take
 * restarts the microphone while it is still open, which the recorder refuses. A take counts as ended
 * only once the poll has actually seen it running.
 */
export function isVoiceTakeFinished(take: VoiceRecorderTake) {
  return take.started && take.observedRunning && !take.polledRecording;
}

export function shouldSubmitVoiceRecording(
  activity: VoiceActivityState,
  durationMillis: number,
  explicitlyFinished = false,
) {
  return activity.heardSpeech
    || activity.meteringUnavailable === true
    || (explicitlyFinished && durationMillis >= 350);
}

const transportModes: TransportMode[] = ['AI 추천', '도보', '버스', '지하철', '자가용', '택시'];

export function applyVoiceSchedulePatch(draft: ScheduleDraft, patch: VoiceSchedulePatch): ScheduleDraft {
  const { preparationMinutes, ...schedulePatch } = patch;
  const destinationChanged = (patch.destination !== undefined && patch.destination !== draft.destination)
    || (patch.destinationAddress !== undefined && patch.destinationAddress !== draft.destinationAddress);
  return {
    ...draft,
    ...schedulePatch,
    ...(preparationMinutes !== undefined && patch.routines === undefined ? {
      routines: [{ id: 'voice-preparation', icon: 'routine', label: '약속 준비', minutes: preparationMinutes, minutesEditedByUser: true }],
    } : {}),
    destinationCoordinate: patch.destinationCoordinate !== undefined
      ? patch.destinationCoordinate
      : destinationChanged ? null : draft.destinationCoordinate,
  };
}

export function describeVoiceScheduleChanges(before: ScheduleDraft, after: ScheduleDraft): VoiceScheduleChange[] {
  const candidates: [string, string, string][] = [
    ['일정 이름', before.title, after.title],
    ['날짜', before.date, after.date],
    ['약속 시간', before.appointmentTime, after.appointmentTime],
    ['목적지', before.destination, after.destination],
    ['목적지 주소', before.destinationAddress, after.destinationAddress],
    ['이동수단', before.transport, after.transport],
    ['도착 우선순위', priorityLabel(before.priority), priorityLabel(after.priority)],
    ['준비 행동', routinesLabel(before.routines), routinesLabel(after.routines)],
    ['일정 길이', `${before.durationMinutes ?? 60}분`, `${after.durationMinutes ?? 60}분`],
    ['반복', before.recurrence ?? '반복 없음', after.recurrence ?? '반복 없음'],
  ];
  return candidates
    .filter(([, previous, next]) => previous !== next)
    .map(([label, previous, next]) => ({ label, before: previous || '미입력', after: next || '미입력' }));
}

export function normalizeVoiceScheduleReply(value: unknown): VoiceScheduleAssistantReply {
  if (!isRecord(value)
    || !isTrimmedText(value.transcript, 2_000)
    || !isTrimmedText(value.assistantMessage, 1_000)
    || !(value.question === null || isTrimmedText(value.question, 500))
    || typeof value.readyToApply !== 'boolean'
    || !isRecord(value.patch)) {
    throw invalidResponse();
  }

  const patch = normalizePatch(value.patch);
  const entryType = value.entryType === undefined ? 'schedule' : value.entryType;
  if (entryType !== 'schedule' && entryType !== 'task') throw invalidResponse();
  const task = normalizeTaskProposal(value.task);
  if (entryType === 'task' && !task) throw invalidResponse();
  return {
    entryType,
    transcript: value.transcript.trim(),
    assistantMessage: value.assistantMessage.trim(),
    question: value.question === null ? null : value.question.trim(),
    readyToApply: value.readyToApply,
    patch,
    clarification: normalizeClarification(value.clarification),
    task,
  };
}

function normalizeTaskProposal(value: unknown): VoiceTaskProposal | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)
    || !isTrimmedText(value.title, 120)
    || !Array.isArray(value.actions)
    || value.actions.length < 1
    || value.actions.length > 3) throw invalidResponse();
  const actions = value.actions.map((action) => {
    if (!isRecord(action)
      || !isTrimmedText(action.label, 100)
      || typeof action.estimatedMinutes !== 'number'
      || !Number.isInteger(action.estimatedMinutes)
      || action.estimatedMinutes < 2
      || action.estimatedMinutes > 5) throw invalidResponse();
    return { label: action.label.trim(), estimatedMinutes: action.estimatedMinutes };
  });
  return { title: value.title.trim(), actions };
}

function normalizeClarification(value: unknown): VoiceScheduleClarification | null {
  if (value === null || value === undefined) return null;
  const fields: VoiceClarificationField[] = ['title', 'date', 'time', 'destination', 'transport', 'recurrence', 'preparation'];
  if (!isRecord(value)
    || typeof value.field !== 'string'
    || !fields.includes(value.field as VoiceClarificationField)
    || !isTrimmedText(value.prompt, 300)
    || !Array.isArray(value.options)
    || value.options.length > 6
    || value.options.some((option) => !isTrimmedText(option, 80))) {
    throw invalidResponse();
  }
  return {
    field: value.field as VoiceClarificationField,
    prompt: value.prompt.trim(),
    options: value.options.map((option) => option.trim()),
  };
}

function normalizePatch(value: Record<string, unknown>): VoiceSchedulePatch {
  const patch: VoiceSchedulePatch = {};
  for (const key of ['title', 'date', 'destination', 'destinationAddress'] as const) {
    const item = value[key];
    if (item === null || item === undefined) continue;
    if (!isTrimmedText(item, key === 'destinationAddress' ? 300 : 120)) throw invalidResponse();
    patch[key] = item.trim();
  }

  const appointmentTime = value.appointmentTime;
  if (appointmentTime !== null && appointmentTime !== undefined) {
    if (typeof appointmentTime !== 'string' || !isValidTime(appointmentTime)) throw invalidResponse();
    patch.appointmentTime = appointmentTime;
  }

  const transport = value.transport;
  if (transport !== null && transport !== undefined) {
    if (typeof transport !== 'string' || !transportModes.includes(transport as TransportMode)) throw invalidResponse();
    patch.transport = transport as TransportMode;
  }

  const priority = value.priority;
  if (priority !== null && priority !== undefined) {
    if (priority !== 'on-time' && priority !== 'cost') throw invalidResponse();
    patch.priority = priority;
  }

  const routines = value.routines;
  if (routines !== null && routines !== undefined) {
    if (!Array.isArray(routines) || routines.length > 12) throw invalidResponse();
    patch.routines = routines.map((routine, index) => normalizeRoutine(routine, index));
  }
  const durationMinutes = value.durationMinutes;
  if (durationMinutes !== null && durationMinutes !== undefined) {
    if (typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 1_440) throw invalidResponse();
    patch.durationMinutes = durationMinutes;
  }
  const recurrence = value.recurrence;
  if (recurrence !== null && recurrence !== undefined) {
    if (!isTrimmedText(recurrence, 120)) throw invalidResponse();
    patch.recurrence = recurrence.trim();
  }
  const preparationMinutes = value.preparationMinutes;
  if (preparationMinutes !== null && preparationMinutes !== undefined) {
    if (typeof preparationMinutes !== 'number' || !Number.isInteger(preparationMinutes) || preparationMinutes < 1 || preparationMinutes > 720) throw invalidResponse();
    patch.preparationMinutes = preparationMinutes;
  }
  return patch;
}

function normalizeRoutine(value: unknown, index: number): RoutineDraft {
  if (!isRecord(value)
    || !isTrimmedText(value.label, 80)
    || typeof value.minutes !== 'number'
    || !Number.isInteger(value.minutes)
    || value.minutes < 1
    || value.minutes > 180) {
    throw invalidResponse();
  }
  // Spoken out loud counts as set by the person, so a learned average must not replace it.
  return { id: `voice-${index}`, icon: 'routine', label: value.label.trim(), minutes: value.minutes, minutesEditedByUser: true };
}

function isValidTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function priorityLabel(priority: ScheduleDraft['priority']) {
  return priority === 'on-time' ? '정시 도착 우선' : '비용 우선';
}

function routinesLabel(routines: RoutineDraft[]) {
  return routines.map((routine) => `${routine.label} ${routine.minutes}분`).join(', ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isTrimmedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function invalidResponse() {
  return new Error('AI 일정 응답 형식이 올바르지 않습니다.');
}
