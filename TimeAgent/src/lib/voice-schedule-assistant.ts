import { RoutineDraft, ScheduleDraft, TransportMode } from '@/lib/schedule-draft';

export type VoiceSchedulePatch = Partial<Pick<ScheduleDraft,
  | 'title'
  | 'date'
  | 'appointmentTime'
  | 'destination'
  | 'destinationAddress'
  | 'transport'
  | 'priority'
  | 'routines'
>>;

export type VoiceScheduleAssistantReply = {
  transcript: string;
  assistantMessage: string;
  question: string | null;
  readyToApply: boolean;
  patch: VoiceSchedulePatch;
};

export type VoiceScheduleChange = {
  label: string;
  before: string;
  after: string;
};

const transportModes: TransportMode[] = ['AI 추천', '도보', '버스', '지하철', '자가용', '택시'];

export function applyVoiceSchedulePatch(draft: ScheduleDraft, patch: VoiceSchedulePatch): ScheduleDraft {
  const destinationChanged = (patch.destination !== undefined && patch.destination !== draft.destination)
    || (patch.destinationAddress !== undefined && patch.destinationAddress !== draft.destinationAddress);
  return {
    ...draft,
    ...patch,
    destinationCoordinate: destinationChanged ? null : draft.destinationCoordinate,
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
  return {
    transcript: value.transcript.trim(),
    assistantMessage: value.assistantMessage.trim(),
    question: value.question === null ? null : value.question.trim(),
    readyToApply: value.readyToApply,
    patch,
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
