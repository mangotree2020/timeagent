import { createDefaultScheduleDraft } from '@/lib/schedule-draft';
import {
  applyVoiceSchedulePatch,
  canConfirmVoiceSchedule,
  createVoiceFirstScheduleDraft,
  describeVoiceScheduleChanges,
  completeGuidedVoicePatch,
  GUIDED_VOICE_QUESTIONS,
  isGuidedVoiceFieldCaptured,
  normalizeVoiceScheduleReply,
  resolveSpokenDateReference,
  shouldSubmitVoiceRecording,
  shouldUseCompactClarificationOptions,
  updateVoiceActivity,
  createVoiceRequiredConfirmations,
  mergeVoiceRequiredConfirmations,
  nextRequiredVoiceClarification,
  voiceScheduleMissingFields,
} from '@/lib/voice-schedule-assistant';

describe('voice schedule assistant domain', () => {
  it('keeps the original draft unchanged until the proposed patch is explicitly applied', () => {
    const draft = {
      ...createDefaultScheduleDraft(),
      title: '친구와 볼링',
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

  it('starts voice registration without placeholder schedule values', () => {
    const draft = createVoiceFirstScheduleDraft(createDefaultScheduleDraft());

    expect(draft).toMatchObject({
      title: '',
      date: '',
      appointmentTime: '',
      destination: '',
      destinationAddress: '',
      destinationCoordinate: null,
      durationMinutes: 60,
      recurrence: '반복 없음',
    });
    expect(draft.routines.length).toBeGreaterThan(0);
  });

  it('normalizes a strict server reply and removes null patch fields', () => {
    const reply = normalizeVoiceScheduleReply({
      transcript: '내일 열 시 반 치과 가야 해',
      assistantMessage: '내일 오전 10시 30분 치과 일정으로 이해했어요.',
      question: '치과 주소를 알려주시겠어요?',
      readyToApply: false,
      clarification: {
        field: 'destination',
        prompt: '어느 치과인가요?',
        options: ['연산동', '서면', '직접 입력'],
      },
      patch: {
        title: '치과 진료',
        date: '7월 28일 (내일)',
        appointmentTime: '10:30',
        destination: '치과',
        destinationAddress: null,
        transport: null,
        priority: 'on-time',
        routines: [{ label: '양치', minutes: 5 }],
        durationMinutes: 60,
        recurrence: '반복 없음',
        preparationMinutes: 15,
      },
    });

    expect(reply.patch).toEqual({
      title: '치과 진료',
      date: '7월 28일 (내일)',
      appointmentTime: '10:30',
      destination: '치과',
      priority: 'on-time',
      routines: [{ id: 'voice-0', icon: 'routine', label: '양치', minutes: 5 }],
      durationMinutes: 60,
      recurrence: '반복 없음',
      preparationMinutes: 15,
    });
    expect(reply.clarification).toEqual({
      field: 'destination',
      prompt: '어느 치과인가요?',
      options: ['연산동', '서면', '직접 입력'],
    });
    expect(reply.entryType).toBe('schedule');
    expect(reply.task).toBeNull();
  });

  it('normalizes a task into at most three 2–5 minute actions', () => {
    const reply = normalizeVoiceScheduleReply({
      entryType: 'task',
      transcript: '보고서 작성해야 해',
      assistantMessage: '지금 시작할 수 있게 세 단계로 나눴어요.',
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
    });

    expect(reply.entryType).toBe('task');
    expect(reply.task).toEqual({
      title: '보고서 작성',
      actions: [
        { label: '문서 열기', estimatedMinutes: 2 },
        { label: '제목 쓰기', estimatedMinutes: 3 },
        { label: '자료 하나 붙이기', estimatedMinutes: 5 },
      ],
    });
  });

  it('keeps confirmation disabled until required values and a map location are verified', () => {
    const blank = createVoiceFirstScheduleDraft(createDefaultScheduleDraft());
    expect(voiceScheduleMissingFields(blank)).toEqual(['일정명', '날짜', '시간', '장소']);

    const extracted = applyVoiceSchedulePatch(blank, {
      title: '병원',
      date: '8월 12일 (내일)',
      appointmentTime: '15:00',
      destination: '강남 세브란스병원',
    });
    const unconfirmed = createVoiceRequiredConfirmations();
    expect(canConfirmVoiceSchedule(extracted, true, null, unconfirmed)).toBe(false);

    const located = {
      ...extracted,
      destinationAddress: '서울 강남구 언주로 211',
      destinationCoordinate: { latitude: 37.492, longitude: 127.046 },
    };
    expect(canConfirmVoiceSchedule(located, false, null, unconfirmed)).toBe(false);
    expect(canConfirmVoiceSchedule(located, true, { field: 'time', prompt: '몇 시인가요?', options: ['13:00'] }, unconfirmed)).toBe(false);

    const requiredConfirmed = mergeVoiceRequiredConfirmations(unconfirmed, {
      appointmentTime: '15:00',
      destination: '강남 세브란스병원',
      transport: '지하철',
    });
    expect(canConfirmVoiceSchedule(located, true, null, requiredConfirmed)).toBe(true);
  });

  it('requires an explicit transport answer instead of accepting the default recommendation', () => {
    const draft = {
      ...createVoiceFirstScheduleDraft(createDefaultScheduleDraft()),
      title: '친구 약속',
      date: '8월 14일 (내일)',
      appointmentTime: '15:00',
      destination: '강남역',
      destinationCoordinate: { latitude: 37.498, longitude: 127.028 },
    };
    const confirmedTimeAndPlace = mergeVoiceRequiredConfirmations(createVoiceRequiredConfirmations(), {
      appointmentTime: '15:00',
      destination: '강남역',
    });

    expect(nextRequiredVoiceClarification(confirmedTimeAndPlace)).toEqual({
      field: 'transport',
      prompt: '어떻게 이동할까요?',
      options: ['도보', '버스', '지하철', '자가용', '택시'],
    });
    expect(canConfirmVoiceSchedule(draft, true, null, confirmedTimeAndPlace)).toBe(false);
  });

  it('lays the five transport options out on a single row and keeps long options wrapped', () => {
    const transportOptions = nextRequiredVoiceClarification(
      mergeVoiceRequiredConfirmations(createVoiceRequiredConfirmations(), { appointmentTime: '15:00', destination: '강남역' }),
    )?.options as string[];

    expect(shouldUseCompactClarificationOptions(transportOptions)).toBe(true);
    expect(shouldUseCompactClarificationOptions(['13:00', '15:00', '17:00', '직접 입력'])).toBe(false);
    expect(shouldUseCompactClarificationOptions(['도보', '버스', '지하철'])).toBe(false);
  });

  it('turns an extracted preparation duration into an explicit routine when no routine list is supplied', () => {
    const draft = createVoiceFirstScheduleDraft(createDefaultScheduleDraft());
    const applied = applyVoiceSchedulePatch(draft, { preparationMinutes: 30 });

    expect(applied.routines).toEqual([{ id: 'voice-preparation', icon: 'routine', label: '약속 준비', minutes: 30 }]);
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
    const draft = { ...createDefaultScheduleDraft(), appointmentTime: '14:00' };
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

  it('advances a guided step only when the requested schedule field was actually captured', () => {
    expect(isGuidedVoiceFieldCaptured('title', {})).toBe(false);
    expect(isGuidedVoiceFieldCaptured('title', { title: '치과 진료' })).toBe(true);
    expect(isGuidedVoiceFieldCaptured('dateTime', { date: '2026-08-11' })).toBe(false);
    expect(isGuidedVoiceFieldCaptured('dateTime', { appointmentTime: '10:30' })).toBe(true);
    expect(isGuidedVoiceFieldCaptured('destination', { destination: '연산동 치과' })).toBe(true);
    expect(isGuidedVoiceFieldCaptured('transport', { transport: '지하철' })).toBe(true);
  });

  it('detects speech followed by sustained silence for hands-free turn completion', () => {
    let activity = updateVoiceActivity({ heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null }, -65, 400);
    expect(activity.shouldFinish).toBe(false);
    activity = updateVoiceActivity(activity.state, -24, 900);
    expect(activity.state.heardSpeech).toBe(false);
    activity = updateVoiceActivity(activity.state, -24, 1_150);
    expect(activity.state.heardSpeech).toBe(true);
    activity = updateVoiceActivity(activity.state, -60, 1_400);
    expect(activity.shouldFinish).toBe(false);
    activity = updateVoiceActivity(activity.state, -60, 2_150);
    expect(activity.shouldFinish).toBe(true);
  });

  it('does not treat one short ambient-noise spike as speech', () => {
    let activity = updateVoiceActivity({ heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null }, -25, 900);
    activity = updateVoiceActivity(activity.state, -65, 1_020);
    expect(activity.state.heardSpeech).toBe(false);
    expect(activity.state.speechCandidateSinceMs).toBeNull();
    expect(activity.shouldFinish).toBe(false);
  });

  it('detects quieter Android speech without requiring three loud samples in a row', () => {
    let activity = updateVoiceActivity({ heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null }, -52, 600);
    expect(activity.state.heardSpeech).toBe(false);
    activity = updateVoiceActivity(activity.state, -52, 720);
    expect(activity.state.heardSpeech).toBe(true);
    activity = updateVoiceActivity(activity.state, -64, 900);
    activity = updateVoiceActivity(activity.state, -64, 1_600);
    expect(activity.shouldFinish).toBe(true);
  });

  it('allows an explicit finish after a usable recording when device metering misses speech', () => {
    const silentActivity = { heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null };
    expect(shouldSubmitVoiceRecording(silentActivity, 349, true)).toBe(false);
    expect(shouldSubmitVoiceRecording(silentActivity, 350, true)).toBe(true);
    expect(shouldSubmitVoiceRecording(silentActivity, 2_000, false)).toBe(false);
    expect(shouldSubmitVoiceRecording({ ...silentActivity, heardSpeech: true }, 2_000, false)).toBe(true);
  });
});
