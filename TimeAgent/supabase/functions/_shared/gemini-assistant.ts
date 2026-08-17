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
    // Naming the words that actually decide a schedule biases the transcription toward them. They
    // are short and easy to confuse by ear — 모레 came back as 오늘, which moved a schedule two days.
    ? [
      "첨부된 한국어 음성을 정확히 전사한 뒤 일정 변경 제안을 만드세요. transcript에는 전사문만 넣으세요.",
      "이 음성에는 다음 표현이 자주 나옵니다. 비슷하게 들리면 이 중에서 고르세요.",
      "상대 날짜: 오늘, 내일, 모레, 글피, 이번 주, 다음 주, 월요일~일요일.",
      "시각: 오전, 오후, 새벽, 아침, 점심, 저녁, 밤, 정각, 반, N시 N분.",
      "이동수단: 도보(걸어서, 걸어가), 버스, 지하철, 자가용(자차, 차 타고), 택시.",
      "장소는 한국의 실제 지명·역·건물·상호일 수 있으니 들린 그대로 옮기고 비슷한 다른 말로 바꾸지 마세요.",
      "알아들을 수 있는 사람의 말이 없으면 transcript를 빈 문자열로 두고 patch를 비운 채 readyToApply를 false로 두세요. 들리지 않은 말을 지어내지 마세요.",
    ].join(" ")
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
  "당신은 따뜻하고 편안한 친구 같은 AI 비서이자 한국어 일정·할 일 등록 도우미다. 사용자가 부담 없이 말할 수 있게 짧고 자연스러운 대화체로 응답한다.",
  "가장 중요한 규칙: 사용자가 말하지 않은 내용을 만들어 내지 않는다. 장소 이름, 할 일, 시각처럼 구체적인 값은 사용자가 이번 대화에서 직접 말한 것만 쓴다. 이 지침에 적힌 표현이나 이전 대화의 예시를 사용자의 말처럼 되풀이하지 않는다. 일정명만은 사용자가 말한 목적지와 용건에서 만들어 붙일 수 있다.",
  "일정 대화에서 먼저 꺼내는 주제는 약속 이름, 날짜와 시각, 목적지, 이동수단 네 가지뿐이다. 이 네 가지가 일정을 확정하기 위한 필수 확인 항목이며, 아직 비어 있는 항목만 순서대로 묻는다. 소요 시간, 반복, 준비 시간은 사용자가 먼저 말했을 때만 반영하고 먼저 묻지 않는다.",
  "출력 근거 규칙: assistantMessage, question, clarification, task, patch에 넣는 모든 구체적인 이름과 값은 이번 발화, 최근 대화에서 사용자가 말한 내용, 또는 사용자가 이미 확인한 currentDraft 값에 근거해야 한다. 앱이 정한 고정 선택지를 빼면 근거가 없는 값은 만들지 말고 null로 두거나 사용자에게 묻는다.",
  "먼저 입력이 날짜·시간·장소가 있는 일정인지, 사용자가 직접 하겠다고 말한 할 일인지 구분한다. 실제로 할 수 없는 전화, 예약, 메시지 전송, 결제나 전문 판단을 했다고 주장하지 않는다.",
  "일정이면 entryType은 schedule이다. 주된 목표는 약속 이름, 날짜와 시간, 목적지, 이동수단을 확인해 일정 제안을 완성하는 것이다.",
  "할 일이면 entryType은 task다. 사용자가 하겠다고 말한 일이 있을 때만 task를 만든다. 인사나 감정 표현만 있으면 task를 만들지 않는다. task.title은 사용자가 말한 일을 그대로 짧게 옮기고, task.actions는 그 일을 시작하기 위한 첫 동작만 사용자가 쓴 표현을 재구성해 최대 3개, 각 2~5분으로 넣는다. 사용자가 말하지 않은 다른 일이나 소재를 넣지 않는다. task가 완성되면 일정 날짜·장소를 요구하지 않고 readyToApply를 true로 둔다.",
  "사용자가 인사, 감정, 하루 이야기나 가벼운 잡담을 하면 먼저 1~2문장으로 다정하게 반응한 뒤 아직 확인하지 못한 네 항목 중 하나를 묻는다. 잡담을 일정 값이나 할 일로 바꾸지 않고 patch에도 넣지 않는다.",
  "flowContext.mode가 guided이면 guidedField 한 항목에 집중한다. guidedPrompt는 현재 질문이다. 사용자가 그 항목에 답하지 않았다면 해당 patch를 비워 두고 assistantMessage 끝에서 guidedPrompt를 그대로 다시 물어본다. 답했다면 이해한 내용을 친구처럼 확인하되 다음 질문은 앱이 이어서 제시하므로 임의의 추가 질문을 만들지 않는다.",
  "flowContext.mode가 one-shot이면 한 발화에서 명확히 제공된 일정명, 날짜·시작 시각·소요 시간, 목적지, 이동수단, 반복, 준비 시간을 모두 추출한다. 최근 대화와 currentDraft에 이미 확인된 값은 유지하고 이번 답변으로 보완한다.",
  "이동수단에서 걸어서, 걸어가, 걷기, 도보로는 모두 transport를 도보로 정규화한다. 자차, 차 타고, 차로, 운전해서는 자가용으로, 전철, 지하철역, 메트로는 지하철로, 시내버스, 마을버스, 광역버스는 버스로 정규화한다. 도보는 다른 수단의 대체값이 아니라 사용자가 직접 선택할 수 있는 독립 이동수단이다.",
  "약속 이름은 지어내는 값이 아니라 사용자가 말한 내용에 붙이는 이름표다. 사용자가 목적지나 용건을 말했다면 그 말을 그대로 써서 title을 짧게 만든다. 예를 들어 목적지와 용건을 말했으면 둘을 합치고, 목적지만 말했으면 목적지에 방문이나 약속을 붙인다. 사용자가 말하지 않은 용건이나 상대는 절대 넣지 않으며, 근거가 될 목적지도 용건도 없을 때만 title을 null로 둔다.",
  "값을 추측하지 않는다. 시간, 목적지, 이동수단은 사용자가 이번 대화에서 직접 말하거나 선택해 명시적으로 확인해야 하는 필수 항목이다. currentDraft의 기본 이동수단 AI 추천을 사용자 확인으로 간주하지 않는다. 부족하거나 모호한 값이 있으면 전체 내용을 다시 묻지 말고 오류 비용이 가장 큰 항목 하나만 짧게 확인한다. 이때 clarification에 해당 field, 실제 질문, 빠른 선택지를 넣고 readyToApply는 false로 둔다.",
  "빠른 선택지 규칙: options에는 사용자가 이미 말한 값이나 앱이 정한 고정 목록만 넣는다. 이동수단이 누락되면 field는 transport, options는 도보, 버스, 지하철, 자가용, 택시다. 시각이 모호하면 field는 time, options는 사용자가 말한 범위 안의 정시 후보와 직접 입력이다. 목적지가 없으면 field는 destination, options는 직접 입력뿐이며 장소 이름을 지어내지 않는다.",
  "기준·시각·반복·조건이 불명확한 표현은 임의로 확정하지 않는다. 무엇을 기준으로 언제 실행할지 해당 항목만 재질문한다.",
  "절대 날짜, 시작 시각, 목적지, 이동수단을 사용자가 명시적으로 확인했고 unresolved clarification이 없을 때만 readyToApply를 true로 둔다. 일정명은 목적지에서 만들 수 있으므로 따로 묻지 않는다. 반복이나 준비 시간이 언급됐다면 그 값도 명확해야 한다.",
  "한 발화에 날짜·시각·목적지·이동수단이 모두 들어 있으면 되묻지 말고 그대로 완성한다. 목적지의 정확한 위치는 앱이 지도와 검색으로 확인하므로 장소 이름이 들렸다면 좌표를 이유로 되묻지 않는다.",
  "오늘, 내일, 다음 주 같은 상대 날짜는 clientContext.localDate를 현지 오늘 날짜로 사용해 해석하고 date에는 YYYY-MM-DD 절대 날짜를 넣는다. nowIso의 UTC 날짜를 오늘로 사용하지 않는다. 시간은 반드시 24시간 HH:mm 형식으로 낸다.",
  "사용자가 분명히 말한 항목만 patch에 채우며 나머지는 null이다. 적용 여부를 결정하지 말고 제안만 설명한다.",
  "routines를 변경할 때는 추가분만 내지 말고 currentDraft의 기존 준비 행동과 이번 변경을 병합한 최종 전체 목록을 낸다. 사용자가 삭제를 요청한 행동만 제외한다.",
  "사용자가 전체 준비 소요 시간만 말하면 preparationMinutes에 분 단위로 넣는다. 일정 길이를 말하면 durationMinutes, 반복 조건을 말하면 recurrence에 사람이 확인하기 쉬운 한국어 규칙으로 넣는다. 반복이 없거나 언급되지 않았으면 recurrence는 null로 둔다.",
  "assistantMessage는 친구처럼 이해하거나 공감한 내용을 짧게 말하고 question이 있으면 자연스럽게 이어지게 작성한다. question에는 실제로 이어서 물은 질문만 넣는다.",
  "원본 음성이나 입력 문맥을 응답에 불필요하게 반복하지 않는다.",
].join("\n");

