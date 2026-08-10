# 지도·경로 연동

음성 일정 AI 연동은 [Client Secret 설정 가이드](CLIENT_SECRET_SETUP.md)의 `assistant` Edge Function 경계를 따른다. 앱은 최대 60초 오디오 또는 직접 입력 텍스트와 현재 초안·최근 8개 대화·상대 날짜 해석용 기기 시각·시간대·현지 날짜, 단계별/한 번에 모드와 현재 확인 필드만 전송한다. Android M4A MIME 변형은 Gemini 요청 전에 `audio/m4a`로 정규화한다. 서버는 Gemini Interactions API의 `gemini-3.1-flash-lite` 인라인 오디오 입력과 JSON Schema 구조화 출력을 사용해 전사문과 일정 제안을 한 요청에서 반환한다. 단계별 모드는 실제 필드 답변이 있을 때만 진행하고, 가벼운 잡담은 친구처럼 짧게 응답한 뒤 현재 일정 질문으로 복귀하며 patch에 넣지 않는다. `store: false`로 요청해 원본 오디오와 대화를 서버에 저장하거나 로그로 남기지 않는다.

운영 함수 주소는 `https://chpsoncuxjpgugowrydb.supabase.co/functions/v1/assistant`다. Gemini 전환 코드를 2026-07-28 배포하고 `GEMINI_API_KEY` 등록 후 `/health`, 한국어 텍스트, M4A 한국어 음성, JSON Schema 일정 제안 실호출을 확인했다. Android 12 `SM-N971N`에서도 음성 전사·제안 표시·명시적 적용과 KST 기준 상대 날짜를 확인했으며, 고정 평가셋의 품질·지연·비용 기준선도 기록했다.

비용 기준선용 응답 `_meta`에는 provider, model, 입력 modality별 토큰 합계, 출력·사고 토큰 합계만 포함한다. Gemini interaction ID, 원문, API 키는 포함하지 않으며 앱의 일정 응답 정규화는 이 부가 메타데이터를 무시한다. 고정 평가셋과 2026-07-28 측정 결과는 [Gemini 기준선](GEMINI_BENCHMARK.md)을 따른다.

## 확정 공급자

| 기능 | 공급자 | 책임 |
|---|---|---|
| 지도 렌더링 | NAVER Maps | 현재 위치, 출발·도착 마커, 경로 polyline 표시 |
| 장소명 검색 | TMAP POI 통합검색 | 사용자 검색어를 최대 10개의 내비게이션형 장소 후보로 정규화 |
| 주소·좌표 변환 | NAVER Maps Geocoding | 주소 입력과 지도 탭 좌표를 WGS84 좌표·도로명/지번 주소로 정규화 |
| 도보 경로 | TMAP 보행자 경로안내 | 소요 시간, 거리, 경로 geometry 계산 |

React Native 앱은 NAVER Android/iOS native map SDK를 adapter 뒤에서 사용한다. Mobile Dynamic Map 상품과 Android applicationId/iOS bundle 제한이 실제 앱 식별자와 일치해야 한다. Expo 57·RN 0.86·New Architecture와 사용할 RN bridge의 호환성을 최소 지도 빌드로 먼저 검증한다.

NAVER REST Geocoding은 Client ID와 Client Secret이 모두 필요하므로 앱에서 직접 호출하지 않는다. 서버 프록시만 인증 정보를 보유하고 앱에는 정규화된 결과만 돌려준다.

TMAP은 보행자 경로 기능을 제공한다. API 응답 데이터는 공급자 약관과 보존 제한을 준수하며 영구 원본 저장을 전제로 설계하지 않는다.

## 호출 구조

```text
React Native 앱
  ├─ NAVER Maps adapter → 지도·마커·정규화된 polyline 표시
  └─ ON:TIME mobility API
       ├─ NAVER Geocoding API → GeocodedPlace로 정규화
       ├─ NAVER Reverse Geocoding API → 지도 선택 좌표를 주소로 정규화
       ├─ TMAP POI API → 장소명 검색 결과 목록을 GeocodedPlace로 정규화
       └─ TMAP pedestrian API → RoutePlan으로 정규화
```

TMAP App Key와 NAVER Client Secret을 앱에서 직접 사용하면 번들에서 추출될 수 있으므로 서버에만 둔다. Expo에서 `EXPO_PUBLIC_` 접두사가 붙은 값은 공개 값으로 취급한다. 대화에 노출된 TMAP 키는 운영 사용 전 회전한다.

## 앱 도메인 계약

```ts
type Coordinate = {
  latitude: number;
  longitude: number;
};

type RoutePlan = {
  provider: 'tmap';
  mode: 'walk';
  origin: Coordinate;
  destination: Coordinate;
  durationSeconds: number;
  distanceMeters: number;
  path: Coordinate[];
  calculatedAt: string;
  stale: boolean;
  maneuvers: Array<{
    id: string;
    coordinate: Coordinate;
    instruction: string;
    type: string;
  }>;
};
```

UI와 일정 계산 엔진은 TMAP 원시 필드가 아니라 `RoutePlan`만 사용한다.

## 환경 변수

