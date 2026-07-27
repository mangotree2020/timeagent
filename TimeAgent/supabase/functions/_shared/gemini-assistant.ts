export const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

export type GeminiAssistantTurn = {
  conversationId: string;
  draft: Record<string, unknown>;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  input: { kind: "text"; text: string } | { kind: "audio"; base64: string; mimeType: string };
  clientContext: { nowIso: string; timezone: string };
};

type GeminiInput =
  | { type: "text"; text: string }
  | { type: "audio"; data: string; mime_type: string };

export function buildGeminiInteractionBody(model: string, turn: GeminiAssistantTurn) {
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error("Invalid Gemini model name");
  const inputInstruction = turn.input.kind === "audio"
    ? "첨부된 한국어 음성을 정확히 전사한 뒤 일정 변경 제안을 만드세요. transcript에는 전사문만 넣으세요."
    : "currentUserUtterance를 일정 변경 제안에 반영하세요. transcript에는 currentUserUtterance를 그대로 넣으세요.";
  const context = {
    conversationId: turn.conversationId,
    clientContext: turn.clientContext,
    currentDraft: turn.draft,
    recentConversation: turn.history,
    currentUserUtterance: turn.input.kind === "text" ? turn.input.text : null,
  };
  const input: GeminiInput[] = [
    { type: "text", text: `${inputInstruction}\n\n입력 문맥(JSON):\n${JSON.stringify(context)}` },
  ];
  if (turn.input.kind === "audio") {
    input.push({ type: "audio", data: turn.input.base64, mime_type: turn.input.mimeType });
  }

  return {
    model,
    input,
    system_instruction: systemInstruction,
    store: false,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: geminiResponseSchema,
    },
    generation_config: {
      max_output_tokens: 2_048,
      thinking_level: "minimal",
      thinking_summaries: "none",
    },
  };
}

export function extractGeminiOutputText(value: unknown) {
  if (!isRecord(value) || value.status !== "completed" || !Array.isArray(value.steps)) return null;
  for (let index = value.steps.length - 1; index >= 0; index -= 1) {
    const step = value.steps[index];
    if (!isRecord(step) || step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const content of step.content) {
      if (isRecord(content) && content.type === "text" && typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }
    }
  }
  return null;
}

const systemInstruction = [
  "당신은 한국어 일정 등록 도우미다. 현재 일정 초안과 최근 대화를 바탕으로 이번 입력을 반영한 변경 제안을 만든다.",
  "값을 추측하지 말고 부족한 핵심 정보(날짜, 시간, 목적지)는 한 번에 하나의 짧은 질문으로 확인한다.",
  "오늘, 내일, 다음 주 같은 상대 날짜는 clientContext의 현재 시각과 시간대를 기준으로 해석하고 date에는 YYYY-MM-DD 절대 날짜를 넣는다. 시간은 반드시 24시간 HH:mm 형식으로 낸다.",
  "사용자가 분명히 말한 항목만 patch에 채우며 나머지는 null이다. 적용 여부를 결정하지 말고 제안만 설명한다.",
  "routines를 변경할 때는 추가분만 내지 말고 currentDraft의 기존 준비 행동과 이번 변경을 병합한 최종 전체 목록을 낸다. 사용자가 삭제를 요청한 행동만 제외한다.",
  "assistantMessage는 이해한 내용을 짧게 확인하고 question이 있으면 자연스럽게 이어지게 작성한다.",
  "원본 음성이나 입력 문맥을 응답에 불필요하게 반복하지 않는다.",
].join("\n");

const nullableString = { type: ["string", "null"] };
export const geminiResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["transcript", "assistantMessage", "question", "readyToApply", "patch"],
  properties: {
    transcript: { type: "string", description: "입력 텍스트 원문 또는 첨부된 한국어 음성의 정확한 전사문" },
    assistantMessage: { type: "string" },
    question: nullableString,
    readyToApply: { type: "boolean" },
    patch: {
      type: "object",
      additionalProperties: false,
      required: ["title", "date", "appointmentTime", "destination", "destinationAddress", "transport", "priority", "routines"],
      properties: {
        title: nullableString,
        date: nullableString,
        appointmentTime: nullableString,
        destination: nullableString,
        destinationAddress: nullableString,
        transport: { anyOf: [{ type: "string", enum: ["AI 추천", "도보", "버스", "지하철", "자가용", "택시"] }, { type: "null" }] },
        priority: { anyOf: [{ type: "string", enum: ["on-time", "cost"] }, { type: "null" }] },
        routines: {
          anyOf: [
            {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "minutes"],
                properties: {
                  label: { type: "string" },
                  minutes: { type: "integer", minimum: 1, maximum: 180 },
                },
              },
            },
            { type: "null" },
          ],
        },
      },
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
