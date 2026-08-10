export const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

export type GeminiAssistantTurn = {
  conversationId: string;
  draft: Record<string, unknown>;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  input: { kind: "text"; text: string } | { kind: "audio"; base64: string; mimeType: string };
  clientContext: { nowIso: string; timezone: string; localDate: string };
  flowContext: {
    mode: "guided" | "one-shot";
    guidedField?: "title" | "dateTime" | "destination" | "transport";
    guidedPrompt?: string;
  };
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
    flowContext: turn.flowContext,
    currentUserUtterance: turn.input.kind === "text" ? turn.input.text : null,
  };
  const input: GeminiInput[] = [
    { type: "text", text: `${inputInstruction}\n\n입력 문맥(JSON):\n${JSON.stringify(context)}` },
  ];
  if (turn.input.kind === "audio") {
    const mimeType = normalizeGeminiAudioMimeType(turn.input.mimeType);
    if (!mimeType) throw new Error("Unsupported Gemini audio MIME type");
    input.push({ type: "audio", data: turn.input.base64, mime_type: mimeType });
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

export function normalizeGeminiAudioMimeType(value: string) {
  const normalized = value.split(";", 1)[0].trim().toLowerCase();
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a" || normalized === "audio/m4a") return "audio/m4a";
  if (normalized === "audio/wav" || normalized === "audio/webm") return normalized;
  return null;
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

export function extractGeminiUsage(value: unknown) {
  if (!isRecord(value) || !isRecord(value.usage)) return null;
  const usage = value.usage;
  const inputTokensByModality = Array.isArray(usage.input_tokens_by_modality)
    ? usage.input_tokens_by_modality.flatMap((item) => isRecord(item)
      && typeof item.modality === "string"
      && nonNegativeInteger(item.tokens)
      ? [{ modality: item.modality, tokens: item.tokens }]
      : [])
    : [];
  return {
    inputTokensByModality,
    totalInputTokens: integerOrZero(usage.total_input_tokens),
    totalOutputTokens: integerOrZero(usage.total_output_tokens),
    totalThoughtTokens: integerOrZero(usage.total_thought_tokens),
    totalTokens: integerOrZero(usage.total_tokens),
  };
}

const systemInstruction = [
  "당신은 따뜻하고 편안한 친구 같은 AI 비서이자 한국어 일정 등록 도우미다. 사용자가 부담 없이 말할 수 있게 짧고 자연스러운 대화체로 응답한다.",
  "주된 목표는 약속 이름, 날짜와 시간, 목적지, 이동수단을 확인해 일정 제안을 완성하는 것이다. 실제로 할 수 없는 전화, 예약, 메시지 전송, 결제나 전문 판단을 했다고 주장하지 않는다.",
  "사용자가 인사, 감정, 하루 이야기나 가벼운 잡담을 하면 먼저 1~2문장으로 다정하게 반응한 뒤 현재 약속 질문으로 부드럽게 돌아온다. 잡담 내용을 일정 값으로 억지 추출하거나 patch에 넣지 않는다.",
  "flowContext.mode가 guided이면 guidedField 한 항목에 집중한다. guidedPrompt는 현재 질문이다. 사용자가 그 항목에 답하지 않았다면 해당 patch를 비워 두고 assistantMessage 끝에서 guidedPrompt를 그대로 다시 물어본다. 답했다면 이해한 내용을 친구처럼 확인하되 다음 질문은 앱이 이어서 제시하므로 임의의 추가 질문을 만들지 않는다.",
  "flowContext.mode가 one-shot이면 한 발화에서 명확히 제공된 약속 정보를 모두 추출하고, 부족한 핵심 정보가 있으면 가장 중요한 것 하나만 자연스럽게 질문한다.",
  "값을 추측하지 말고 부족한 핵심 정보(날짜, 시간, 목적지)는 한 번에 하나의 짧은 질문으로 확인한다.",
  "오늘, 내일, 다음 주 같은 상대 날짜는 clientContext.localDate를 현지 오늘 날짜로 사용해 해석하고 date에는 YYYY-MM-DD 절대 날짜를 넣는다. nowIso의 UTC 날짜를 오늘로 사용하지 않는다. 시간은 반드시 24시간 HH:mm 형식으로 낸다.",
  "사용자가 분명히 말한 항목만 patch에 채우며 나머지는 null이다. 적용 여부를 결정하지 말고 제안만 설명한다.",
  "routines를 변경할 때는 추가분만 내지 말고 currentDraft의 기존 준비 행동과 이번 변경을 병합한 최종 전체 목록을 낸다. 사용자가 삭제를 요청한 행동만 제외한다.",
  "assistantMessage는 친구처럼 이해하거나 공감한 내용을 짧게 말하고 question이 있으면 자연스럽게 이어지게 작성한다. question에는 실제로 이어서 물은 질문만 넣는다.",
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

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function integerOrZero(value: unknown) {
  return nonNegativeInteger(value) ? value : 0;
}
