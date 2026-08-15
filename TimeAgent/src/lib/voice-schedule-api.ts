import { ScheduleDraft } from '@/lib/schedule-draft';
import { GuidedVoiceField, normalizeVoiceScheduleReply, VoiceScheduleAssistantReply } from '@/lib/voice-schedule-assistant';

/**
 * Speech-sized recording settings. The library default records 44.1kHz stereo, which uploads and
 * transcribes far more audio than a spoken sentence needs and makes each turn feel slow.
 */
export const VOICE_RECORDING_OPTIONS = {
  extension: '.m4a',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 32_000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4' as const, audioEncoder: 'aac' as const },
  ios: {
    outputFormat: 'aac ' as const,
    audioQuality: 32,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32_000 },
};

export type VoiceScheduleHistoryTurn = { role: 'user' | 'assistant'; text: string };
export type VoiceScheduleInput =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; base64: string; mimeType: string };

export type VoiceScheduleTurnRequest = {
  conversationId: string;
  draft: ScheduleDraft;
  history: VoiceScheduleHistoryTurn[];
  input: VoiceScheduleInput;
  flowContext?: {
    mode: 'guided' | 'one-shot';
    guidedField?: GuidedVoiceField;
    guidedPrompt?: string;
  };
  signal?: AbortSignal;
};

type VoiceScheduleResponse = Pick<Response, 'ok' | 'status' | 'json'>;
type VoiceScheduleFetcher = (input: string, init: RequestInit) => Promise<VoiceScheduleResponse>;

type VoiceScheduleApiErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_TIMEOUT'
  | 'SERVICE_NOT_CONFIGURED'
  | 'SERVICE_UNAVAILABLE'
  | 'UPSTREAM_REJECTED'
  | 'UPSTREAM_UNAVAILABLE';

export class VoiceScheduleApiError extends Error {
  readonly name = 'VoiceScheduleApiError';

