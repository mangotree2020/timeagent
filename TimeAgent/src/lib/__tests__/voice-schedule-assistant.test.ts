import { createDefaultScheduleDraft } from '@/lib/schedule-draft';
import {
  ANSWER_TURN_TRAILING_SILENCE_MS,
  OPEN_TURN_MAX_LISTENING_MS,
  OPEN_TURN_TRAILING_SILENCE_MS,
  derivedVoiceScheduleTitle,
  shouldOfferChoiceInsteadOfListening,
  isVoiceTurnComplete,
  withDerivedVoiceScheduleTitle,
  applyVoiceSchedulePatch,
  canConfirmVoiceSchedule,
  createVoiceFirstScheduleDraft,
  describeVoiceScheduleChanges,
  completeGuidedVoicePatch,
  GUIDED_VOICE_QUESTIONS,
  isGuidedVoiceFieldCaptured,
  isVoiceReplyAwaitingUser,
  isVoiceTakeFinished,
  normalizeSpokenDateText,
  normalizeVoiceScheduleReply,
  withSpokenDestinationOnly,
  resolveSpokenDateReference,
  shouldSubmitVoiceRecording,
  shouldUseCompactClarificationOptions,
  updateVoiceActivity,
  createVoiceActivityState,
  createVoiceRequiredConfirmations,
  mergeVoiceRequiredConfirmations,
  needsVoiceMapConfirmation,
  nextRequiredVoiceClarification,
  nextVoiceClarification,
  resolveVoiceClarificationChoice,
  voiceGuidanceAfterTransportChoice,
  voiceScheduleMissingFields,
  voiceListeningOptions,
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
      routines: [{ id: 'voice-0', icon: 'routine', label: '양치', minutes: 5, minutesEditedByUser: true }],
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
      transport: '대중교통',
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
      options: ['대중교통', '승용차(택시)', '도보'],
    });
    expect(canConfirmVoiceSchedule(draft, true, null, confirmedTimeAndPlace)).toBe(false);
  });

  it('keeps the three combined transport options on full-width rows', () => {
    const transportOptions = nextRequiredVoiceClarification(
      mergeVoiceRequiredConfirmations(createVoiceRequiredConfirmations(), { appointmentTime: '15:00', destination: '강남역' }),
    )?.options as string[];

    // Three options, one of them six characters wide, read better as rows than as a squeezed line.
    expect(transportOptions).toEqual(['대중교통', '승용차(택시)', '도보']);
    expect(shouldUseCompactClarificationOptions(transportOptions)).toBe(false);
    expect(shouldUseCompactClarificationOptions(['13:00', '15:00', '17:00', '직접 입력'])).toBe(false);
    expect(shouldUseCompactClarificationOptions(['오늘', '내일', '모레', '주말'])).toBe(true);
  });

  it('answers a quick choice locally so the screen does not wait for the assistant', () => {
    expect(resolveVoiceClarificationChoice('transport', '버스')).toEqual({ transport: '대중교통' });
    expect(resolveVoiceClarificationChoice('time', '15:00')).toEqual({ appointmentTime: '15:00' });
    expect(resolveVoiceClarificationChoice('recurrence', '매주')).toEqual({ recurrence: '매주' });

    const friday = new Date(2026, 7, 14, 9).getTime();
    expect(resolveVoiceClarificationChoice('date', '내일', friday)).toEqual({ date: '8월 15일 (내일)' });
    expect(resolveVoiceClarificationChoice('date', '오늘', friday)).toEqual({ date: '8월 14일 (오늘)' });
    expect(resolveVoiceClarificationChoice('date', '그때쯤', friday)).toBeNull();

    expect(resolveVoiceClarificationChoice('transport', '직접 입력')).toBeNull();
    expect(resolveVoiceClarificationChoice('transport', '헬리콥터')).toBeNull();
    expect(resolveVoiceClarificationChoice('time', '오후에')).toBeNull();
    expect(resolveVoiceClarificationChoice('destination', '강남역')).toBeNull();
  });

  it('asks for every appointment field the speaker left out, starting with the title', () => {
    const blank = createVoiceFirstScheduleDraft(createDefaultScheduleDraft());
    const unconfirmed = createVoiceRequiredConfirmations();
    expect(nextVoiceClarification(blank, unconfirmed)?.field).toBe('title');

    const titled = applyVoiceSchedulePatch(blank, { title: '병원' });
    expect(nextVoiceClarification(titled, unconfirmed)?.field).toBe('date');

    const dated = applyVoiceSchedulePatch(titled, { date: '8월 14일 (내일)' });
    expect(nextVoiceClarification(dated, unconfirmed)?.field).toBe('time');

    const confirmedTime = mergeVoiceRequiredConfirmations(unconfirmed, { appointmentTime: '15:00' });
    expect(nextVoiceClarification(dated, confirmedTime)?.field).toBe('destination');

    const confirmedPlace = mergeVoiceRequiredConfirmations(confirmedTime, { destination: '강남역' });
    expect(nextVoiceClarification(dated, confirmedPlace)?.field).toBe('transport');

    const confirmedAll = mergeVoiceRequiredConfirmations(confirmedPlace, { transport: '대중교통' });
    expect(nextVoiceClarification(dated, confirmedAll)).toBeNull();
  });

  it('turns an extracted preparation duration into an explicit routine when no routine list is supplied', () => {
    const draft = createVoiceFirstScheduleDraft(createDefaultScheduleDraft());
    const applied = applyVoiceSchedulePatch(draft, { preparationMinutes: 30 });

    // Spoken durations are the person's own, so a learned average must not replace them later.
    expect(applied.routines).toEqual([{ id: 'voice-preparation', icon: 'routine', label: '약속 준비', minutes: 30, minutesEditedByUser: true }]);
  });

  it('keeps one row for a preparation action the assistant named twice', () => {
    // Seen on the device: 짐 챙기기 came back in the middle of the list and again at the end. Two
    // rows under one name cannot be edited — minutes changed on one leave the other alone, and
    // deleting one leaves its twin. Spacing is not a difference either.
    const reply = normalizeVoiceScheduleReply({
      transcript: '내일 세 시 약속',
      assistantMessage: '준비 항목을 정리했어요.',
      question: null,
      readyToApply: true,
      patch: {
        routines: [
          { label: '샤워', minutes: 12 },
          { label: '짐 챙기기', minutes: 5 },
          { label: '옷 입기', minutes: 5 },
          { label: '짐챙기기', minutes: 8 },
        ],
      },
    });

    expect(reply.patch.routines?.map((routine) => routine.label)).toEqual(['샤워', '짐 챙기기', '옷 입기']);
    // The first mention is the one that stays, with the minutes it was given there.
    expect(reply.patch.routines?.[1]).toEqual({ id: 'voice-1', icon: 'routine', label: '짐 챙기기', minutes: 5, minutesEditedByUser: true });
  });

  it('keeps one row for a task action the assistant named twice', () => {
    const reply = normalizeVoiceScheduleReply({
      entryType: 'task',
      transcript: '보고서 작성해야 해',
      assistantMessage: '이렇게 나눠볼게요.',
      question: null,
      readyToApply: true,
      patch: {},
      task: {
        title: '보고서 작성',
        actions: [
          { label: '자료 모으기', estimatedMinutes: 5 },
          { label: '자료 모으기', estimatedMinutes: 3 },
        ],
      },
    });

    expect(reply.task?.actions).toEqual([{ label: '자료 모으기', estimatedMinutes: 5 }]);
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
      transport: '대중교통',
    });

    expect(describeVoiceScheduleChanges(draft, applied)).toEqual(expect.arrayContaining([
      { label: '약속 시간', before: '14:00', after: '15:20' },
      { label: '이동수단', before: 'AI 추천', after: '대중교통' },
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
    expect(isGuidedVoiceFieldCaptured('transport', { transport: '대중교통' })).toBe(true);
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
    activity = updateVoiceActivity(activity.state, -60, 1_400 + OPEN_TURN_TRAILING_SILENCE_MS - 100);
    expect(activity.shouldFinish).toBe(false);
    activity = updateVoiceActivity(activity.state, -60, 1_400 + OPEN_TURN_TRAILING_SILENCE_MS + 50);
    expect(activity.shouldFinish).toBe(true);
  });

  it('keeps listening through a clause pause so one utterance can carry every field', () => {
    // "내일 오후 3시에 … 서면역에서 치과, … 지하철로" — the pauses between clauses must not end the turn.
    let activity = updateVoiceActivity(createVoiceActivityState(), -60, 400);
    activity = updateVoiceActivity(activity.state, -22, 600);
    activity = updateVoiceActivity(activity.state, -20, 800);
    expect(activity.state.heardSpeech).toBe(true);

    // A speaker gathering the next clause is quiet for well over a second; that is not the end.
    activity = updateVoiceActivity(activity.state, -60, 1_000);
    activity = updateVoiceActivity(activity.state, -60, 2_800);
    expect(activity.shouldFinish).toBe(false);

    activity = updateVoiceActivity(activity.state, -20, 2_950);
    activity = updateVoiceActivity(activity.state, -60, 3_150);
    activity = updateVoiceActivity(activity.state, -60, 5_000);
    expect(activity.shouldFinish).toBe(false);
    activity = updateVoiceActivity(activity.state, -60, 5_200);
    expect(activity.shouldFinish).toBe(true);
  });

  it('ends an answer turn sooner than an opening one, because an answer is a word or two', () => {
    const answer = voiceListeningOptions('answer');
    let activity = updateVoiceActivity(createVoiceActivityState(), -60, 400, answer);
    activity = updateVoiceActivity(activity.state, -22, 600, answer);
    activity = updateVoiceActivity(activity.state, -20, 800, answer);
    expect(activity.state.heardSpeech).toBe(true);

    activity = updateVoiceActivity(activity.state, -60, 1_000, answer);
    activity = updateVoiceActivity(activity.state, -60, 1_000 + ANSWER_TURN_TRAILING_SILENCE_MS + 50, answer);
    expect(activity.shouldFinish).toBe(true);

    // The same pause during the opening turn is still someone thinking mid-sentence.
    let opening = updateVoiceActivity(createVoiceActivityState(), -60, 400);
    opening = updateVoiceActivity(opening.state, -22, 600);
    opening = updateVoiceActivity(opening.state, -20, 800);
    opening = updateVoiceActivity(opening.state, -60, 1_000);
    opening = updateVoiceActivity(opening.state, -60, 1_000 + ANSWER_TURN_TRAILING_SILENCE_MS + 50);
    expect(opening.shouldFinish).toBe(false);
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
    activity = updateVoiceActivity(activity.state, -64, 900 + OPEN_TURN_TRAILING_SILENCE_MS + 50);
    expect(activity.shouldFinish).toBe(true);
  });

  it('allows an explicit finish after a usable recording when device metering misses speech', () => {
    const silentActivity = { heardSpeech: false, speechCandidateSinceMs: null, silenceSinceMs: null };
    expect(shouldSubmitVoiceRecording(silentActivity, 349, true)).toBe(false);
    expect(shouldSubmitVoiceRecording(silentActivity, 350, true)).toBe(true);
    expect(shouldSubmitVoiceRecording(silentActivity, 2_000, false)).toBe(false);
    expect(shouldSubmitVoiceRecording({ ...silentActivity, heardSpeech: true }, 2_000, false)).toBe(true);
  });

  it('hands the turn to the user once a schedule or a task proposal has nothing left to ask', () => {
    const task = { title: '보고서 작성', actions: [{ label: '문서 열기', estimatedMinutes: 2 }] };
    // A task used to be measured against the appointment fields, so it never became ready and its
    // save button did nothing.
    expect(isVoiceReplyAwaitingUser({ entryType: 'task', readyToApply: true, task }, null)).toBe(true);
    expect(isVoiceReplyAwaitingUser({ entryType: 'task', readyToApply: true, task: null }, null)).toBe(false);
    expect(isVoiceReplyAwaitingUser({ entryType: 'schedule', readyToApply: true, task: null }, null)).toBe(true);
    expect(isVoiceReplyAwaitingUser({ entryType: 'schedule', readyToApply: false, task: null }, null)).toBe(false);
    expect(isVoiceReplyAwaitingUser(
      { entryType: 'schedule', readyToApply: true, task: null },
      { field: 'transport', prompt: '어떻게 이동할까요?', options: ['버스'] },
    )).toBe(false);
  });

  it('asks for map confirmation only while a named destination has no coordinate', () => {
    expect(needsVoiceMapConfirmation({ destination: '서면역', destinationCoordinate: null })).toBe(true);
    expect(needsVoiceMapConfirmation({ destination: '서면역', destinationCoordinate: { latitude: 35.1578, longitude: 129.0592 } })).toBe(false);
    expect(needsVoiceMapConfirmation({ destination: '  ', destinationCoordinate: null })).toBe(false);
  });

  it('waits for the polled recorder state to catch up before calling a take finished', () => {
    // The moment after a take starts, the poll still reports the previous idle reading. Calling that
    // a finished take restarted the microphone while it was still open, which the recorder refuses.
    expect(isVoiceTakeFinished({ started: true, observedRunning: false, polledRecording: false })).toBe(false);
    expect(isVoiceTakeFinished({ started: true, observedRunning: true, polledRecording: true })).toBe(false);
    expect(isVoiceTakeFinished({ started: true, observedRunning: true, polledRecording: false })).toBe(true);
    expect(isVoiceTakeFinished({ started: false, observedRunning: true, polledRecording: false })).toBe(false);
  });

  it('ends the turn in a noisy room where ambient sound stays above the absolute speech threshold', () => {
    let activity = updateVoiceActivity(createVoiceActivityState(), -42, 400);
    activity = updateVoiceActivity(activity.state, -42, 700);
    expect(activity.shouldFinish).toBe(false);

    activity = updateVoiceActivity(activity.state, -16, 900);
    activity = updateVoiceActivity(activity.state, -14, 1_100);
    expect(activity.state.heardSpeech).toBe(true);

    activity = updateVoiceActivity(activity.state, -42, 1_400);
    expect(activity.shouldFinish).toBe(false);
    activity = updateVoiceActivity(activity.state, -42, 1_400 + OPEN_TURN_TRAILING_SILENCE_MS + 50);
    expect(activity.shouldFinish).toBe(true);
  });

  it('detects speech that never crosses the absolute threshold by comparing it to the measured noise floor', () => {
    let activity = updateVoiceActivity(createVoiceActivityState(), -78, 400);
    activity = updateVoiceActivity(activity.state, -76, 600);
    expect(activity.state.heardSpeech).toBe(false);

    activity = updateVoiceActivity(activity.state, -62, 800);
    activity = updateVoiceActivity(activity.state, -61, 1_000);
    expect(activity.state.heardSpeech).toBe(true);

    activity = updateVoiceActivity(activity.state, -77, 1_200);
    activity = updateVoiceActivity(activity.state, -77, 1_200 + OPEN_TURN_TRAILING_SILENCE_MS + 50);
    expect(activity.shouldFinish).toBe(true);
  });

  it('submits the recording when the device never reports metering so no manual finish is needed', () => {
    let activity = updateVoiceActivity(createVoiceActivityState(), undefined, 400);
    expect(activity.shouldFinish).toBe(false);
    expect(shouldSubmitVoiceRecording(activity.state, 400)).toBe(false);

    activity = updateVoiceActivity(activity.state, undefined, 2_000);
    expect(activity.shouldFinish).toBe(false);

    activity = updateVoiceActivity(activity.state, undefined, 4_400);
    expect(activity.shouldFinish).toBe(true);
    expect(shouldSubmitVoiceRecording(activity.state, 4_400)).toBe(true);
  });

  it('always ends a turn within the maximum listening window so no manual finish is needed', () => {
    // Someone talking without pause: levels stay well above the measured room floor.
    let activity = updateVoiceActivity(createVoiceActivityState(), -60, 400);
    activity = updateVoiceActivity(activity.state, -22, 600);
    activity = updateVoiceActivity(activity.state, -20, 800);
    expect(activity.state.heardSpeech).toBe(true);

    for (let elapsed = 920; elapsed <= OPEN_TURN_MAX_LISTENING_MS - 100; elapsed += 120) {
      activity = updateVoiceActivity(activity.state, elapsed % 240 === 0 ? -22 : -20, elapsed);
    }
    expect(activity.shouldFinish).toBe(false);

    activity = updateVoiceActivity(activity.state, -20, OPEN_TURN_MAX_LISTENING_MS);
    expect(activity.shouldFinish).toBe(true);
    expect(shouldSubmitVoiceRecording(activity.state, OPEN_TURN_MAX_LISTENING_MS)).toBe(true);
  });

  it('restarts instead of submitting when the maximum window passes without any speech', () => {
    let activity = updateVoiceActivity(createVoiceActivityState(), -80, 400);
    activity = updateVoiceActivity(activity.state, -80, OPEN_TURN_MAX_LISTENING_MS);

    expect(activity.shouldFinish).toBe(true);
    expect(shouldSubmitVoiceRecording(activity.state, OPEN_TURN_MAX_LISTENING_MS)).toBe(false);
  });

  it('never submits steady room noise, even when it sits above the absolute speech threshold', () => {
    // A room measured at a constant -45dB is louder than the fixed threshold but carries no speech.
    let activity = updateVoiceActivity(createVoiceActivityState(), -45, 400);
    for (let elapsed = 520; elapsed <= 14_000; elapsed += 120) {
      activity = updateVoiceActivity(activity.state, -45, elapsed);
    }

    expect(activity.state.heardSpeech).toBe(false);
    expect(shouldSubmitVoiceRecording(activity.state, 14_000)).toBe(false);

    activity = updateVoiceActivity(activity.state, -45, OPEN_TURN_MAX_LISTENING_MS);
    expect(activity.shouldFinish).toBe(true);
    expect(shouldSubmitVoiceRecording(activity.state, OPEN_TURN_MAX_LISTENING_MS)).toBe(false);
  });

  it('still hears real speech that rises above a noisy room', () => {
    let activity = updateVoiceActivity(createVoiceActivityState(), -45, 400);
    for (let elapsed = 520; elapsed <= 2_000; elapsed += 120) {
      activity = updateVoiceActivity(activity.state, -45, elapsed);
    }
    expect(activity.state.heardSpeech).toBe(false);

    activity = updateVoiceActivity(activity.state, -20, 2_120);
    activity = updateVoiceActivity(activity.state, -18, 2_300);
    expect(activity.state.heardSpeech).toBe(true);
    expect(shouldSubmitVoiceRecording(activity.state, 2_300)).toBe(true);
  });

  it('keeps trusting metering once the device reports it after a silent start', () => {
    let activity = updateVoiceActivity(createVoiceActivityState(), undefined, 400);
    activity = updateVoiceActivity(activity.state, -70, 2_000);
    activity = updateVoiceActivity(activity.state, -70, 5_000);
    expect(activity.shouldFinish).toBe(false);
    expect(shouldSubmitVoiceRecording(activity.state, 5_000)).toBe(false);
  });
});

