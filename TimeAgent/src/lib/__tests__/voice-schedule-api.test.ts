import {
  inferVoiceScheduleAudioMimeType,
  SupabaseVoiceScheduleProvider,
  VoiceScheduleApiError,
} from '@/lib/voice-schedule-api';
import { createDefaultScheduleDraft } from '@/lib/schedule-draft';

const baseUrl = 'https://project.supabase.co/functions/v1/assistant';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const validReply = {
  transcript: '내일 열 시 반 치과',
  assistantMessage: '치과 일정으로 이해했어요.',
  question: '주소를 알려주시겠어요?',
  readyToApply: false,
  patch: {
    title: '치과 진료',
    date: null,
    appointmentTime: '10:30',
    destination: '치과',
    destinationAddress: null,
    transport: null,
    priority: null,
    routines: null,
  },
};

describe('SupabaseVoiceScheduleProvider', () => {
  it('normalizes Android M4A MIME variants before sending audio', async () => {
    const fetcher = jest.fn(async (_input: string, _request: RequestInit) => jsonResponse(validReply));
    const provider = new SupabaseVoiceScheduleProvider({
      baseUrl,
      fetcher,
      now: () => new Date('2026-07-27T18:30:00.000Z'),
      timezone: () => 'Asia/Seoul',
    });

    await provider.submitTurn({
      conversationId: 'device-session-1',
      draft: createDefaultScheduleDraft(),
      history: [],
      input: { kind: 'audio', base64: 'AAECAw==', mimeType: 'audio/mp4; codecs=mp4a.40.2' },
    });

    const body = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(body.input).toEqual({ kind: 'audio', base64: 'AAECAw==', mimeType: 'audio/m4a' });
    expect(body.clientContext.localDate).toBe('2026-07-28');
    expect(inferVoiceScheduleAudioMimeType('file:///cache/recording.m4a', '')).toBe('audio/m4a');
    expect(inferVoiceScheduleAudioMimeType('file:///cache/recording.m4a', 'audio/x-m4a')).toBe('audio/m4a');
  });

  it('sends a bounded text turn and validates the assistant response', async () => {
    const fetcher = jest.fn(async (_input: string, _request: RequestInit) => jsonResponse(validReply));
    const provider = new SupabaseVoiceScheduleProvider({
      baseUrl,
      fetcher,
      now: () => new Date('2026-07-27T06:30:00.000Z'),
      timezone: () => 'Asia/Seoul',
    });

    const reply = await provider.submitTurn({
      conversationId: 'device-session-1',
      draft: createDefaultScheduleDraft(),
      history: [{ role: 'assistant', text: '언제 만나는 약속인가요?' }],
      input: { kind: 'text', text: '내일 오전 열 시 반이야' },
    });

    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe(`${baseUrl}/v1/schedule/turn`);
    expect(request.method).toBe('POST');
    expect(JSON.parse(String(request.body))).toMatchObject({
      conversationId: 'device-session-1',
      input: { kind: 'text', text: '내일 오전 열 시 반이야' },
      clientContext: {
        nowIso: '2026-07-27T06:30:00.000Z',
        timezone: 'Asia/Seoul',
        localDate: '2026-07-27',
      },
    });
    expect(reply.patch.appointmentTime).toBe('10:30');
  });

  it('does not send more than the latest eight conversation turns', async () => {
    const fetcher = jest.fn(async (_input: string, _request: RequestInit) => jsonResponse(validReply));
    const provider = new SupabaseVoiceScheduleProvider({ baseUrl, fetcher });
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      text: `대화 ${index}`,
    }));

    await provider.submitTurn({
      conversationId: 'device-session-1',
      draft: createDefaultScheduleDraft(),
      history,
      input: { kind: 'text', text: '계속' },
    });

    const body = JSON.parse(String(fetcher.mock.calls[0][1].body));
    expect(body.history).toHaveLength(8);
    expect(body.history[0].text).toBe('대화 4');
  });

  it('maps offline and retryable service failures to actionable errors', async () => {
    const offline = new SupabaseVoiceScheduleProvider({
      baseUrl,
      fetcher: jest.fn(async () => { throw new TypeError('offline'); }),
    });
    await expect(offline.submitTurn({
      conversationId: 'device-session-1',
      draft: createDefaultScheduleDraft(),
      history: [],
      input: { kind: 'text', text: '안녕' },
    })).rejects.toEqual(expect.objectContaining<Partial<VoiceScheduleApiError>>({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    }));

    const unavailable = new SupabaseVoiceScheduleProvider({
      baseUrl,
      fetcher: jest.fn(async () => jsonResponse({
        error: { code: 'SERVICE_NOT_CONFIGURED', message: 'AI 연결 설정이 필요합니다.', retryable: false },
      }, 503)),
    });
    await expect(unavailable.submitTurn({
      conversationId: 'device-session-1',
      draft: createDefaultScheduleDraft(),
      history: [],
      input: { kind: 'text', text: '안녕' },
    })).rejects.toMatchObject({ code: 'SERVICE_NOT_CONFIGURED', retryable: false, status: 503 });
  });
});