  constructor(
    message: string,
    readonly code: VoiceScheduleApiErrorCode,
    readonly retryable: boolean,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export class SupabaseVoiceScheduleProvider {
  private readonly baseUrl: string;
  private readonly fetcher: VoiceScheduleFetcher;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private readonly timezone: () => string;

  constructor({ baseUrl, fetcher = fetch, timeoutMs = 45_000, now = () => new Date(), timezone = deviceTimezone }: {
    baseUrl: string;
    fetcher?: VoiceScheduleFetcher;
    timeoutMs?: number;
    now?: () => Date;
    timezone?: () => string;
  }) {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (!normalized.startsWith('https://')) {
      throw new VoiceScheduleApiError('음성 일정 AI 주소가 설정되지 않았습니다.', 'CONFIGURATION_ERROR', false, null);
    }
    this.baseUrl = normalized;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.timezone = timezone;
  }

  async submitTurn(request: VoiceScheduleTurnRequest): Promise<VoiceScheduleAssistantReply> {
    validateRequest(request);
    let input = request.input;
    if (request.input.kind === 'audio') {
      const mimeType = inferVoiceScheduleAudioMimeType('', request.input.mimeType);
      if (!mimeType) throw invalidInput();
      input = { ...request.input, mimeType };
    }
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    request.signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const now = this.now();
      const timezone = this.timezone();
      const response = await this.fetcher(`${this.baseUrl}/v1/schedule/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: request.conversationId,
          draft: request.draft,
          history: request.history.slice(-8),
          input,
          flowContext: request.flowContext ?? { mode: 'one-shot' },
          clientContext: {
            nowIso: now.toISOString(),
            timezone,
            localDate: localCalendarDate(now, timezone),
          },
        }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw responseError(payload, response.status);
      try {
        return normalizeVoiceScheduleReply(payload);
      } catch {
        throw new VoiceScheduleApiError('AI 일정 응답을 확인하지 못했습니다.', 'INVALID_RESPONSE', true, response.status);
      }
    } catch (error) {
      if (error instanceof VoiceScheduleApiError) throw error;
      if (timedOut) {
        throw new VoiceScheduleApiError('AI 확인 시간이 초과되었습니다. 다시 시도해 주세요.', 'REQUEST_TIMEOUT', true, null);
      }
      throw new VoiceScheduleApiError('네트워크에 연결할 수 없습니다. 직접 입력하거나 다시 시도해 주세요.', 'NETWORK_UNAVAILABLE', true, null);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', onAbort);
    }
  }
}

export function inferVoiceScheduleAudioMimeType(uri: string, declaredType: string) {
  const normalized = declaredType.split(';', 1)[0].trim().toLowerCase();
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a' || normalized === 'audio/m4a') return 'audio/m4a';
  if (normalized === 'audio/wav' || normalized === 'audio/webm') return normalized;
  const extension = uri.split(/[?#]/, 1)[0].toLowerCase();
  if (extension.endsWith('.m4a') || extension.endsWith('.mp4')) return 'audio/m4a';
  if (extension.endsWith('.wav')) return 'audio/wav';
  if (extension.endsWith('.webm')) return 'audio/webm';
  return null;
}

export function createConfiguredVoiceScheduleProvider() {
  const mobilityBase = process.env.EXPO_PUBLIC_MOBILITY_API_BASE_URL ?? '';
  const derivedBase = mobilityBase.replace(/\/mobility\/?$/, '/assistant');
  return new SupabaseVoiceScheduleProvider({
    baseUrl: process.env.EXPO_PUBLIC_ASSISTANT_API_BASE_URL ?? derivedBase,
  });
}

function validateRequest(request: VoiceScheduleTurnRequest) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(request.conversationId)) throw invalidInput();
  if (request.history.length > 50 || request.history.some((turn) => !turn.text.trim() || turn.text.length > 1_000)) throw invalidInput();
  if (request.input.kind === 'text') {
    if (!request.input.text.trim() || request.input.text.length > 2_000) throw invalidInput();
  } else if (!request.input.base64 || request.input.base64.length > 7_000_000 || !inferVoiceScheduleAudioMimeType('', request.input.mimeType)) {
    throw invalidInput();
  }
  if (request.flowContext) {
    const validFields: GuidedVoiceField[] = ['title', 'dateTime', 'destination', 'transport'];
    if ((request.flowContext.mode !== 'guided' && request.flowContext.mode !== 'one-shot')
      || (request.flowContext.guidedField !== undefined && !validFields.includes(request.flowContext.guidedField))
      || (request.flowContext.guidedPrompt !== undefined && (!request.flowContext.guidedPrompt.trim() || request.flowContext.guidedPrompt.length > 200))) {
      throw invalidInput();
    }
  }
}

function invalidInput() {
  return new VoiceScheduleApiError('말하거나 입력한 내용을 확인해 주세요.', 'INVALID_INPUT', false, 400);
}

function responseError(value: unknown, status: number) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : {};
  const allowed: VoiceScheduleApiErrorCode[] = [
    'CONFIGURATION_ERROR', 'INVALID_INPUT', 'INVALID_RESPONSE', 'NETWORK_UNAVAILABLE',
    'REQUEST_TIMEOUT', 'SERVICE_NOT_CONFIGURED', 'SERVICE_UNAVAILABLE',
    'UPSTREAM_REJECTED', 'UPSTREAM_UNAVAILABLE',
  ];
  const code = typeof error.code === 'string' && allowed.includes(error.code as VoiceScheduleApiErrorCode)
    ? error.code as VoiceScheduleApiErrorCode
    : status >= 500 || status === 429 ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_REJECTED';
  const retryable = typeof error.retryable === 'boolean' ? error.retryable : status >= 500 || status === 429;
  const message = typeof error.message === 'string' && error.message.trim()
    ? error.message
    : retryable ? 'AI 일정을 일시적으로 확인하지 못했습니다.' : '말한 내용을 확인할 수 없습니다.';
  return new VoiceScheduleApiError(message, code, retryable, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

function localCalendarDate(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  return year && month && day ? `${year}-${month}-${day}` : now.toISOString().slice(0, 10);
}
