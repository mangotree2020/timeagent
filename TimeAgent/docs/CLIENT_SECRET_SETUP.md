# Client Secret 설정 가이드

## 보안 경계

- NAVER Client Secret과 TMAP App Key는 mobility 서버에만, Gemini API Key는 assistant 서버에만, 기상청 서비스키는 weather 서버에만 둔다.
- `EXPO_PUBLIC_` 접두사가 붙은 값은 앱 번들에 포함될 수 있으므로 비밀값에 사용하지 않는다.
- React Native 앱은 공개 proxy URL로 ON:TIME의 mobility·assistant·weather 서버만 호출한다.
- 실제 키는 Git, 문서, 스크린샷, 로그에 남기지 않는다.

## 로컬 개발 설정

프로젝트 루트에서 `.env.example`을 참고해 Git에 제외된 `.env.local`을 만든다.

```dotenv
# 앱에 포함 가능한 제한된 공개 식별자
EXPO_PUBLIC_NAVER_MAP_KEY_ID=발급받은_지도_Client_ID
EXPO_PUBLIC_MOBILITY_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/mobility
EXPO_PUBLIC_WEATHER_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/weather

# 아래 세 값은 서버 프로세스에서만 읽는다
NAVER_CLIENT_ID=발급받은_Geocoding_Client_ID
NAVER_CLIENT_SECRET=발급받은_Client_Secret
TMAP_APP_KEY=발급받은_TMAP_App_Key
GEMINI_API_KEY=발급받은_Gemini_API_Key
KMA_SERVICE_KEY=공공데이터포털에서_받은_Decoding_인증키
```

현재 `.gitignore`는 `.env.local`과 `.env.*`를 제외하고 `.env.example`만 추적하도록 설정돼 있다. 비밀값이 담긴 파일에 `git add -f`를 사용하지 않는다.

## NAVER Cloud 설정

1. NAVER Cloud Platform Console에서 Maps 애플리케이션을 연다.
2. 사용할 Dynamic Map과 Geocoding API를 활성화한다.
3. Android 애플리케이션 식별자에 `com.timeagent.app`을 등록한다.
4. 인증 정보의 Client ID와 Client Secret을 확인한다.
5. 지도 표시용 ID는 `EXPO_PUBLIC_NAVER_MAP_KEY_ID`, Geocoding용 ID와 Secret은 서버의 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`에 설정한다.

지도 SDK용 공개 ID와 서버 REST 인증값은 용도가 다르다. Geocoding 요청을 React Native 앱에서 직접 보내지 않는다.

## Supabase Edge Function에서 읽는 방법

배포 환경에서는 Supabase Dashboard의 **Edge Functions → Secrets** 또는 CLI로 비밀값을 등록한다.

```bash
npx supabase secrets set --env-file supabase/.env.secrets.local
npx supabase functions deploy mobility --no-verify-jwt
npx supabase functions deploy assistant --no-verify-jwt
npx supabase functions deploy weather --no-verify-jwt
```

함수에서는 `Deno.env.get('NAVER_CLIENT_SECRET')` 형태로 읽는다. 앱 코드와 `EXPO_PUBLIC_` 변수에는 비밀값을 두지 않는다.

음성 일정 도우미는 `GEMINI_API_KEY`를 Edge Function Secret으로만 읽는다. 선택적으로 `GEMINI_SCHEDULE_MODEL`을 설정할 수 있으며 기본 모델은 `gemini-3.1-flash-lite`다. Gemini가 인라인 음성 전사와 구조화된 일정 제안을 한 요청에서 처리한다. 앱에는 공개 proxy URL인 `EXPO_PUBLIC_ASSISTANT_API_BASE_URL`만 둘 수 있다. 이 값이 없으면 mobility URL의 마지막 `/mobility`를 `/assistant`로 바꿔 같은 Supabase 프로젝트를 사용한다.

배포된 endpoint는 다음과 같다.

```text
GET  {BASE_URL}/health
GET  {BASE_URL}/v1/geocode?query=...
POST {BASE_URL}/v1/routes/walk
POST {ASSISTANT_BASE_URL}/v1/schedule/turn
GET  {ASSISTANT_BASE_URL}/health
GET  {WEATHER_BASE_URL}?latitude=35.18&longitude=129.08
```

NAVER Geocoding proxy는 서버 환경 변수의 인증값을 NAVER 요청 헤더에 넣고, 앱에는 정규화된 장소 결과만 반환한다. 오류 응답이나 로그에 헤더와 키를 포함하지 않는다.

## 배포 환경 설정

Supabase Edge Function Secrets에 다음을 암호화된 비밀값으로 등록한다.

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `TMAP_APP_KEY`
- `GEMINI_API_KEY`
- `KMA_SERVICE_KEY`

선택 설정:

- `GEMINI_SCHEDULE_MODEL`: 기본값 `gemini-3.1-flash-lite`

앱 빌드 환경에는 공개 proxy URL인 `EXPO_PUBLIC_MOBILITY_API_BASE_URL`, `EXPO_PUBLIC_WEATHER_API_BASE_URL`과 필요 시 `EXPO_PUBLIC_ASSISTANT_API_BASE_URL`만 설정한다. 개발·스테이징·운영 키와 공급자 허용 범위를 각각 분리한다.

## 확인 체크리스트

- `.env.local`이 `git status`에 나타나지 않는다.
- 앱 bundle과 React Native 소스에서 `NAVER_CLIENT_SECRET`, `TMAP_APP_KEY`를 참조하지 않는다.
- proxy의 정상 응답, 인증 실패, timeout, 429, 5xx 계약 테스트가 통과한다.
- 서버 로그에 키 또는 인증 헤더가 출력되지 않는다.
- 음성 원본과 인식 문장을 앱 영구 저장소나 Edge Function 로그에 남기지 않는다.
- 대화나 로그에 노출된 키는 운영 배포 전에 재발급한다.