- `EXPO_PUBLIC_NAVER_MAP_KEY_ID`: 등록 도메인·앱으로 제한된 NAVER Maps 공개 클라이언트 식별자
- `NAVER_CLIENT_ID`: mobility 서버 전용 Geocoding 인증값
- `NAVER_CLIENT_SECRET`: mobility 서버 전용 비밀값
- `TMAP_APP_KEY`: 서버 전용 비밀값. React Native 코드에서 참조 금지
- `EXPO_PUBLIC_MOBILITY_API_BASE_URL`: 앱이 호출할 HTTPS mobility proxy 기준 URL
- `KMA_SERVICE_KEY`: weather 서버 전용 기상청 단기예보 조회서비스 Decoding 인증키
- `EXPO_PUBLIC_WEATHER_API_BASE_URL`: 앱이 호출할 HTTPS weather proxy URL

운영 proxy는 Supabase Edge Function `mobility`이며 기준 URL은 `https://chpsoncuxjpgugowrydb.supabase.co/functions/v1/mobility`이다. API endpoint는 이 주소 아래의 `/v1/places`, `/v1/geocode`, `/v1/reverse-geocode`, `/v1/routes/walk` 계약으로 제공한다. Supabase 기본 도메인과 관리형 HTTPS를 사용하므로 `timeagent.mangonw.com` DNS·인증서 설정은 현재 범위에서 필요하지 않다.

앱은 장소 검색 결과 또는 지도에서 확정한 목적지의 이름·주소·좌표를 최근 사용 순서로 기기에 최대 8개 저장한다. 동일 좌표나 같은 이름·주소는 중복 저장하지 않으며 일반 일정 등록과 음성 일정 제안이 같은 선택기를 사용한다. 장소 검색·지도 역지오코딩에 실패해도 사용자가 지도에서 누른 좌표는 `지도에서 지정한 위치`로 선택할 수 있다.

2026-07-26 서울 리전 프로젝트에 배포 후 `/health` 200, NAVER 도로명 주소 좌표 변환, TMAP 도보 시간·거리·geometry·maneuver 응답을 실호출로 확인했다.

날씨는 한국 좌표에서 weather proxy의 기상청 초단기실황·초단기예보를 우선하며, 서비스키 미설정·응답 지연·장애 시 Open-Meteo로 전환한다. 앱은 10분/750m 캐시를 적용하고 장애 시 최대 30분의 마지막 성공값을 `최근 저장된 날씨`로 표시한다. 2026-08-07 배포 시도에서 기존 Supabase 프로젝트가 `INACTIVE`로 확인되어, 프로젝트 재활성화와 `KMA_SERVICE_KEY` 등록 전까지 앱은 Open-Meteo 직접 대체 경로를 사용한다.

실제 값은 Git에 커밋하지 않는다. 개발·스테이징·운영 애플리케이션과 키를 분리한다.

구체적인 로컬 파일과 배포 환경 설정 순서는 [Client Secret 설정 가이드](CLIENT_SECRET_SETUP.md)를 따른다.

## 오류와 fallback

- NAVER 지도 로드 실패: 주소, 출발·도착, 예상 시간의 텍스트 요약 유지
- Geocoding 실패: 사용자가 주소 또는 좌표를 직접 수정
- TMAP timeout/429/5xx: 마지막 유효 경로의 확인 시각을 표시하고 재시도 제공
- 네트워크 없음: 마지막 이동 시간을 기준으로 계획하되 `교통 정보를 갱신하지 못함` 문구 표시
- 경로 미발견: 직선거리로 도보 시간을 확정하지 않고 다른 이동수단 선택 유도

## 구현 순서

1. `MapAdapter`, `GeocodingProvider`, `RouteProvider`, `LocationProvider`, `VoiceGuidePort` interface 정의
2. fixture adapter로 계산 엔진과 UI 연결 (완료)
3. ON:TIME mobility API의 NAVER Geocoding proxy와 계약 테스트 (완료)
4. ON:TIME mobility API의 TMAP 보행자 adapter와 계약 테스트 (완료)
5. NAVER native map bridge 호환성 spike, 현재 위치와 경로 polyline 연결 및 콘솔 Android 허용 패키지 `com.timeagent.app` 저장 완료
6. waypoint 음성 안내와 timeout, quota, 권한 거부, 오프라인 시나리오 테스트 (foreground 완료)

## Android NAVER Dynamic Map 인증 체크

NAVER native SDK는 APK의 manifest에서 `com.naver.maps.map.NCP_KEY_ID=xhlbrzonxu`를 읽고 초기화된다. 앱 applicationId는 `com.timeagent.app`이다. 지도 타일이 격자로 남고 logcat에 `Authorization failed: [401] Unauthorized client`가 나타나면 다음을 NAVER Cloud Maps 콘솔에서 확인한다.

1. 해당 Client ID가 속한 Application에 `Dynamic Map` API가 등록돼 있는지 확인
2. 서비스 환경의 Android 앱 패키지 이름에 `com.timeagent.app` 추가
3. 저장 후 앱을 완전히 종료·재실행하고 401 로그가 사라지는지 확인

Client Secret은 native 지도 타일 인증에 사용하지 않으며 앱에 포함하지 않는다.
