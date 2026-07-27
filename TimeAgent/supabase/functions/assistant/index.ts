import { corsHeaders, jsonResponse } from "../_shared/http.ts";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const MAX_AUDIO_BASE64 = 7_000_000;
const MAX_HISTORY = 8;

type Input = { kind: "text"; text: string } | { kind: "audio"; base64: string; mimeType: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/health")) {
    return jsonResponse({ status: "ok", openaiConfigured: Boolean(Deno.env.get("OPENAI_API_KEY")) });
  }
  if (request.method !== "POST" || !url.pathname.endsWith("/v1/schedule/turn")) {
    return errorResponse("INVALID_INPUT", "지원하지 않는 요청입니다.", false, 404);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!apiKey) return errorResponse("SERVICE_NOT_CONFIGURED", "AI 연결 설정이 필요합니다.", false, 503);

  try {
    const body: unknown = await request.json();
    if (!isRequestBody(body)) return errorResponse("INVALID_INPUT", "말하거나 입력한 내용을 확인해 주세요.", false, 400);
    const transcript = body.input.kind === "text"
      ? body.input.text.trim()
      : await transcribe(body.input, apiKey);
    if (!transcript) return errorResponse("UPSTREAM_REJECTED", "음성을 인식하지 못했습니다. 다시 말하거나 직접 입력해 주세요.", false, 422);

    const result = await completeSchedule({
      apiKey,
      conversationId: body.conversationId,
      draft: body.draft,
      history: body.history.slice(-MAX_HISTORY),
      transcript,
    });
    return jsonResponse({ transcript, ...result });
  } catch (error) {
    if (error instanceof AssistantError) {
      return errorResponse(error.code, error.message, error.retryable, error.status);
    }
    return errorResponse("SERVICE_UNAVAILABLE", "AI 일정을 일시적으로 확인하지 못했습니다.", true, 503);
  }
});

async function transcribe(input: Extract<Input, { kind: "audio" }>, apiKey: string) {
  const bytes = decodeBase64(input.base64);
  const extension = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("wav") ? "wav" : "m4a";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: input.mimeType }), `schedule.${extension}`);
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "ko");
  const response = await openAIRequest(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  }, 45_000);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.text !== "string") throw upstreamFailure(response.status);
  return payload.text.trim().slice(0, 2_000);
}

async function completeSchedule({ apiKey, conversationId, draft, history, transcript }: {
  apiKey: string;
  conversationId: string;
  draft: Record<string, unknown>;
  history: Array<{ role: "user" | "assistant"; text: string }>;
  transcript: string;
}) {
  const model = Deno.env.get("OPENAI_SCHEDULE_MODEL")?.trim() || "gpt-5.6-sol";
  const response = await openAIRequest(`${OPENAI_BASE_URL}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      safety_identifier: conversationId,
      reasoning: { effort: "low" },
      instructions: [
        "당신은 한국어 일정 등록 도우미다. 사용자의 현재 일정 초안과 최근 대화를 바탕으로 이번 말을 반영한 변경 제안을 만든다.",
        "값을 추측하지 말고 부족한 핵심 정보(날짜, 시간, 목적지)는 한 번에 하나의 짧은 질문으로 확인한다.",
        "날짜는 사용자가 말한 자연어를 한국어 표시 문자열로 보존하고 시간은 반드시 24시간 HH:mm 형식으로 낸다.",
        "사용자가 분명히 말한 항목만 patch에 채우며 나머지는 null이다. 적용 여부를 결정하지 말고 제안만 설명한다.",
        "assistantMessage는 이해한 내용을 짧게 확인하고, question이 있으면 자연스럽게 이어지게 작성한다.",
      ].join("\n"),
      input: JSON.stringify({ currentDraft: draft, recentConversation: history, currentUserUtterance: transcript }),
      text: {
        format: {
          type: "json_schema",
          name: "schedule_proposal",
          strict: true,
          schema: responseSchema,
        },
      },
    }),
  }, 45_000);
  const payload: unknown = await response.json();
  if (!response.ok) throw upstreamFailure(response.status);
  const outputText = extractOutputText(payload);
  if (!outputText) throw new AssistantError("INVALID_RESPONSE", "AI 일정 응답을 확인하지 못했습니다.", true, 502);
  try {
    return JSON.parse(outputText);
  } catch {
    throw new AssistantError("INVALID_RESPONSE", "AI 일정 응답을 확인하지 못했습니다.", true, 502);
  }
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["assistantMessage", "question", "readyToApply", "patch"],
  properties: {
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
            { type: "array", maxItems: 12, items: { type: "object", additionalProperties: false, required: ["label", "minutes"], properties: { label: { type: "string" }, minutes: { type: "integer", minimum: 1, maximum: 180 } } } },
            { type: "null" },
          ],
        },
      },
    },
  },
};

async function openAIRequest(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw upstreamFailure(response.status);
    return response;
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    throw new AssistantError("UPSTREAM_UNAVAILABLE", "AI 서비스 응답이 지연되고 있습니다. 다시 시도해 주세요.", true, 503);
  } finally {
    clearTimeout(timeout);
  }
}

function isRequestBody(value: unknown): value is { conversationId: string; draft: Record<string, unknown>; history: Array<{ role: "user" | "assistant"; text: string }>; input: Input } {
  if (!isRecord(value)
    || typeof value.conversationId !== "string"
    || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.conversationId)
    || !isRecord(value.draft)
    || !Array.isArray(value.history)
    || value.history.length > 50
    || !value.history.every((turn) => isRecord(turn) && (turn.role === "user" || turn.role === "assistant") && validText(turn.text, 1_000))
    || !isRecord(value.input)) return false;
  if (value.input.kind === "text") return validText(value.input.text, 2_000);
  return value.input.kind === "audio"
    && typeof value.input.base64 === "string"
    && value.input.base64.length > 0
    && value.input.base64.length <= MAX_AUDIO_BASE64
    && typeof value.input.mimeType === "string"
    && ["audio/mp4", "audio/m4a", "audio/webm", "audio/wav", "audio/x-m4a"].includes(value.input.mimeType);
}

function extractOutputText(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.output)) return null;
  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function decodeBase64(value: string) {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new AssistantError("INVALID_INPUT", "녹음 파일을 확인하지 못했습니다.", false, 400);
  }
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function upstreamFailure(status: number) {
  const retryable = status === 429 || status >= 500;
  return new AssistantError(retryable ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_REJECTED", retryable ? "AI 서비스를 일시적으로 사용할 수 없습니다." : "말한 내용을 AI가 처리하지 못했습니다.", retryable, retryable ? 503 : 422);
}

function errorResponse(code: string, message: string, retryable: boolean, status: number) {
  return jsonResponse({ error: { code, message, retryable } }, status);
}

class AssistantError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean, readonly status: number) {
    super(message);
  }
}
