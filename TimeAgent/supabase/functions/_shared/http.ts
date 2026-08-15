export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function upstreamError(provider: "naver" | "tmap", status: number): Response {
  const retryable = status === 429 || status >= 500;

  return jsonResponse(
    {
      error: {
        code: retryable ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_REJECTED",
        message: retryable
          ? "교통 정보를 일시적으로 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
          : "요청한 장소 또는 경로를 확인할 수 없습니다.",
        provider,
        retryable,
      },
    },
    retryable ? 503 : 502,
  );
}

