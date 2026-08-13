import {
  buildGeminiInteractionBody,
  extractGeminiOutputText,
  extractGeminiUsage,
  GEMINI_INTERACTIONS_URL,
  GeminiAssistantTurn,
  normalizeGeminiAudioMimeType,
} from "../_shared/gemini-assistant.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const MAX_AUDIO_BASE64 = 7_000_000;
const MAX_HISTORY = 8;

type Input = { kind: "text"; text: string } | { kind: "audio"; base64: string; mimeType: string };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/health")) {
    return jsonResponse({
      status: "ok",
      provider: "gemini",
      model: configuredModel(),
      geminiConfigured: Boolean(Deno.env.get("GEMINI_API_KEY")?.trim()),
    });
  }
  if (request.method !== "POST" || !url.pathname.endsWith("/v1/schedule/turn")) {
    return errorResponse("INVALID_INPUT", "지원하지 않는 요청입니다.", false, 404);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) return errorResponse("SERVICE_NOT_CONFIGURED", "Gemini AI 연결 설정이 필요합니다.", false, 503);

  try {
    const body: unknown = await request.json();
    if (!isRequestBody(body)) return errorResponse("INVALID_INPUT", "말하거나 입력한 내용을 확인해 주세요.", false, 400);

    const turn: GeminiAssistantTurn = {
      conversationId: body.conversationId,
      draft: body.draft,
      history: body.history.slice(-MAX_HISTORY),
      input: body.input,
      clientContext: body.clientContext,
      flowContext: body.flowContext,
    };
    const response = await geminiRequest(
      GEMINI_INTERACTIONS_URL,
      apiKey,
      buildGeminiInteractionBody(configuredModel(), turn),
      45_000,
    );
    const payload: unknown = await response.json();
    const outputText = extractGeminiOutputText(payload);
    if (!outputText) throw new AssistantError("UPSTREAM_REJECTED", "음성을 인식하지 못했거나 일정 응답을 만들지 못했습니다.", false, 422);

    const result = parseAssistantResult(outputText, body.input);
    return jsonResponse({
      ...result,
      _meta: {
        provider: "gemini",
        model: configuredModel(),
        usage: extractGeminiUsage(payload),
      },
    });
  } catch (error) {
    if (error instanceof AssistantError) {
      return errorResponse(error.code, error.message, error.retryable, error.status);
    }
    return errorResponse("SERVICE_UNAVAILABLE", "AI 일정을 일시적으로 확인하지 못했습니다.", true, 503);
  }
});

function configuredModel() {
  const model = Deno.env.get("GEMINI_SCHEDULE_MODEL")?.trim() || DEFAULT_GEMINI_MODEL;
  return /^[a-zA-Z0-9._-]+$/.test(model) ? model : DEFAULT_GEMINI_MODEL;
}

async function geminiRequest(url: string, apiKey: string, body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw upstreamFailure(response.status);
    return response;
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    throw new AssistantError("UPSTREAM_UNAVAILABLE", "AI 서비스 응답이 지연되고 있습니다. 다시 시도해 주세요.", true, 503);
  } finally {
    clearTimeout(timeout);
  }
}

function parseAssistantResult(outputText: string, input: Input) {
  let value: unknown;
  try {
    value = JSON.parse(outputText);
  } catch {
    throw invalidResponse();
  }
  if (!isAssistantResult(value)) throw invalidResponse();
  return {
    ...value,
    transcript: input.kind === "text" ? input.text.trim() : value.transcript.trim(),
  };
}

function isAssistantResult(value: unknown): value is Record<string, unknown> & { transcript: string } {
  return isRecord(value)
    && (value.entryType === "schedule" || value.entryType === "task")
    // An empty transcript is a valid answer: it means the audio carried no intelligible speech.
    && typeof value.transcript === "string"
    && value.transcript.length <= 2_000
    && validText(value.assistantMessage, 1_000)
    && (value.question === null || validText(value.question, 500))
    && typeof value.readyToApply === "boolean"
    && (value.clarification === null || isClarification(value.clarification))
    && (value.task === null || isTaskProposal(value.task))
    && (value.entryType !== "task" || isTaskProposal(value.task))
    && isRecord(value.patch);
}

function isTaskProposal(value: unknown) {
  return isRecord(value)
    && validText(value.title, 120)
    && Array.isArray(value.actions)
    && value.actions.length >= 1
    && value.actions.length <= 3
    && value.actions.every((action) => isRecord(action)
      && validText(action.label, 100)
      && Number.isInteger(action.estimatedMinutes)
      && Number(action.estimatedMinutes) >= 2
      && Number(action.estimatedMinutes) <= 5);
}

function isClarification(value: unknown) {
  if (!isRecord(value)
    || typeof value.field !== "string"
    || !["title", "date", "time", "destination", "transport", "recurrence", "preparation"].includes(value.field)
    || !validText(value.prompt, 300)
    || !Array.isArray(value.options)
    || value.options.length > 6) return false;
  return value.options.every((option) => validText(option, 80));
}

function invalidResponse() {
  return new AssistantError("INVALID_RESPONSE", "AI 일정 응답을 확인하지 못했습니다.", true, 502);
}

function isRequestBody(value: unknown): value is { conversationId: string; draft: Record<string, unknown>; history: Array<{ role: "user" | "assistant"; text: string }>; input: Input; clientContext: { nowIso: string; timezone: string; localDate: string }; flowContext: GeminiAssistantTurn["flowContext"] } {
  if (!isRecord(value)
    || typeof value.conversationId !== "string"
    || !/^[a-zA-Z0-9_-]{8,100}$/.test(value.conversationId)
    || !isRecord(value.draft)
    || !isClientContext(value.clientContext)
    || !isFlowContext(value.flowContext)
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
    && normalizeGeminiAudioMimeType(value.input.mimeType) !== null;
}

function isFlowContext(value: unknown): value is GeminiAssistantTurn["flowContext"] {
  if (!isRecord(value) || (value.mode !== "guided" && value.mode !== "one-shot")) return false;
  const validFields = ["title", "dateTime", "destination", "transport"];
  return (value.guidedField === undefined || (typeof value.guidedField === "string" && validFields.includes(value.guidedField)))
    && (value.guidedPrompt === undefined || validText(value.guidedPrompt, 200));
}

function isClientContext(value: unknown): value is { nowIso: string; timezone: string; localDate: string } {
  return isRecord(value)
    && typeof value.nowIso === "string"
    && Number.isFinite(Date.parse(value.nowIso))
    && typeof value.timezone === "string"
    && /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(value.timezone)
    && value.timezone.length <= 80
    && typeof value.localDate === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value.localDate)
    && Number.isFinite(Date.parse(`${value.localDate}T00:00:00Z`));
}

function validText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function upstreamFailure(status: number) {
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return new AssistantError("SERVICE_NOT_CONFIGURED", "Gemini AI 인증 또는 모델 설정을 확인해 주세요.", false, 503);
  }
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
