import { ScheduleDraft } from '@/lib/schedule-draft';
import { normalizeVoiceScheduleReply, VoiceScheduleAssistantReply } from '@/lib/voice-schedule-assistant';

export type VoiceScheduleHistoryTurn = { role: 'user' | 'assistant'; text: string };
export type VoiceScheduleInput =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; base64: string; mimeType: string };

export type VoiceScheduleTurnRequest = {
  conversationId: string;
  draft: ScheduleDraft;
  history: VoiceScheduleHistoryTurn[];
  input: VoiceScheduleInput;
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

  constructor({ baseUrl, fetcher = fetch, timeoutMs = 45_000 }: {
    baseUrl: string;
    fetcher?: VoiceScheduleFetcher;
    timeoutMs?: number;
  }) {
    const normalized = baseUrl.trim().replace(/\/+$/, '');
    if (!normalized.startsWith('https://')) {
      throw new VoiceScheduleApiError('음성 일정 AI 주소가 설정되지 않았습니다.', 'CONFIGURATION_ERROR', false, null);
    }
    this.baseUrl = normalized;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  async submitTurn(request: VoiceScheduleTurnRequest): Promise<VoiceScheduleAssistantReply> {
    validateRequest(request);
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    request.signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetcher(`${this.baseUrl}/v1/schedule/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: request.conversationId,
          draft: request.draft,
          history: request.history.slice(-8),
          input: request.input,
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
  } else if (!request.input.base64 || request.input.base64.length > 7_000_000 || !/^audio\//.test(request.input.mimeType)) {
    throw invalidInput();
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
