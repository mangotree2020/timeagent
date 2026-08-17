import {
  buildGeminiInteractionBody,
  extractGeminiOutputText,
  extractGeminiUsage,
  withoutRedundantClarification,
  GEMINI_INTERACTIONS_URL,
} from '../../../supabase/functions/_shared/gemini-assistant';

const turn = {
  conversationId: 'device-session-1',
  draft: { title: '', date: '', appointmentTime: '' },
  history: [{ role: 'assistant' as const, text: '언제 약속인가요?' }],
  input: { kind: 'text' as const, text: '내일 오전 열 시 치과' },
  clientContext: { nowIso: '2026-07-28T01:00:00.000Z', timezone: 'Asia/Seoul', localDate: '2026-07-28' },
  flowContext: { mode: 'guided' as const, guidedField: 'dateTime' as const, guidedPrompt: '좋아. 언제 만나?' },
};

describe('Gemini assistant adapter', () => {
  it('uses the Gemini Interactions endpoint that supports M4A audio', () => {
    expect(GEMINI_INTERACTIONS_URL).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
  });

  it('builds a bounded text request with a strict JSON response schema', () => {
    const body = buildGeminiInteractionBody('gemini-3.1-flash-lite', turn);

    expect(body.model).toBe('gemini-3.1-flash-lite');
    expect(body.system_instruction).toContain('한국어 일정·할 일 등록 도우미');
    expect(body.system_instruction).toContain('친구 같은 AI 비서');
    expect(body.system_instruction).toContain('가벼운 잡담');
    expect(body.system_instruction).toContain('모호한 값');
    expect(body.system_instruction).toContain('일정인지');
    expect(body.system_instruction).toContain('할 일인지');
    expect(body.system_instruction).toContain('2~5분');
    expect(body.system_instruction).toContain('걸어서');
    expect(body.store).toBe(false);
    expect(body.input).toHaveLength(1);
    expect(body.input[0]).toEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('내일 오전 열 시 치과') }));
    expect(body.input[0]).toEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('guidedPrompt') }));
    expect(body.generation_config).toMatchObject({ max_output_tokens: 2_048, thinking_level: 'minimal' });
    expect(body.response_format).toMatchObject({
      type: 'text',
      mime_type: 'application/json',
      schema: {
        required: ['entryType', 'transcript', 'assistantMessage', 'question', 'readyToApply', 'clarification', 'task', 'patch'],
      },
    });
  });

  it('sends audio inline in the same structured schedule request', () => {
    const body = buildGeminiInteractionBody('gemini-3.1-flash-lite', {
      ...turn,
      input: { kind: 'audio', base64: 'AAECAw==', mimeType: 'audio/m4a' },
    });

    expect(body.input).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('첨부된 한국어 음성을 정확히 전사') }),
      { type: 'audio', data: 'AAECAw==', mime_type: 'audio/m4a' },
    ]);
  });

  it('normalizes Android M4A aliases for Gemini audio input', () => {
    const body = buildGeminiInteractionBody('gemini-3.1-flash-lite', {
      ...turn,
      input: { kind: 'audio', base64: 'AAECAw==', mimeType: 'audio/mp4; codecs=mp4a.40.2' },
    });

    expect(body.input[1]).toEqual({ type: 'audio', data: 'AAECAw==', mime_type: 'audio/m4a' });
  });

  it('extracts structured candidate text and rejects empty responses', () => {
    expect(extractGeminiOutputText({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"transcript":"내일 치과"}' }] }],
    })).toBe('{"transcript":"내일 치과"}');
    expect(extractGeminiOutputText({ status: 'completed', steps: [] })).toBeNull();
    expect(extractGeminiOutputText({ status: 'failed', steps: [] })).toBeNull();
  });

  it('extracts only non-sensitive token usage needed for cost measurement', () => {
    expect(extractGeminiUsage({
      id: 'must-not-leak',
      usage: {
        input_tokens_by_modality: [{ modality: 'text', tokens: 320 }, { modality: 'audio', tokens: 125 }],
        total_input_tokens: 445,
        total_output_tokens: 90,
        total_thought_tokens: 12,
        total_tokens: 547,
      },
    })).toEqual({
      inputTokensByModality: [{ modality: 'text', tokens: 320 }, { modality: 'audio', tokens: 125 }],
      totalInputTokens: 445,
      totalOutputTokens: 90,
      totalThoughtTokens: 12,
      totalTokens: 547,
    });
    expect(extractGeminiUsage({ usage: { total_input_tokens: -1 } })).toEqual({
      inputTokensByModality: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThoughtTokens: 0,
      totalTokens: 0,
    });
  });

  it('keeps borrowable example content out of the instruction so it cannot leak into a reply', () => {
    const instruction = buildGeminiInteractionBody('gemini-3.1-flash-lite', turn).system_instruction;

    // Concrete nouns in the prompt came back in real conversations that never mentioned them.
    for (const leak of ['치과', '강남역', '홍대', '보고서 작성', '운동']) {
      expect(instruction).not.toContain(leak);
    }
  });

  it('limits the schedule conversation to the four fields it has to fill', () => {
    const instruction = buildGeminiInteractionBody('gemini-3.1-flash-lite', turn).system_instruction;

    expect(instruction).toContain('약속 이름');
    expect(instruction).toContain('이동수단');
    expect(instruction).toContain('네 가지');
    expect(instruction).toContain('사용자가 말하지 않은');
    expect(instruction).toContain('빠른 선택지');
  });
});

