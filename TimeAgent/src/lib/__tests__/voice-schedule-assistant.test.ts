import { createDefaultScheduleDraft } from '@/lib/schedule-draft';
import {
  applyVoiceSchedulePatch,
  describeVoiceScheduleChanges,
  completeGuidedVoicePatch,
  GUIDED_VOICE_QUESTIONS,
  normalizeVoiceScheduleReply,
  resolveSpokenDateReference,
} from '@/lib/voice-schedule-assistant';

describe('voice schedule assistant domain', () => {
  it('keeps the original draft unchanged until the proposed patch is explicitly applied', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      destinationCoordinate: { latitude: 35.15, longitude: 129.06 },
    };
    const patch = {
      title: '내일 치과 진료',
      appointmentTime: '10:30',
      destination: '연산동 치과',
      destinationAddress: '부산 연제구 중앙대로 1000',
    };

    expect(draft.title).toBe('친구와 볼링');

    const applied = applyVoiceSchedulePatch(draft, patch);

    expect(draft.title).toBe('친구와 볼링');
    expect(applied).toMatchObject(patch);
    expect(applied.destinationCoordinate).toBeNull();
  });

  it('normalizes a strict server reply and removes null patch fields', () => {
    const reply = normalizeVoiceScheduleReply({
      transcript: '내일 열 시 반 치과 가야 해',
      assistantMessage: '내일 오전 10시 30분 치과 일정으로 이해했어요.',
      question: '치과 주소를 알려주시겠어요?',
      readyToApply: false,
      patch: {
        title: '치과 진료',
        date: '7월 28일 (내일)',
        appointmentTime: '10:30',
        destination: '치과',
        destinationAddress: null,
        transport: null,
        priority: 'on-time',
        routines: [{ label: '양치', minutes: 5 }],
      },
    });

    expect(reply.patch).toEqual({
      title: '치과 진료',
      date: '7월 28일 (내일)',
      appointmentTime: '10:30',
      destination: '치과',
      priority: 'on-time',
      routines: [{ id: 'voice-0', icon: 'routine', label: '양치', minutes: 5 }],
    });
  });

  it('rejects invalid times and routine durations from an untrusted response', () => {
    expect(() => normalizeVoiceScheduleReply({
      transcript: '아무 말',
      assistantMessage: '확인했어요.',
      question: null,
      readyToApply: true,
      patch: { appointmentTime: '25:90', routines: [{ label: '준비', minutes: 0 }] },
    })).toThrow('응답');
  });

  it('describes changed fields with before and after values', () => {
    const draft = createDefaultScheduleDraft();
    const applied = applyVoiceSchedulePatch(draft, {
      appointmentTime: '15:20',
      transport: '지하철',
    });

    expect(describeVoiceScheduleChanges(draft, applied)).toEqual(expect.arrayContaining([
      { label: '약속 시간', before: '14:00', after: '15:20' },
      { label: '이동수단', before: 'AI 추천', after: '지하철' },
    ]));
  });

  it('asks only the four required guided questions in order', () => {
    expect(GUIDED_VOICE_QUESTIONS.map((item) => item.field)).toEqual(['title', 'dateTime', 'destination', 'transport']);
  });

  it('uses today for time-only speech and the current week for a weekday', () => {
    const saturday = new Date('2026-08-08T09:00:00+09:00').getTime();
    expect(resolveSpokenDateReference('저녁 7시', saturday)).toBe('8월 8일 (오늘)');
    expect(resolveSpokenDateReference('이번 주 토요일 저녁 7시', new Date('2026-08-03T09:00:00+09:00').getTime())).toBe('8월 8일 (토요일)');
    expect(resolveSpokenDateReference('8월 19일 오후 2시', saturday)).toBe('8월 19일 (수요일)');
    expect(completeGuidedVoicePatch('dateTime', '저녁 7시', { appointmentTime: '19:00' }, saturday)).toEqual({ appointmentTime: '19:00', date: '8월 8일 (오늘)' });
  });
});
