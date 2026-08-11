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

export type VoiceClarificationField = 'title' | 'date' | 'time' | 'destination' | 'recurrence' | 'preparation';
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

export type GuidedVoiceField = 'title' | 'dateTime' | 'destination' | 'transport';
export type VoiceActivityState = {
  heardSpeech: boolean;
  speechCandidateSinceMs: number | null;
  silenceSinceMs: number | null;
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

export function canConfirmVoiceSchedule(
  draft: ScheduleDraft,
  assistantReady: boolean,
  clarification: VoiceScheduleClarification | null,
) {
  return assistantReady
    && clarification === null
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

export function updateVoiceActivity(
  previous: VoiceActivityState,
  metering: number | undefined,
  durationMillis: number,
  {
    speechThresholdDb = -48,
    minimumListeningMs = 350,
    speechOnsetMs = 240,
    trailingSilenceMs = 700,
  } = {},
) {
  if (metering === undefined || durationMillis < minimumListeningMs) {
    return { state: previous, shouldFinish: false };
  }
  if (metering >= speechThresholdDb) {
    if (previous.heardSpeech) {
      return { state: { ...previous, silenceSinceMs: null }, shouldFinish: false };
    }
    const speechCandidateSinceMs = previous.speechCandidateSinceMs ?? durationMillis;
    return {
      state: {
        heardSpeech: durationMillis - speechCandidateSinceMs >= speechOnsetMs,
        speechCandidateSinceMs,
        silenceSinceMs: null,
      },
      shouldFinish: false,
    };
  }
  if (!previous.heardSpeech) {
    return {
      state: { heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null },
      shouldFinish: false,
    };
  }
  const silenceSinceMs = previous.silenceSinceMs ?? durationMillis;
  return {
    state: { ...previous, silenceSinceMs },
    shouldFinish: durationMillis - silenceSinceMs >= trailingSilenceMs,
  };
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
      routines: [{ id: 'voice-preparation', icon: 'routine', label: '약속 준비', minutes: preparationMinutes }],
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
  const fields: VoiceClarificationField[] = ['title', 'date', 'time', 'destination', 'recurrence', 'preparation'];
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
  return { id: `voice-${index}`, icon: 'routine', label: value.label.trim(), minutes: value.minutes };
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