describe('date wording from the assistant', () => {
  const friday = new Date(2026, 7, 14, 9).getTime();

  it('rewrites a calendar date the way every other screen writes dates', () => {
    // Seen in production: the review card showed 2026-08-16 while the rest of the app writes 8월 16일.
    expect(normalizeSpokenDateText('2026-08-14', friday)).toBe('8월 14일 (오늘)');
    expect(normalizeSpokenDateText('2026-08-15', friday)).toBe('8월 15일 (내일)');
    expect(normalizeSpokenDateText('2026-08-16', friday)).toBe('8월 16일 (일요일)');
  });

  it('leaves wording it did not produce untouched', () => {
    expect(normalizeSpokenDateText('8월 16일 (일요일)', friday)).toBe('8월 16일 (일요일)');
    expect(normalizeSpokenDateText('내일', friday)).toBe('내일');
    // An impossible date is left as-is rather than rolled into a real one.
    expect(normalizeSpokenDateText('2026-13-45', friday)).toBe('2026-13-45');
  });
});

describe('naming a schedule the speaker already described', () => {
  it('names the appointment after the place, instead of asking for a label', () => {
    expect(derivedVoiceScheduleTitle('부산역')).toBe('부산역 약속');
    expect(derivedVoiceScheduleTitle('  해운대 스타벅스 ')).toBe('해운대 스타벅스 약속');
    expect(derivedVoiceScheduleTitle('   ')).toBe('');
  });

  it('leaves a title the speaker did give alone', () => {
    const named = { ...createDefaultScheduleDraft(), title: '치과 예약', destination: '서면역' };
    expect(withDerivedVoiceScheduleTitle(named).title).toBe('치과 예약');
  });

  it('does not ask for a title once a place has been heard', () => {
    const confirmations = { time: true, destination: true, transport: true };
    const untitled = { ...createDefaultScheduleDraft(), title: '', destination: '부산역', date: '8월 18일 (내일)' };
    expect(nextVoiceClarification(untitled, confirmations)).toBeNull();

    // With neither a title nor a place there is genuinely nothing to name it after.
    const empty = { ...createDefaultScheduleDraft(), title: '', destination: '', date: '8월 18일 (내일)' };
    expect(nextVoiceClarification(empty, confirmations)?.field).toBe('title');
  });

  it('carries the derived title through a patch so the flow has one less question', () => {
    const draft = { ...createDefaultScheduleDraft(), title: '', destination: '' };
    const next = withDerivedVoiceScheduleTitle(applyVoiceSchedulePatch(draft, { destination: '광안리 해수욕장' }));
    expect(next.title).toBe('광안리 해수욕장 약속');
  });
});

