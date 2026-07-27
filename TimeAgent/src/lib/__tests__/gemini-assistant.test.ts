import {
  buildGeminiInteractionBody,
  extractGeminiOutputText,
  GEMINI_INTERACTIONS_URL,
} from '../../../supabase/functions/_shared/gemini-assistant';

const turn = {
  conversationId: 'device-session-1',
  draft: { title: '', date: '', appointmentTime: '' },
  history: [{ role: 'assistant' as const, text: '언제 약속인가요?' }],
  input: { kind: 'text' as const, text: '내일 오전 열 시 치과' },
  clientContext: { nowIso: '2026-07-28T01:00:00.000Z', timezone: 'Asia/Seoul' },
};

describe('Gemini assistant adapter', () => {
  it('uses the Gemini Interactions endpoint that supports M4A audio', () => {
    expect(GEMINI_INTERACTIONS_URL).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
  });

  it('builds a bounded text request with a strict JSON response schema', () => {
    const body = buildGeminiInteractionBody('gemini-3.1-flash-lite', turn);

    expect(body.model).toBe('gemini-3.1-flash-lite');
    expect(body.system_instruction).toContain('한국어 일정 등록 도우미');
    expect(body.store).toBe(false);
    expect(body.input).toHaveLength(1);
    expect(body.input[0]).toEqual(expect.objectContaining({ type: 'text', text: expect.stringContaining('내일 오전 열 시 치과') }));
    expect(body.generation_config).toMatchObject({ max_output_tokens: 2_048, thinking_level: 'minimal' });
    expect(body.response_format).toMatchObject({
      type: 'text',
      mime_type: 'application/json',
      schema: {
        required: ['transcript', 'assistantMessage', 'question', 'readyToApply', 'patch'],
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

  it('extracts structured candidate text and rejects empty responses', () => {
    expect(extractGeminiOutputText({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"transcript":"내일 치과"}' }] }],
    })).toBe('{"transcript":"내일 치과"}');
    expect(extractGeminiOutputText({ status: 'completed', steps: [] })).toBeNull();
    expect(extractGeminiOutputText({ status: 'failed', steps: [] })).toBeNull();
  });
});