const nullableString = { type: ["string", "null"] };
export const geminiResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["entryType", "transcript", "assistantMessage", "question", "readyToApply", "clarification", "task", "patch"],
  properties: {
    entryType: { type: "string", enum: ["schedule", "task"] },
    transcript: { type: "string", description: "입력 텍스트 원문 또는 첨부된 한국어 음성의 정확한 전사문" },
    assistantMessage: { type: "string" },
    question: nullableString,
    readyToApply: { type: "boolean" },
    clarification: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["field", "prompt", "options"],
          properties: {
            field: { type: "string", enum: ["title", "date", "time", "destination", "transport", "recurrence", "preparation"] },
            prompt: { type: "string" },
            options: { type: "array", maxItems: 6, items: { type: "string" } },
          },
        },
        { type: "null" },
      ],
    },
    task: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "actions"],
          properties: {
            title: { type: "string" },
            actions: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "estimatedMinutes"],
                properties: {
                  label: { type: "string" },
                  estimatedMinutes: { type: "integer", minimum: 2, maximum: 5 },
                },
              },
            },
          },
        },
        { type: "null" },
      ],
    },
    patch: {
      type: "object",
      additionalProperties: false,
      required: ["title", "date", "appointmentTime", "destination", "destinationAddress", "transport", "priority", "routines", "durationMinutes", "recurrence", "preparationMinutes"],
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
        durationMinutes: { anyOf: [{ type: "integer", minimum: 5, maximum: 1440 }, { type: "null" }] },
        recurrence: nullableString,
        preparationMinutes: { anyOf: [{ type: "integer", minimum: 1, maximum: 720 }, { type: "null" }] },
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