describe('a field the microphone keeps missing', () => {
  it('offers the fixed list for transport rather than asking again', () => {
    expect(shouldOfferChoiceInsteadOfListening(
      { field: 'transport', prompt: '어떻게 이동할까요?', options: ['도보', '버스', '지하철', '자가용', '택시'] },
    )).toBe(true);
  });

  it('still listens for the answers that only the speaker can give', () => {
    expect(shouldOfferChoiceInsteadOfListening({ field: 'destination', prompt: '어디로 가시나요?', options: ['직접 입력'] })).toBe(false);
    expect(shouldOfferChoiceInsteadOfListening({ field: 'time', prompt: '몇 시인가요?', options: ['직접 입력'] })).toBe(false);
    expect(shouldOfferChoiceInsteadOfListening(null)).toBe(false);
  });
});

describe('speaking on after a tapped way to get there', () => {
  const pinned = {
    ...createDefaultScheduleDraft(),
    destination: '역삼역',
    destinationCoordinate: { latitude: 37.5006, longitude: 127.0364 },
  };
  const unpinned = { ...pinned, destinationCoordinate: null };

  it('guides to the map while the spoken place has no pinned location', () => {
    // A tapped choice is resolved on the device, so no assistant reply is read aloud — without this
    // guide the schedule sounded finished while the place was still only a name.
    expect(voiceGuidanceAfterTransportChoice(unpinned, null)).toEqual({
      guide: '장소 검색 결과나 지도에서 정확한 위치를 확인해 주세요.',
      awaitsSpeech: false,
    });
  });

  it('asks the still-open question aloud and listens for the answer', () => {
    const asked = { field: 'destination' as const, prompt: '어디에서 만나나요?', options: ['직접 입력'] };
    expect(voiceGuidanceAfterTransportChoice(pinned, asked)).toEqual({
      guide: '어디에서 만나나요?',
      awaitsSpeech: true,
    });
  });

  it('stays silent once nothing is left to confirm', () => {
    expect(voiceGuidanceAfterTransportChoice(pinned, null)).toBeNull();
  });
});