describe('withoutRedundantClarification', () => {
  const reply = (clarificationField: string, patch: Record<string, unknown>) => ({
    entryType: 'schedule',
    transcript: '내일 오후 3시에 부산역에서 지하철 타고 갈 거야',
    assistantMessage: '확인했어요.',
    question: null,
    readyToApply: false,
    clarification: { field: clarificationField, prompt: '확인해 주세요', options: ['직접 입력'] },
    task: null,
    patch,
  });

  it('drops a question about something the same answer already filled in', () => {
    const asked = reply('destination', { destination: '부산역', appointmentTime: '15:00' });
    expect(withoutRedundantClarification(asked).clarification).toBeNull();

    const time = reply('time', { appointmentTime: '15:00' });
    expect(withoutRedundantClarification(time).clarification).toBeNull();
  });

  it('keeps a question about something genuinely missing', () => {
    const asked = reply('transport', { destination: '부산역', appointmentTime: '15:00' });
    expect(withoutRedundantClarification(asked).clarification).toEqual(asked.clarification);
  });

  it('still asks how to get there when only the draft default came back', () => {
    const asked = reply('transport', { destination: '부산역', transport: 'AI 추천' });
    expect(withoutRedundantClarification(asked).clarification).toEqual(asked.clarification);

    const chosen = reply('transport', { destination: '부산역', transport: '지하철' });
    expect(withoutRedundantClarification(chosen).clarification).toBeNull();
  });

  it('leaves a reply with nothing to drop exactly as it was', () => {
    const none = { ...reply('time', {}), clarification: null };
    expect(withoutRedundantClarification(none)).toBe(none);
    const blank = reply('destination', { destination: '   ' });
    expect(withoutRedundantClarification(blank).clarification).toEqual(blank.clarification);
  });
});

describe('what the instruction must keep saying', () => {
  const instruction = () => buildGeminiInteractionBody('gemini-3.1-flash-lite', turn).system_instruction;

  it('keeps a spoken purpose out of the destination', () => {
    // "동창 모임 있어" with no place named put 동창 모임 in the destination, which no map can find.
    expect(instruction()).toContain('지도에서 찾을 수 있는 장소만');
    expect(instruction()).toContain('destination은 null');
  });

  it('refuses to substitute a mode nobody offered', () => {
    // 따릉이 was being answered as 도보, which quietly changes the travel time.
    expect(instruction()).toContain('목록에 없는 수단');
    expect(instruction()).toContain('자전거');
  });

  it('still names the appointment from what was actually said', () => {
    expect(instruction()).toContain('약속 이름은 지어내는 값이 아니라');
    expect(instruction()).toContain('말하지 않은 용건이나 상대는 절대 넣지 않으며');
  });

  it('keeps the spoken transport wordings it has to recognise', () => {
    for (const wording of ['차 끌고', '자차', '전철', '마을버스', '택시 잡아서', '걸어서']) {
      expect(instruction()).toContain(wording);
    }
  });
});