describe('what counts as the speaker choosing a way to get there', () => {
  it('does not treat the draft default as an answer', () => {
    const none = createVoiceRequiredConfirmations();
    expect(mergeVoiceRequiredConfirmations(none, { transport: 'AI 추천' }).transport).toBe(false);
    expect(mergeVoiceRequiredConfirmations(none, { transport: '대중교통' }).transport).toBe(true);
  });

  it('keeps an answer already given, whatever arrives next', () => {
    const chosen = { time: false, destination: false, transport: true };
    expect(mergeVoiceRequiredConfirmations(chosen, { transport: 'AI 추천' }).transport).toBe(true);
  });

  it('still asks how to get there when only the default came back', () => {
    const confirmations = mergeVoiceRequiredConfirmations(
      createVoiceRequiredConfirmations(),
      { appointmentTime: '15:00', destination: '부산역', transport: 'AI 추천' },
    );
    expect(nextRequiredVoiceClarification(confirmations)?.field).toBe('transport');
  });
});

describe('deciding a turn is over', () => {
  const complete = {
    ...createDefaultScheduleDraft(),
    title: '부산역 약속', date: '8월 18일 (내일)', appointmentTime: '15:00', destination: '부산역',
  };
  const answered = { time: true, destination: true, transport: true };

  it('trusts the draft over the assistant flagging itself unready', () => {
    // A careful model fills every field and still says it is not ready; listening again then lets
    // room noise reopen questions that already have answers.
    expect(isVoiceTurnComplete({ entryType: 'schedule', task: null }, null, complete, answered)).toBe(true);
  });

  it('is not over while something is still missing', () => {
    const noPlace = { ...complete, destination: '' };
    expect(isVoiceTurnComplete({ entryType: 'schedule', task: null }, null, noPlace, answered)).toBe(false);

    const unanswered = { time: true, destination: true, transport: false };
    expect(isVoiceTurnComplete({ entryType: 'schedule', task: null }, null, complete, unanswered)).toBe(false);
  });

  it('is not over while a question is on screen', () => {
    const asked = { field: 'transport' as const, prompt: '어떻게 이동할까요?', options: ['버스'] };
    expect(isVoiceTurnComplete({ entryType: 'schedule', task: null }, asked, complete, answered)).toBe(false);
  });

  it('judges a task on the actions it proposed', () => {
    const task = { title: '보고서 작성', actions: [{ label: '문서 열기', estimatedMinutes: 2 }] };
    expect(isVoiceTurnComplete({ entryType: 'task', task }, null, createDefaultScheduleDraft(), answered)).toBe(true);
    expect(isVoiceTurnComplete({ entryType: 'task', task: null }, null, createDefaultScheduleDraft(), answered)).toBe(false);
  });
});

describe('a place the person never said', () => {
  it('drops a destination that shares nothing with what was spoken', () => {
    // Reported from the device: 강남역 arrived in a conversation about somewhere else entirely. The
    // instruction forbids it, and a forbidden thing that still happens has to be caught in code.
    const patch = withSpokenDestinationOnly({
      title: '회의',
      appointmentTime: '15:00',
      destination: '강남역',
      destinationAddress: '서울 강남구',
      destinationCoordinate: { latitude: 37.4979, longitude: 127.0276 },
    }, ['내일 세 시에 회의 있어']);

    expect(patch.destination).toBeUndefined();
    expect(patch.destinationAddress).toBeUndefined();
    expect(patch.destinationCoordinate).toBeUndefined();
    // The rest of the turn is still worth having; only the invented place goes.
    expect(patch).toEqual({ title: '회의', appointmentTime: '15:00' });
  });

  it('keeps a place the map spelled out more fully than it was said', () => {
    // 강남 세브란스 comes back as 강남 세브란스병원, and 부산역 with the line written after it.
    // Completing a name is not inventing one.
    const fuller = withSpokenDestinationOnly({ destination: '강남 세브란스병원' }, ['내일 3시 강남 세브란스']);
    const annotated = withSpokenDestinationOnly({ destination: '부산역[부산지하철1호선]' }, ['부산역에서 보자']);

    expect(fuller.destination).toBe('강남 세브란스병원');
    expect(annotated.destination).toBe('부산역[부산지하철1호선]');
  });

  it('recognises the place through how it is said, not how it was typed', () => {
    // The recogniser writes what it hears: 동내역 for 동래역, 밀락 for 민락.
    expect(withSpokenDestinationOnly({ destination: '동래역' }, ['동내역 앞에서 만나']).destination).toBe('동래역');
  });

  it('keeps a place named in an earlier turn of the same conversation', () => {
    const patch = withSpokenDestinationOnly({ destination: '홍대입구역' }, ['홍대입구역에서 보자', '내일 세 시']);

    expect(patch.destination).toBe('홍대입구역');
  });

  it('drops a place when the person has not said anything yet', () => {
    expect(withSpokenDestinationOnly({ destination: '강남역' }, []).destination).toBeUndefined();
    expect(withSpokenDestinationOnly({ destination: '강남역' }, ['  ']).destination).toBeUndefined();
  });

  it('leaves a patch with no destination exactly as it is', () => {
    const patch = { appointmentTime: '15:00' };

    expect(withSpokenDestinationOnly(patch, ['세 시'])).toBe(patch);
  });
});
