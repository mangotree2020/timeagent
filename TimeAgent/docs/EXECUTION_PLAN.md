# 실행 계획

## P0 - 핵심 가치

- [x] Expo Router + TypeScript 프로젝트 생성
  - Expo SDK 57, React Native 0.86, Node v24 LTS에서 생성함.
- [x] Timeline Coach 디자인 토큰과 공통 컴포넌트
  - `Screen`, `Card`, `Button`, `StatusPill`, `Timeline`, `BottomNav` 구현.
- [x] 홈 → 등록 → 계획 → 진행 → 플랜 B → 완료 UI 세로 슬라이스
  - 고정 fixture로 탐색과 핵심 상호작용 구현.
- [x] Typecheck/Lint/Jest 기본 하네스
  - `npm run verify` 제공, 시간 계산 테스트 포함.
- [x] 실제 일정 입력 모델과 자동 저장
  - Given 일정 등록 중, When 입력값이나 현재 단계가 바뀌면, Then AsyncStorage에 자동 저장하고 앱 재실행 시 같은 값과 단계로 복원한다.
  - Given AI 계획 생성을 완료함, When 앱을 종료하고 새 일정을 열면, Then 완료된 임시 작성본은 복원되지 않고 새 작성본으로 시작한다.
  - 일정명·날짜·시간·목적지·주소·이동수단·도착 우선순위·준비 행동 시간을 실제 상태로 연결했다.
  - 저장 중/완료/실패 상태를 색상 외 문구로 제공한다.
- [x] 준비/이동 시간 계산 엔진
  - Given 약속 시각과 준비 행동, 이동수단, 우선순위가 있음, When 계획을 생성하면, Then 준비 시작·출발·도착 시각을 역산하고 입력 기반 타임라인을 만든다.
  - Given 준비 시작 시각이 지남, When 아직 약속 전 도착 가능하면, Then 지금 시작 기준으로 남은 계획과 여유 시간을 다시 계산한다.
  - Given 정시 도착이 불가능함, When 계획을 확인하면, Then 지금 시작 기준 예상 도착과 지각 시간을 함께 표시하고 플랜 B를 안내한다.
  - 자정을 넘는 계획과 잘못된 시각 형식을 처리한다.
- [x] 진행 세션 영속화와 앱 복귀 보정
  - Given 진행 중인 일정이 있음, When 앱을 종료하고 다시 열면, Then 현재 단계·계획·경로·지연 상태를 복원한다.
  - Given 앱이 백그라운드 또는 종료 상태에 있었음, When 복귀하면, Then 단계 시작 시각과 현재 시각의 차이만큼 카운트다운을 보정한다.
  - Given 단계 예정 시간이 모두 지남, When 복귀하면, Then 00:00과 확인 문구를 표시하되 사용자 확인 없이 다음 단계로 넘기지 않는다.
  - Given 일정을 완료하고 홈으로 이동함, When 저장소를 확인하면, Then 진행 세션을 삭제한다.
- [x] UI 미작동 버튼·탭 전수 점검과 기능 연결
  - Given 일정 화면을 열었음, When `예정` 또는 `완료` 탭을 누르면, Then 선택 상태와 해당 일정 목록이 함께 바뀐다.
  - Given 준비 행동 등록 단계임, When 새 행동 이름을 입력하고 추가하면, Then 5분 기본값의 행동이 목록과 자동 저장 작성본에 반영된다.
  - Given 플랜 B 화면임, When 정시·비용·걷기 기준을 누르면, Then 실제 대안 순서가 선택 기준에 맞게 바뀐다.
  - Given 설정 화면임, When 출발 위치·이동수단·여유 시간·루틴·코치 말투·토글을 변경하면, Then 화면과 AsyncStorage 설정값이 함께 갱신된다.
  - Given 새 일정 버튼을 눌렀음, When 이전 임시 작성본이 저장돼 있어도, Then 새 1단계 작성본이 저장본 복원보다 우선한다.
  - Given 진행의 마지막 단계를 완료함, When 진행 세션이 완료 상태가 되면, Then 별도 데모 버튼 없이 완료 화면으로 이동한다.
- [x] 지연 전후 비교 확인 시트와 적용/거절
  - Given 진행 중 `시간 더 필요`에서 추가 시간을 선택함, When 확인 시트가 열리면, Then 준비 총시간·출발·예상 도착의 변경 전후와 변경 이유를 함께 표시한다.
  - Given 변경 제안을 확인 중임, When 아직 적용하지 않았거나 기존 계획 유지를 누르면, Then 진행 세션과 AsyncStorage의 지연값을 변경하지 않는다.
  - Given 변경 제안을 확인 중임, When `변경안 적용`을 누르면, Then 추가 지연을 진행 세션에 반영하고 변경된 도착 시간과 해결 배너를 표시한다.
  - Given 적용한 지연이 저장됨, When 앱을 종료하고 다시 열면, Then 적용된 지연값과 예상 도착 시간을 복원한다.

## P1 - 네이티브 핵심

- [x] 새 일정 음성 AI 도우미
  - Given 새 일정 등록을 시작함, When `음성으로 일정 만들기`를 누르면, Then 운영체제 마이크 팝업보다 먼저 음성을 사용하는 이유와 직접 입력 대체 경로를 보여준다.
  - Given 마이크를 허용함, When 최대 60초의 약속 내용을 말하고 녹음을 마치면, Then 인식한 문장·AI 확인 문장·부족한 정보 질문·현재 일정 변경 제안을 텍스트로 함께 보여주고 화면 읽기를 사용하지 않을 때만 확인 문장을 음성으로 읽는다.
  - Given AI가 일정 변경을 제안함, When 사용자가 `이 일정에 적용`을 누르기 전이거나 제안을 거절하면, Then 자동 저장 초안은 바뀌지 않는다.
  - Given 사용자가 변경 제안을 적용함, When 일정 등록 화면으로 돌아오면, Then 일정명·날짜·시간·목적지·이동수단·준비 행동 변경이 초안에 병합되고 목적지가 달라졌다면 기존 좌표를 초기화한다.
  - Given 일정 정보가 부족함, When AI 질문에 음성 또는 텍스트로 답하면, Then 직전 제안을 포함한 제한된 대화 문맥으로 제안을 보완하며 사용자가 적용하기 전에는 초안을 변경하지 않는다.
  - Given 마이크를 거부했거나 네트워크·서버 오류가 발생함, When 음성 흐름을 계속함, Then 직접 입력·재시도·수동 등록 복귀 중 가능한 다음 행동과 현재 초안 유지 상태를 표시한다.
  - Given 화면 읽기가 활성 또는 확인 중임, When AI 답변이 도착함, Then 앱 자체 TTS를 재생하지 않고 상태 변화와 질문을 접근성 라이브 영역으로 전달한다.
  - Given 녹음 요청을 처리함, When 응답 또는 오류가 끝나면, Then 원본 오디오는 앱 저장소와 서버에 보관하지 않고 Gemini 키는 Supabase Edge Function 비밀값으로만 사용한다.
- [ ] Gemini Flash-Lite 운영 검증과 비용 기준선
  - Given `GEMINI_API_KEY`를 등록하고 `gemini-3.1-flash-lite` 왕복이 동작함, When 고정 한국어 일정 평가셋을 실행하면, Then 필드 정확도·구조화 응답 성공률·p50/p95 지연·요청당 비용을 기준선으로 기록한다.
  - Given 텍스트 또는 최대 60초 음성을 보냄, When Gemini 응답이 도착하면, Then 전사문과 JSON Schema 일정 제안이 한 호출에서 반환되고 앱의 기존 응답 계약을 통과한다.
  - Given 운영 결과를 평가함, When 날짜·시각·시간대·반복·목적지·이동수단·준비 행동의 중요 필드 회귀가 발견되면, Then 자동 적용하지 않고 직접 입력·재시도·수동 등록 fallback을 유지하며 모델 또는 공급자 재선정을 검토한다.
  - 벤치마크는 실제 사용자 녹음을 다른 공급자에 복제하지 않고 합성·사전 동의된 고정 fixture만 사용한다. Gemini 키는 Supabase Edge Function Secrets에만 저장하고 앱 번들·로그·저장소에 포함하지 않는다.
- [x] 지도·도보 경로 공급자 결정
  - 지도/좌표: NAVER Maps, 도보 경로: TMAP API.
- [x] 위치/알림 권한 사전 설명과 거부 상태
  - Given 권한을 아직 요청하지 않음, When 권한 화면을 열면, Then 운영체제 팝업보다 먼저 위치·알림의 사용 이유와 거부 시 대체 경로를 표시한다.
  - Given 위치 권한을 거부함, When 권한 결과가 돌아오면, Then 재요청 가능 여부를 텍스트로 표시하고 수동 출발지 입력·저장을 제공한다.
  - Given 위치 권한을 더 이상 요청할 수 없음, When 권한 화면을 열면, Then 기기 설정 이동 버튼과 수동 출발지 경로를 함께 제공한다.
  - Given 알림 권한을 거부하거나 앱 알림을 끔, When 앱을 계속 사용하면, Then 현재 행동·남은 시간·변경 출발 시점을 앱 내 진행 화면에서 확인할 수 있음을 안내한다.
  - Given 설정 화면으로 돌아옴, When 운영체제 권한이나 앱 알림 설정이 바뀌었으면, Then 실제 권한 상태와 앱 알림 사용 여부를 다시 조회해 표시한다.
- [x] 로컬 알림 예약, 완료/변경 시 취소
  - 순수 알림 계획, 예약 ID 저장·v1 마이그레이션, 시작·단계 완료·지연·경로 변경 재예약, 완료·초기화 취소 구현 완료.
  - 지연 적용 시 현재 단계 카운트다운이 늘어나지 않던 결함 수정.
  - 자동 검증과 세 기준 웹 화면, Android 12 실기기의 예약·재예약·완료 취소를 통과함.
- [x] Journey 도메인·fixture adapter와 이동 상태
  - `RoutePlan`, 현재 위치, provider port, ETA·남은 거리·약속 여유 상태 계약을 UI와 분리.
  - 위치 갱신, 30초 이상 GPS stale, 오프라인·권한 거부 시 마지막 경로/다음 행동 유지 구현.
  - fixture provider와 단위 테스트 6개 추가, `npm run verify` 35/35 통과.
- [x] NAVER Maps 지도 adapter
  - `@mj-studio/react-native-naver-map` 2.9.0과 NAVER Maven 저장소를 Expo config plugin으로 연결하고 ARM64 APK 빌드·설치 완료.
  - 현위치 overlay, 목적지 marker, TMAP polyline, 전체 경로 camera 범위를 Android 실기기에서 확인.
  - NAVER Cloud Maps `TimeAgent`의 Client ID·Dynamic Map 활성화를 확인하고 Android 패키지 `com.ontime.app`을 등록.
  - Android 12 `SM-N971N`에서 401 오류 해소와 실제 NAVER 타일·현위치·TMAP 경로선 표시를 확인.
- [x] NAVER Geocoding Supabase Edge Function proxy
  - 서울 리전 `timeagent` 프로젝트와 `mobility/v1/geocode` 배포 완료.
  - NAVER 비밀키는 Edge Function Secrets에만 저장하고 도로명 주소 실호출로 좌표 응답 확인.
- [x] TMAP 도보 경로 Supabase Edge Function proxy
  - `mobility/v1/routes/walk`이 시간·거리·polyline·maneuver를 `RoutePlan`으로 정규화.
  - 서울시청 인근 실호출에서 246m·209초 경로와 안내 지점 응답 확인.
- [x] NAVER Geocoding·TMAP 도보 앱 adapter 연결
  - Supabase `mobility` endpoint를 `GeocodingProvider`·`RouteProvider`로 구현하고 응답 런타임 검증, 10초 timeout, offline·retryable 오류 계약 추가.
  - 일정 등록에 목적지 주소 확인·검색 결과 선택·좌표 자동 저장·직접 입력 fallback 연결.
  - Android `SM-N971N`에서 부산진구 주소 검색→삼정타워 결과→선택→주소 자동 저장과 앱 재실행 복원을 확인.
  - `npm run verify` typecheck/lint/Jest 40/40 통과.
- [x] 현재 위치·경로·ETA·거리 Journey 지도 화면
  - Expo Location 현위치와 Supabase→TMAP 실제 도보 경로를 연결하고 ETA·약속까지 시간·거리·다음 maneuver를 표시.
  - 15초 foreground 위치 갱신, 장거리 km 표시, GPS 정확도 원 상한, 전체 경로 지도 여백 적용.
- [x] 교통수단 비교 계약과 실제/추정 라벨
  - TMAP에서 반환한 polyline 기반 도보안은 `TMAP 실제 경로`, 실시간 공급자 조회 전 대중교통·택시 값은 `예상값`으로 출처를 구분한다.
  - 모든 안에 예상 소요 시간·거리·비용·도보·환승·도착 상태를 표시하고, 실제 경로 갱신 실패 중에도 예상 대안 비교를 유지한다.
  - 경로 변경은 현재/변경 수단, 예상 도착, 시간·거리, 데이터 근거를 확인한 뒤 `이 경로 적용`을 눌러야만 진행 세션과 알림에 반영한다.
  - 진행 세션이 아직 없는 딥링크 진입에서도 적용 시 세션을 생성·저장해 앱 재실행 후 선택 경로를 복원한다.
- [x] 포그라운드 waypoint 음성 안내
  - 새로운 TMAP maneuver마다 다음 행동·남은 시간·남은 거리를 한국어 TTS로 안내하고 같은 지점 중복 발화를 방지.
  - 화면에서 음성 켜기/끄기와 접근성 레이블을 제공.
- [x] 백그라운드 복귀와 네트워크 오류 fallback
  - 앱 active 복귀 시 현위치·경로를 재조회하고 timeout/offline/권한 거부/서버 오류에서 마지막 위치와 직선 임시 경로·텍스트 안내·재시도를 유지.
- [x] 백그라운드 위치·음성 기술 검증
  - `expo-task-manager`와 Android 위치 foreground service를 연결하고 사용자 명시 활성화, 25m/15초 갱신, 새 maneuver 1회 음성, TTS 실패 시 OS 알림 fallback을 구현.
  - 백그라운드 세션은 기기 AsyncStorage에만 저장하며 사용자가 끄거나 목적지 30m 이내 도착 시 위치 task와 저장값을 함께 제거.
  - Android Manifest의 `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`과 ARM64 APK 빌드·설치 확인.
  - 연결 폰에서 `항상 허용=true`, foreground task service, 15초 고정밀 위치 요청, TMAP 세션과 음성 전달 `spoken`을 확인.
  - Android 12 `SM-N971N`에서 화면을 끈 20초 동안 foreground 위치 서비스와 task가 유지되고, 잠금 해제 후 `화면 꺼짐 안내 끄기`를 실행하면 UI가 `꺼짐`으로 복귀하며 foreground 알림, TaskManager 등록, `@on-time/background-journey` AsyncStorage 키가 모두 제거됨을 확인.
  - Journey 화면에 남은 위치 서비스 바인딩은 `startRequested=false`이며 foreground 상태가 아니고, JobScheduler의 백그라운드 작업도 모두 완료·비활성 상태임을 확인.
- [x] 온보딩 3장과 비회원 첫 일정 흐름
  - 로그인 없이 시간 역산·지연 재계획·지도/음성 가치를 설명하는 3장 온보딩 구현.
  - 다음·이전·건너뛰기와 `첫 일정 만들기`를 실제 `/create?new=1` 흐름에 연결하고 완료 상태를 AsyncStorage에 저장.
  - Android 실기기에서 3장 전환, 첫 일정 진입, 재실행 시 미반복을 확인하고 하단 시스템 내비게이션 겹침을 bottom safe area로 수정.

## P2 - 품질과 학습

- [x] 홈 일정 추가 플로팅 버튼과 하단 safe area
  - Given 홈 화면의 스크롤 위치와 기기 하단 safe area가 달라짐, When `새 일정 추가` 버튼을 확인하면, Then 버튼은 스크롤 콘텐츠와 독립된 플로팅 레이어에서 앱 하단 내비게이션 위 12px 이상의 간격을 유지한다.
  - Given 360×800, 390×844, 430×932 화면 또는 Android 시스템 내비게이션이 있음, When 홈을 표시하거나 콘텐츠를 스크롤하면, Then 버튼이 잘리거나 하단 탭에 가리지 않고 같은 화면 위치를 유지한다.
  - Given 플로팅 버튼을 누름, When 탐색이 실행되면, Then 새 작성본으로 `새 일정 만들기` 화면에 진입한다.
- [x] Maestro 핵심 흐름 E2E
  - `H-01` 신규 설치→온보딩→첫 일정 등록→교통수단 선택→AI 계획→진행 화면을 자동화.
  - `B-01` Plan B 근거 표시→변경 내용 확인→명시적 적용의 2단계 흐름을 자동화.
  - `J-01` 위치 권한 거부→마지막 위치 기반 경로→재시도 UI fallback을 자동화.
  - `L-01` 일정 완료→실제 시간 학습→설정→다음 계획 반영·이번 계획 제외를 자동화.
  - 각 flow가 앱 상태를 독립 초기화하고 Android 12 `SM-N971N`에서 4/4 흐름 통과.
- [x] 세 기준 화면 크기 스크린샷 회귀
  - Playwright로 360×800, 390×844, 430×932 프로젝트와 고정 시각·fixture를 구성.
  - 홈, 등록 3단계, AI 계획, 개인화 계획, MVP 지표, Plan B, Journey fallback/화면 읽기, 완료, 설정, 정상/지연 진행 12상태의 기준 이미지 36개 생성.
  - 모든 상태에서 문서 가로 넘침을 자동 검사하고 기준 이미지 대비 0.2% 초과 픽셀 차이를 회귀로 처리.
  - `npm run visual:test` 시각·키보드 39/39 통과, 대표 360/430px 화면 육안 검토 완료.
- [ ] 폰트 200%, 스크린리더, 키보드 접근성 점검 (폰트·키보드 완료, TalkBack 실제 탐색 대기)
  - Android 시스템 `font_scale=2.0`에서 H-01 첫 설치→온보딩→등록→계획→진행 전체 흐름 통과 후 원래 1.0으로 복원.
  - 200%에서 타임라인 시각이 줄바꿈되고 Journey 지표 단위가 분리되는 결함을 수정.
  - 홈·등록·Plan B·완료·설정 UI 계층에서 이름 없는 클릭 요소 0개 확인.
  - 세 viewport에서 온보딩 건너뛰기·다음 버튼의 키보드 포커스와 Space 실행 3/3 통과.
  - Android 12 `SM-N971N`에서 TalkBack 서비스·터치 탐색 활성화를 확인하고, 삼성 기기의 React Native 캐시 불일치를 우회하는 로컬 네이티브 상태 조회를 연결함.
  - 화면 읽기 상태 확인 전에는 fail-closed로 앱 TTS를 대기시키며, TalkBack 활성 시 포그라운드·발화 직전·백그라운드 세 경계에서 자체 TTS를 중지하고 버튼을 `화면 읽기 사용 중, 앱 음성 자동 재생 중지됨`으로 비활성화함.
  - 남은 확인: 사용자가 TalkBack 스와이프로 헤더→현재 상태→다음 행동→주 CTA 읽기 순서와 상태 변화 알림을 실제 청취.
- [x] 실제 소요 시간 저장과 다음 계획 개인화
  - 진행 단계 완료 시 계획/실제 소요 시간을 세션에 저장하고 레거시 저장본을 안전하게 마이그레이션.
  - 준비 항목 ID와 교통수단별 이동 평균을 로컬에서 중복 없이 학습하고 다음 계획 계산에 적용.
  - 계획 화면에 변경 전후·표본 수·이번 계획 제외를, 완료/설정 화면에 실제 기록·학습 상태·사용 중지·2단계 초기화를 제공.
  - Jest 57/57, Expo Doctor 20/20, 시각·키보드 33/33, Android `L-01` 통과.
- [x] 이벤트 계측과 MVP 지표 대시보드
  - 제품 문서의 5개 MVP 지표를 9개 로컬 이벤트와 순수 집계 함수로 연결.
  - 설정에서 완료율·생성 시간·알림 전환·지연 결정·단계 오차·정시 도착률과 측정 대기 상태를 제공.
  - 일정 내용·위치는 저장하지 않고 최대 500개 이벤트를 기기에만 보관하며 별도 2단계 초기화 제공.
  - Jest 61/61, Expo Doctor 20/20, 시각·키보드 36/36, Android `L-01` 지표 생성·초기화 취소 통과.

## 2026-07-27 Ralph Loop - 홈 일정 추가 플로팅 버튼 (완료)

- Observe: 홈의 일정 추가 버튼이 스크롤 콘텐츠 내부 `bottom: 88`에 배치돼 Android 하단 safe area가 큰 기기에서 앱 내비게이션에 가릴 수 있었음.
- Select: 버튼을 화면 우측 하단의 독립 플로팅 레이어로 옮기고 실제 내비게이션 높이와 safe area를 함께 반영하는 배치 수정.
- Specify: 최소 내비게이션 높이, 탭·상하 padding, 기기 bottom inset을 하나의 순수 계산으로 공유하고 버튼과 내비게이션 사이 12px 간격, 스크롤 고정, 44px 이상 터치 영역과 새 일정 이동을 수용 기준으로 정의.
- Implement: `bottom-navigation-layout` 순수 계산을 추가해 BottomNav와 홈 FAB가 같은 높이 계약을 사용하도록 하고, FAB를 `Screen` 스크롤 밖의 `page` 절대 레이어로 이동해 inset 변화에 따라 올리도록 구현.
- Verify: `npm run verify` 75/75, Expo Doctor 20/20, 세 viewport 시각·키보드·FAB 기하/스크롤 45/45 통과. Android 12 `SM-N971N`에서 FAB `[875,1823][1022,1970]`, 홈 탭 시작 `2028px`로 58px 간격과 시스템 내비게이션 위 표시를 확인하고, 탭 후 `새 일정 만들기` 진입 및 치명적 로그 없음 확인.
- Reflect: 하단 내비게이션과 플로팅 버튼이 별도 상수를 갖지 않도록 같은 순수 계산을 공유해 제스처/3버튼 내비게이션과 기기별 inset 차이에도 위치가 함께 변함.

## 2026-07-27 Ralph Loop - 새 일정 음성 AI 도우미 (운영 키 대기)

- Observe: 새 일정 등록은 키보드 3단계만 지원해 이동 중이거나 입력이 어려운 사용자가 약속을 빠르게 등록할 수 없었음.
- Select: 말한 약속을 인식하고 AI가 부족한 정보를 질문하되, 사용자의 명시적 적용 전에는 초안을 변경하지 않는 단일 음성 등록 흐름을 선택.
- Specify: 마이크 사전 설명, 최대 60초 녹음, 인식문·AI 확인·질문·변경 전후 표시, 다회 답변, 명시적 적용, 마이크 거부·네트워크 오류·화면 읽기·원본 오디오 삭제를 수용 기준으로 정의.
- Implement: `expo-audio` 녹음과 직접 입력 fallback, 최근 8개 대화와 구조화된 일정 patch, 상대 날짜 해석용 기기 시각·시간대, TalkBack 활성 시 앱 TTS 중지, 읽은 녹음 캐시 즉시 삭제, `gpt-4o-transcribe`→`gpt-5.6-sol` Supabase `assistant` Edge Function을 구현.
- Verify: 신규 도메인·API 테스트 포함 `npm run verify` 72/72, Expo Doctor 20/20, 세 viewport 전체 시각·키보드 42/42, ARM64 Gradle 403 tasks 빌드·설치 통과. Android 12 `SM-N971N`에서 TalkBack 중지 상태를 유지하며 사전 설명→8초 녹음→완료→서버 오류 직접 입력 fallback과 치명적 로그 없음 확인. 서울 리전에 `assistant`를 배포하고 `/health` 200, CORS 200, 키 미설정 요청의 `SERVICE_NOT_CONFIGURED` 503 계약을 실호출로 확인.
- Superseded: 이 OpenAI 구현은 2026-07-28 Gemini Flash-Lite 단일 호출 구현으로 대체됨. 당시 운영 키가 없어 실제 왕복은 수행하지 않았음.
- Reflect: AI 변경은 자동 저장하지 않고 별도 제안 상태에서만 누적하며, 서버 응답도 enum·시간·길이·준비 시간 범위를 앱에서 다시 검증함. 비회원 공개 함수의 운영 rate limit은 배포 전에 추가 검토가 필요함.

## 2026-07-28 Ralph Loop - Gemini Flash-Lite 전환 (실기기 완료)

- Observe: 기존 Edge Function은 `gpt-4o-transcribe` 전사와 `gpt-5.6-sol` 일정 해석의 두 번 호출 구조였고 운영 키가 없어 실제 왕복 기준선은 없었음.
- Select: 사용자 결정에 따라 음성과 구조화 출력을 함께 지원하는 `gemini-3.1-flash-lite`를 기본 공급자로 적용하고 한 번의 호출로 전사문과 일정 제안을 반환하도록 전환.
- Specify: 상대 날짜, 자정 경계, 모호한 시각, 반복 일정, 목적지 수정, 이동수단, 준비 행동, 다회 확인 질문을 포함한 고정 한국어 평가셋을 구성한다. 후보마다 중요 필드 정확도, JSON Schema 검증, 질문 필요성, p50/p95 지연, 실패율, 1,000건 예상 비용을 같은 조건으로 기록한다.
- Implement: M4A를 명시적으로 지원하는 Gemini Interactions API adapter, 인라인 base64 오디오, `store: false`, 최소 추론, 단일 JSON Schema 응답, 텍스트 transcript 원문 보존, `GEMINI_SCHEDULE_MODEL` 환경변수, provider/model/configured health 응답과 upstream 오류 매핑을 구현. 실기기에서 발견한 Android `audio/mp4; codecs=…`·`audio/x-m4a` 변형은 `audio/m4a`로 정규화하고, UTC 자정 경계의 상대 날짜 오해를 막기 위해 기기 시간대의 `localDate`를 별도 전송함. 앱의 명시적 적용 흐름은 유지함.
- Pending: 음성 도우미의 구현·운영 왕복은 완료. 별도 P1인 고정 한국어 평가셋의 필드 정확도·p50/p95 지연·1,000건 예상 비용 기준선은 추가 측정해야 함.
- Verify: Gemini endpoint·M4A MIME 정규화·현지 날짜 문맥·구조화 응답 테스트를 포함해 `npm run verify` 20 suites, 81/81과 360×800·390×844·430×932 시각·키보드 45/45 통과. 서울 리전 `assistant`를 재배포하고 `/health`에서 provider `gemini`, model `gemini-3.1-flash-lite`, configured true를 확인함. Android 12 `SM-N971N`에서 TalkBack 중지 상태로 사전 설명→Yuna 합성 한국어 녹음→전사·제안 표시→명시적 적용 왕복을 수행해 `2026-07-29`, `16:00`, 부산역, 선택된 지하철, 선물 포장 10분이 등록 초안에 반영됨을 확인했고 치명적 런타임 오류가 없었음. 첫 왕복에서 MIME 거부와 UTC 날짜 오해를 재현한 뒤 각각 회귀 테스트와 실기기 재시험으로 해소함. 앞선 서버 실호출의 텍스트·M4A 결과와 원본 오디오 비저장·검증 파일 즉시 삭제 조건도 유지함.
- Reflect: API 단가만이 아니라 일정 오해의 사용자 비용을 함께 평가한다. 무료 tier의 데이터 처리 조건은 운영 판단 근거로 사용하지 않고 유료 운영 조건과 보존 정책을 확인한다.
- Price snapshot (2026-07-28, USD/1M tokens unless noted): OpenAI `gpt-4o-transcribe` audio input/output $2.50/$10, `gpt-4o-mini-transcribe` $1.25/$5, `gpt-5.6-sol` text $5/$30, `gpt-5.6-luna` $1/$6, `gpt-4o-mini` $0.15/$0.60. Gemini `gemini-3.1-flash-lite` standard text/audio input $0.25/$0.50, output $1.50. Groq Whisper Large v3 Turbo $0.04/transcribed hour. 구현 시 공급자 공식 가격 페이지를 다시 확인한다.

## 2026-07-27 Ralph Loop - TalkBack과 앱 TTS 중복 방지 (완료)

- Observe: 시스템 `accessibility_enabled=1`, Samsung TalkBack 서비스와 터치 탐색이 활성인데 React Native `AccessibilityInfo` 캐시는 false를 반환해 Journey가 `음성 켜짐`을 유지했음.
- Select: 화면 읽기 사용 중 앱 자체 음성이 겹치지 않는 정확한 발화 제어를 선택.
- Specify: 화면 읽기 상태가 활성 또는 확인 중이면 앱 TTS를 시작하지 않아야 하며, 활성 전환 즉시 진행 중 음성을 중지해야 함. 포그라운드와 백그라운드 안내에 같은 정책을 적용하고 사용자에게 중지 상태를 텍스트로 표시해야 함.
- Implement: Android `AccessibilityManager` 터치 탐색·음성 피드백 서비스와 Samsung 보안 설정을 실시간 조회·구독하는 로컬 Expo 모듈을 추가. 상태 확인 전 fail-closed 정책, 앱 active 재확인, 실제 `Speech.speak` 직전 재검사, 백그라운드 알림 fallback을 연결.
- Verify: 정책 단위 테스트를 포함한 Jest 65/65, TypeScript/ESLint, Expo Doctor 20/20, 세 viewport 시각·키보드 39/39, ARM64 Gradle 403 tasks 빌드·설치 통과. TalkBack 활성 Android 기기에서 Journey 버튼이 `화면 읽기 사용 중, 앱 음성 자동 재생 중지됨`으로 바뀌고 비활성화됨을 확인.
- Reflect: React Native 단일 캐시에 의존하지 않고 제조사별 TalkBack 구성요소와 음성 피드백 서비스까지 교차 확인하며, 조회 실패도 발화 허용으로 처리하지 않음.
- Evidence: `modules/on-time-accessibility`, `src/lib/screen-reader-state.ts`, `src/lib/accessibility-voice.ts`, `src/lib/expo-voice-guide.ts`, `src/lib/background-journey-service.ts`, `src/app/journey.tsx`.

## 2026-07-26 Ralph Loop - 이벤트 계측과 MVP 지표 대시보드 (완료)

- Observe: 제품 문서에 성공 지표는 정의돼 있었지만 사용자 흐름 이벤트, 저장 계약, 실제 확인 화면이 없어 개선 효과를 판단할 수 없었음.
- Select: 외부 분석 SDK나 계정 없이 현재 기기에서 MVP 가설을 검증할 수 있는 최소 계측 루프를 선택.
- Specify: 첫 일정 완료율/시간, 알림 전환, 지연 결정, 단계 오차, 정시 도착률을 계산하고 데이터가 없으면 `측정 대기`를 표시해야 함. 일정 내용과 위치는 이벤트에 포함하지 않으며 지표만 별도 삭제할 수 있어야 함.
- Implement: 직렬화된 v1 로컬 이벤트 저장소(최대 500개), 순수 집계 함수, 알림 응답→진행 source 연결, 핵심 상태 액션 계측, 설정 대시보드와 2단계 초기화를 구현.
- Verify: TypeScript/ESLint/Jest 61/61, Expo Doctor 20/20, 11상태 기준 이미지 33개와 키보드 합계 36/36 통과. Android 12 `SM-N971N`에서 `L-01` 실제 이벤트 생성→대시보드→초기화 확인/취소 통과.
- Reflect: 서버 전송은 동의·보존 정책 결정 전까지 범위에서 제외하고, 사용자에게 로컬 저장과 삭제 범위를 명시. 알림 전환은 알림 응답 source가 실제 진행 진입으로 이어진 경우만 집계.
- Evidence: `src/lib/analytics.ts`, `src/lib/__tests__/analytics.test.ts`, `src/app/settings.tsx`, `e2e/visual/__screenshots__/*/mvp-metrics.png`.

## 2026-07-26 Ralph Loop - 실제 시간 학습과 다음 계획 개인화 (완료)

- Observe: 완료 화면은 고정된 예시 문구만 보여 실제 단계 소요 시간이 사라졌고, 다음 일정도 항상 기본 준비·이동 시간을 사용했음.
- Select: 완료한 일정의 실제 시간만 기기 안에서 학습하고 다음 계획에 투명하게 반영하는 P2 사용자 결과를 선택.
- Specify: 단계 완료 시 실제 분을 저장하고, 같은 세션은 한 번만 학습하며, 다음 계획은 변경 전후와 표본 수를 설명해야 함. 사용자는 전체 학습을 끄거나 삭제하고 이번 계획만 제외할 수 있어야 함.
- Implement: 진행 세션 `sessionId`·실제 시간 마이그레이션, 준비 항목/교통수단별 이동 평균 저장소, 개인화 계획 adapter, 완료 회고, 계획 근거 카드, 설정 토글·2단계 초기화를 구현.
- Verify: TypeScript/ESLint/Jest 57/57, Expo Doctor 20/20, 세 viewport 시각·키보드 33/33 통과. Android 12 `SM-N971N`에서 `L-01` 완료→5개 학습→설정 확인/취소→새 계획 반영→이번 계획 제외 통과.
- Reflect: 저장 자체보다 사용자 통제와 근거가 중요해 서버 계정 동기화 없이 로컬 전용임을 명시하고, 기본 계획으로 되돌리는 범위를 현재 계획으로 제한.
- Evidence: `src/lib/personalization.ts`, `src/lib/__tests__/personalization.test.ts`, `e2e/maestro/04_personalization_learning.yaml`, `e2e/visual/__screenshots__/*/personalized-plan.png`.

## 2026-07-26 Ralph Loop - 전체 아이콘 시스템 개선 (완료)

- 무료 ISC 라이선스 Lucide를 공통 아이콘 공급자로 선정하고 Expo SDK 57 호환 `react-native-svg` 설치
- 화면별 문자·기호·이모지 아이콘 인벤토리 후 홈, 일정, 알림, 설정, 권한, 등록, 계획, 진행, 플랜 B, 완료 화면을 공통 `AppIcon`으로 교체
- 16/20/22/28px 크기 계층, 2/2.5px 선 굵기, 40–48px 카드 컨테이너와 최소 44×44px 아이콘 버튼 기준 적용
- 이동수단에서 자가용과 택시 아이콘을 구분하고, 저장된 레거시 준비 행동 이모지는 의미 기반 SVG로 호환 표시
- 개별 아이콘 경로 import로 사용하지 않는 전체 아이콘 세트가 bundle에 포함되지 않도록 최적화
- Android `SM-N971N` ARM64 개발 APK 빌드·업데이트 설치, 홈·설정·등록·교통수단 화면 실기기 렌더링 확인

## 다음 Ralph Loop 권장 항목

1. 연결 폰 잠금 해제 후 백그라운드 안내 중지·task/저장 삭제 검증
2. 실제 이동 중 화면 꺼짐 위치 event 갱신 확인
3. TalkBack 실제 기기 읽기 순서·상태 변화 안내 검증

## 2026-07-27 Ralph Loop - NAVER 인증·백그라운드 실행 검증 (진행)

- Observe: NAVER 지도는 Client ID가 존재해도 Android 패키지 허용이 없어 401 격자 화면이었고, 백그라운드 위치는 `항상 허용` 전이라 실행 검증이 막혀 있었음.
- Select: 외부 인증과 민감 권한 차단이 해소된 즉시 실제 지도 타일과 화면 꺼짐 서비스 실행을 우선 검증.
- Specify: `TimeAgent` Client ID·Dynamic Map·`com.ontime.app`이 일치해야 하며, 실기기에서 타일·현위치·TMAP 경로가 표시돼야 함. 백그라운드 안내는 위치 service·세션·음성 결과를 남기고 끄면 모두 삭제해야 함.
- Implement: NAVER Cloud Maps `TimeAgent` 서비스 환경에 `com.ontime.app`을 등록하고 앱을 cold start. 백그라운드 위치 권한 승인 후 기존 Journey 안내 세션을 재개.
- Verify: Android 12 `SM-N971N`에서 NAVER 실제 타일·현위치·TMAP 경로선 표시, 401 로그 없음. `ACCESS_BACKGROUND_LOCATION=true`, task service, 15초 고정밀 위치 요청, AsyncStorage TMAP 세션과 `lastVoiceDelivery=spoken` 확인.
- Pending: 기기가 정지해 화면 꺼짐 22초 동안 25m 조건의 새 위치 event는 없었음. 현재 잠금 인증 화면이므로 잠금 해제 후 안내 끄기→task 중지→세션 삭제와 실제 이동 시 갱신을 확인. TalkBack은 아직 꺼짐.

## 2026-07-27 Ralph Loop - 지도 스크롤·TalkBack 중복 음성 보완 (실기기 승인 진행)

- Observe: Android 지도 SurfaceView가 화면 중앙의 세로 스와이프를 소비해 지도 아래 `화면 꺼짐 안내 켜기` CTA에 자동/수동 접근하기 어려웠고, TalkBack 사용 시 앱 TTS와 화면 읽기가 중복될 수 있었음.
- Select: 백그라운드 권한 검증을 막는 지도 스크롤과 실제 TalkBack 탐색 전에 제거 가능한 중복 음성을 우선 수정.
- Specify: 기본 세로 스와이프는 화면을 이동하고, 사용자가 명시적으로 지도 조작을 켠 동안만 지도 이동·확대 제스처가 동작해야 함. 화면 읽기 서비스 활성 중에는 앱 TTS를 자동 재생하지 않고 다음 행동 변화는 live region으로 전달해야 함.
- Implement: NAVER 지도 `화면 스크롤 우선/지도 조작` 토글과 gesture props, AccessibilityInfo 구독·TTS 중지, 다음 행동 live region, heading 역할을 구현. `BG-01` 권한 게이트 flow 추가.
- Verify: `npm run verify` TypeScript/ESLint/Jest 64/64, 시각·키보드 39/39, Android `BG-01` TMAP 실제 경로→하단 CTA→시스템 `위치 액세스 권한` 화면 진입 통과. 현재 `ACCESS_BACKGROUND_LOCATION=false`, TalkBack 서비스 꺼짐을 읽기 전용 확인.
- Pending: 연결 폰에서 사용자가 `항상 허용` 선택 후 foreground service·화면 꺼짐 위치/TTS·중지 삭제 검증, TalkBack 활성 후 실제 초점 순서·상태 안내 검증.

Mobility API는 자체 서버 대신 Supabase Edge Function 기본 HTTPS 주소를 사용하며 Geocoding과 TMAP 도보 경로 실호출 검증을 완료했다.

## 2026-07-26 Ralph Loop - 실시간 Journey 지도·TMAP·음성 (코드 완료, NAVER 인증 대기)

- Observe: fixture 지도는 상태 위계와 경로선을 검증했지만 실제 현위치·경로·음성 동작이 없었고 NAVER 타일이 격자로 표시됨.
- Select: 현위치→목적지 좌표→TMAP 경로→지도/텍스트 fallback의 핵심 이동 흐름을 우선 연결.
- Specify: 사용자는 TMAP 출처, ETA, 약속까지 시간, 거리, 다음 행동, 갱신 상태를 보고 새 waypoint마다 같은 정보를 음성으로 들어야 함.
- Implement: Expo Location adapter, TMAP RouteProvider 실호출, AppState 복귀 재조회, 15초 위치 갱신, 오류별 직선 임시 경로, 재시도, NAVER native map overlay/path/marker, Expo Speech 음성 토글·중복 방지를 구현.
- Verify: `npm run verify` 44/44, `npx expo-doctor` 20/20, ARM64 debug APK 빌드 성공. Android 12 `SM-N971N`에서 `도보 · TMAP 경로`, 160분, 12km, 최신 상태 및 음성 on/off 접근성 상태를 확인했고 치명적 런타임 오류가 없음.
- Reflect: 장거리 `11650m` 표기와 과도한 GPS 정확도 원, 출발점 과확대 문제를 발견해 km 표기·정확도 원 80m 상한·전체 경로 여백을 추가.
- External blocker: NAVER 로그 `Authorization failed: [401] Unauthorized client`. 2026-07-27 Chrome의 기존 Maps Application 탭을 재확인했으나 콘솔 세션이 `Authentication failed`로 만료돼 로그인 갱신 후 Client ID의 Android 패키지 허용을 설정해야 함. 지도 실패 중에도 TMAP 경로선·현위치·텍스트 안내는 유지됨.
- Evidence: `tmp/ralph-loop/android-tmap-live-route-polished.png`, 연결 기기 package `com.ontime.app`.

## 2026-07-26 Ralph Loop - 온보딩 3장·비회원 첫 일정 (완료)

- Observe: 첫 설치 사용자가 제품 가치와 위치·음성 사용 이유를 알기 전에 fixture 홈으로 진입함.
- Select: 가입 장벽 없이 3장 설명 후 첫 일정 등록으로 연결하는 P1 흐름.
- Specify: 다음·이전·건너뛰기, 3장 페이지 상태, 마지막 첫 일정 CTA, 완료 후 재표시 금지를 수용 기준으로 정의.
- Implement: 역산 계획·지연 재계획·이동 지도/음성 3장, 접근성 레이블, AsyncStorage 완료 marker, 홈 첫 진입 gate, `/create?new=1` 연결 구현.
- Verify: `onboarding.test.ts` 저장 계약 통과. Android `SM-N971N`에서 3장 전환→첫 일정 화면→앱 재실행 시 온보딩 미반복 확인.
- Reflect: 360dp Android에서 CTA가 시스템 내비게이션 뒤로 내려가는 문제를 발견하고 `Screen safeBottom` 계약을 추가.
- Evidence: `tmp/ralph-loop/android-onboarding-1-safe.png`, `tmp/ralph-loop/android-onboarding-3.png`.

## 2026-07-26 Ralph Loop - 교통수단 비교 근거·변경 확인 (완료)

- Observe: 플랜 B의 고정 시간·비용이 실제 조회값처럼 보였고, 선택 CTA가 확인 없이 즉시 진행 경로를 변경함.
- Select: PO 결정에 따라 실제 TMAP 도보 경로와 추정 대안을 분리하고, 경로 변경을 명시적 확인 뒤에만 적용.
- Specify: 각 대안은 출처, 소요 시간, 거리, 비용, 걷기, 환승, 도착 상태를 제공하며 TMAP 실패 시에도 추정 대안이 남아야 함. 적용 전 현재/변경 정보를 나란히 확인하고 재실행 후 경로가 복원돼야 함.
- Implement: `TransportAlternative`·`TransportEvidence` 계약, TMAP 도보 실호출 대안, 실제 경로/예상값 pill, 데이터 설명, 2단계 적용 카드, 현재 경로 제외, 세션 미생성 진입의 저장 보완을 구현.
- Verify: `npm run verify` typecheck/lint/Jest 48/48 통과. Android 12 `SM-N971N`에서 TMAP 약 160분·12km 실제 경로, 예상 대안 라벨, 지하철→택시 변경 전후 확인, 적용, 강제 종료·재실행 후 `현재 경로 · 택시` 복원을 확인. 치명적 런타임 오류 없음.
- Reflect: 딥링크로 플랜 B를 먼저 열면 세션이 없어 선택 수단이 진행 화면에서 기본값으로 되돌아가는 결함을 발견해, 적용 시 세션 생성·알림 동기화까지 하나의 commit으로 보완.
- Evidence: `tmp/ralph-loop/android-planb-tmap-route.png`, `tmp/ralph-loop/android-planb-taxi-confirm.png`, `tmp/ralph-loop/android-planb-persisted.xml`.

## 2026-07-26 Ralph Loop - 백그라운드 위치·음성 기술 검증 (실기기 승인 대기)

- Observe: 기존 Journey는 앱 active 복귀와 foreground 15초 갱신만 지원해 화면이 꺼지면 waypoint 음성이 중단됨.
- Select: 상시 추적이 아니라 사용자가 Journey 화면에서 명시적으로 켠 이동 세션에 한해 Android foreground service를 유지.
- Specify: 25m/15초 제한, 새 maneuver 중복 방지, ETA·거리 포함 한국어 TTS, 음성 오류 시 알림 fallback, 상태·최근 전달 결과 표시, 수동 중지·도착 자동 중지·로컬 데이터 삭제를 수용 기준으로 정의.
- Implement: `expo-task-manager`, background session v1 런타임 검증/저장, 전역 location task, speech 완료/오류 처리, 알림 대체, Android 민감 권한·foreground service, Journey opt-in 카드와 권한 race 방지를 구현.
- Verify: `npm run verify` typecheck/lint/Jest 52/52, `npx expo-doctor` 20/20, ARM64 Gradle 382 tasks 빌드 성공 및 APK 설치. Android 12에서 TMAP 실제 경로 상태의 opt-in UI와 위치 권한 `항상 허용` 시스템 화면, 미승인 복귀 fallback을 확인.
- Pending: 사용자가 연결 폰에서 `항상 허용`을 직접 선택한 뒤 foreground-service 상단 알림, 백그라운드 위치 갱신 시각, 화면 꺼짐 TTS/알림 fallback, 끄기 후 task·저장 삭제를 최종 확인해야 완료.
- Evidence: `tmp/ralph-loop/android-background-journey-opt-in.png`, `tmp/ralph-loop/android-journey-bg-required2.xml`.

## 2026-07-26 Ralph Loop - Maestro 핵심 흐름 E2E (완료)

- Observe: 핵심 흐름은 수동 실기기 검증 기록만 있어 반복 변경 시 첫 일정·Plan B·권한 거부 회귀를 자동으로 찾기 어려웠음.
- Select: 실제 Android 앱과 딥링크를 사용하는 `H-01`, `B-01`, `J-01` 세 흐름을 우선 자동화.
- Specify: 신규 상태의 온보딩부터 진행 진입, Plan B의 근거 확인과 2단계 적용, 위치 권한 거부 시 사용자에게 즉시 보이는 오류·복구 행동을 수용 기준으로 정의.
- Implement: Maestro 2.7.0 flow 3개와 npm 실행 명령을 추가하고, 권한 거부 오류 카드가 지도와 백그라운드 안내 아래에 묻히던 정보 위계 문제를 지도 위로 재배치.
- Verify: `npm run verify` TypeScript/ESLint/Jest 52/52 통과. Android 12 `SM-N971N`에서 `npm run e2e:android` 3/3 흐름을 1분 58초에 연속 통과.
- Reflect: 자동 스크롤 실패는 테스트 도구 문제가 아니라 핵심 오류·재시도 UI가 세 화면 이상 아래에 있던 실제 UX 문제를 드러냈고, 사용자가 지도보다 먼저 연결 문제를 인지하도록 수정.
- Evidence: `e2e/maestro/01_first_schedule.yaml`, `e2e/maestro/02_plan_b_confirmation.yaml`, `e2e/maestro/03_location_denied_fallback.yaml`.

## 2026-07-26 Ralph Loop - 세 기준 화면 스크린샷 회귀 (완료)

- Observe: 화면 크기별 수동 확인 기록은 있었지만 기준 이미지와 자동 비교가 없어 UI 변경의 시각 회귀를 반복 검증할 수 없었음.
- Select: 모바일 최소·기준·대형 너비인 360×800, 390×844, 430×932를 Playwright 프로젝트로 고정.
- Specify: 핵심 9상태는 가로 넘침이 없어야 하고, 고정 시각·동일 fixture의 기준 이미지와 픽셀 차이가 0.2% 이하여야 함.
- Implement: Playwright 1.62.0, Expo webServer, 세 viewport, 로컬 저장 fixture, 정상/지연 상호작용, 기준 갱신·비교 명령과 27개 PNG를 추가.
- Verify: `npm run visual:update` 27/27, 이어서 기준 비교 모드 `npm run visual:test` 27/27 통과. 360px 등록·지연·Journey와 430px Plan B 대표 이미지를 육안 검토.
- Reflect: 지연 변경 CTA까지 스크롤한 위치가 캡처에 남아 화면 상단이 누락되는 테스트 결함을 발견해, 상호작용 완료 후 모든 스크롤 컨테이너를 상단으로 복원하도록 고정.
- Evidence: `playwright.config.mjs`, `e2e/visual/app.visual.spec.mjs`, `e2e/visual/__screenshots__/`.

## 2026-07-26 Ralph Loop - 폰트 200%·접근성 기본 점검 (TalkBack 대기)

- Observe: Android 200% 글자 크기에서 타임라인 시각이 `12: / 49`로 갈라지고 Journey 핵심 지표가 `160 / 분`, `12k / m`처럼 분리됨.
- Select: 사용자가 지금 해야 할 행동·남은 시간·거리의 가독성을 먼저 복구하고 첫 일정 전체 흐름을 큰 글자로 검증.
- Specify: 시각과 단위는 한 줄을 유지하고, 핵심 CTA는 스크롤로 접근 가능하며, 클릭 요소는 읽을 이름을 가져야 하고 키보드로 실행 가능해야 함.
- Implement: fontScale 기반 타임라인 시각 열 확장, Journey 1.6배 이상 세로 지표 레이아웃, 큰 글자에서도 동작하는 Maestro 스크롤 계약, 개발 빌드 전용 permission-denied fixture로 E2E 상태 격리를 구현.
- Verify: 연결 Android `font_scale=2.0`에서 H-01 전체 통과 후 1.0 복원. 홈·등록·Plan B·완료·설정에서 이름 없는 클릭 요소 0개. 키보드 포커스·Space 실행 3/3, 시각/키보드 합계 30/30, `npm run verify` 52/52, Android 전체 3/3 통과.
- Pending: TalkBack 서비스는 기기 전체 조작 방식을 바꾸므로 자동 활성화하지 않음. 사용자 활성화 후 헤더→상태→주 CTA 읽기 순서와 `accessibilityLiveRegion` 전달을 최종 검증해야 항목 완료.
- Evidence: `tmp/ralph-loop/timeagent-font200-home-bottom-fixed.png`, `tmp/ralph-loop/timeagent-font200-journey-fixed.png`, `tmp/ralph-loop/timeagent-a11y-*.xml`.

## 2026-07-26 Ralph Loop - 로컬 알림 예약·재예약·완료 취소 (완료)

- 준비 시작·각 실제 단계 종료·출발 시점을 계산하는 순수 알림 계획 구현
- 이미 지난 시점과 완료된 단계는 예약하지 않고 시간순으로 정렬
- 진행 세션에 OS 예약 identifier·알림 종류·단계·시각을 저장하고 기존 v1 저장본을 빈 목록으로 안전하게 마이그레이션
- 세션 시작과 앱 재실행 복원 시 권한·앱 설정을 확인해 예약 동기화
- 단계 완료·건너뛰기·지연 적용·경로 변경 시 기존 identifier 취소 후 남은 알림 재예약
- 일정 완료·새 계획 확정·홈 초기화 시 관련 예약 취소
- 알림 비활성/권한 거부/예약 실패 시 앱 내 남은 시간 안내 fallback 문구 제공
- 포그라운드에서도 배너·목록·소리를 표시하는 notification handler 연결
- 지연 적용 시 누적 지연만 바뀌고 현재 카운트다운은 늘지 않던 결함 수정
- `npm run verify`: typecheck, lint, Jest 29/29 통과
- `npx expo-doctor`: 20/20 통과
- 360x800, 390x844, 430x932 진행 화면 가로 넘침 없음; 재실행 후 알림 상태 문구 복원 확인
- Android `SM-N971N` Android 12에 개발 APK 설치 후 최신 Metro bundle로 실행
- 새 진행 세션에서 저장 identifier 7개와 `expo.modules.notifications.NOTIFICATION_EVENT` OS `RTC_WAKEUP` 알람 확인
- `+5분` 변경 적용 전후 첫 identifier가 교체되고 남은 예약이 7개에서 6개로 재구성됨을 SQLite로 확인
- 단계 완료 흐름에서 남은 예약이 감소하고 마지막 도착 단계에서 0개가 됨을 확인
- 일정 완료 상태 `completed`, 현재 단계 `null`, 저장 예약 0개와 활성 OS 알람 0개 확인
- `홈으로 돌아가기` 후 진행 세션 행 0개, 홈 복귀와 치명적 Android 런타임 오류 없음 확인
- 발견 개선: Android 12에서 앱의 권한 조회가 `허용됨`이어도 시스템 앱 알림 스위치/app-op가 꺼져 실제 수신이 차단될 수 있음. 설정 화면에 실제 알림 가능 여부 확인·설정 이동 안내를 추가할 것

## 2026-07-26 Journey 지도·음성 안내 공동 검토

- PO: 도보 실제 경로와 타 수단 추정치를 명확히 분리하고, 경로/일정 변경은 사용자 확인 후 적용하기로 결정
- 모바일 아키텍트: 지도·Geocoding·경로 키를 서버/adapter 경계로 분리하고, foreground MVP와 background navigation을 별도 릴리스로 분리
- 전문 앱 디자이너: 전용 Journey 지도 화면, 현재 위치·정확도·ETA·거리·다음 행동·갱신 시각·텍스트 fallback 정보 위계 확정
- 음성은 모든 polyline 좌표가 아니라 출발·회전·횡단보도·환승·이탈·ETA 주요 변화·도착 maneuver에서만 제공
- 상세 명세와 발견 UI 개선은 [이동 중 지도·음성 안내 제품 명세](JOURNEY_MAP_UX.md)에 기록

## 2026-07-24 Ralph Loop - 위치/알림 권한 사전 설명과 거부 상태

- Expo SDK 57 호환 `expo-location`, `expo-notifications` 설치와 config plugin 설정
- OS 요청 전에 위치·알림의 사용 목적과 거부해도 사용할 수 있는 기능을 설명하는 권한 화면 추가
- 요청 전·허용·재요청 가능 거부·차단·확인 실패를 색상 외 텍스트 상태로 구분
- 위치 거부 시 수동 출발지 입력·AsyncStorage 저장, 차단 시 기기 설정 이동 제공
- 알림 거부 시 앱 내 현재 행동·남은 시간 안내 fallback 제공
- OS 알림 권한과 ON:TIME 앱 알림 사용 설정을 분리하고 설정 화면 복귀 시 다시 동기화
- `npx expo-doctor`: 20/20 통과
- `npm run verify`: typecheck, lint, Jest 25/25 통과
- 웹 자동 상호작용: 사전 설명 선행, 위치 거부 fallback, 수동 `부산역` 저장, 알림 거부 fallback 확인
- 360x800, 390x844, 430x932 권한 설명·위치 거부 화면에서 가로 잘림과 세로 스크롤 확인
- Android `SM_N971N`에 새 네이티브 모듈 포함 개발 APK 빌드·설치 성공
- Android 12: 위치 OS 팝업 전에 앱 설명 화면 표시, 첫 거부 후 재요청·수동 입력, 두 번째 거부 후 기기 설정 이동 확인
- Android 수동 출발지 `BusanStation` 저장과 설정 화면의 차단 상태 동기화 확인
- Android 12는 `POST_NOTIFICATIONS` 런타임 팝업 대상이 아니므로 OS 허용 상태에서 앱 알림 끄기와 앱 내 안내 설정 저장을 확인
- Android 로그에서 치명적 React Native 런타임 오류 없음
- 남은 위험: Android 13 이상과 iOS의 실제 알림 거부 OS 팝업은 해당 기기에서 추가 검증해야 한다.

## 2026-07-24 Ralph Loop - 지연 전후 비교 확인 시트와 적용/거절

- 지연 선택과 저장 적용을 분리한 `ProgressDelayProposal` 순수 모델 구현
- 준비 총시간·출발·예상 도착의 변경 전후를 표 형태로 표시
- 중요한 준비 행동을 삭제하지 않고 이후 시간만 이동한다는 변경 이유 표시
- 미적용·거절 상태에서는 진행 세션과 AsyncStorage 지연값을 유지
- 적용 시에만 지연값, 마지막 재계산 시각과 예상 도착을 저장
- 거절·적용 결과를 접근성 실시간 문구로 안내
- `npm run verify`: typecheck, lint, Jest 22/22 통과
- 웹 자동 상호작용: 미적용 0분, 거절 0분, 적용 5분 저장 확인
- 360x800, 390x844, 430x932 비교 시트에서 표·설명·두 CTA 잘림 없음
- Android `SM_N971N`: 최신 개발 APK 재설치 후 미적용 0분, 거절 0분, 적용 5분을 SQLite 저장값으로 확인
- Android 앱 강제 종료·재실행 후 적용된 5분 지연 복원 확인
- Android 로그에서 치명적 React Native 런타임 오류 없음
- 남은 위험: 지연 적용에 따른 로컬 알림 재예약은 P1 알림 항목에서 구현해야 한다.

## 2026-07-24 Ralph Loop - 진행 세션 영속화와 앱 복귀 보정

- 일정·계획·타임라인·현재 단계·단계 시작 시각·적용 경로·누적 지연·마지막 재계산 시각을 AsyncStorage에 저장
- 앱 복귀 시 저장된 남은 시간이 아니라 실제 경과 시간을 단계 시작 시각에서 다시 계산
- 예정 시간 초과 시 자동 단계 이동 없이 00:00과 사용자 확인 문구 제공
- 명시적 완료 후에만 다음 단계로 전환하고 새 단계 타이머 시작
- 저장 복원 전 새 세션 생성 및 완료 직후 세션 재생성 경쟁 상태를 Android 강제 종료 시험에서 발견해 수정
- `npm run verify`: typecheck, lint, Jest 16/16 통과
- 360x800, 390x844, 430x932 진행 화면에서 가로 잘림과 세로 스크롤 확인
- Android `SM_N971N`: `shower` 단계 시작 시각이 재실행 전후 동일하게 유지되고 카운트다운이 실제 경과만큼 감소하는 것을 확인
- Android에서 샤워 완료 후 `makeup` 단계와 720초 타이머 저장 확인
- 완료 화면에서 홈 복귀 후 `@on-time/progress-session` 삭제 확인
- 남은 위험: 운영체제 백그라운드 제한과 알림 연동은 P1 백그라운드·알림 항목에서 추가 검증해야 한다.

## 2026-07-24 Ralph Loop - UI 미작동 버튼·탭 전수 점검

- 일정 `예정/완료`를 실제 탭으로 바꾸고 완료 기록 카드까지 연결
- 플랜 B 정시·비용·걷기 기준이 카드 순서를 실제로 변경하도록 순수 정렬 로직 연결
- 준비 행동 추가 폼, 빈 값·중복 방지, 5분 기본 행동 추가 및 작성본 자동 저장 연결
- 설정의 출발 위치·이동수단·여유 시간·루틴·코치 말투 편집과 음성·알림 토글을 AsyncStorage에 저장
- 동작이 없는 설정 화살표를 제거하고 NAVER 지도 위치 권한은 P1 연동 단계임을 문구로 명시
- 새 일정 진입과 저장 작성본 복원 사이 경쟁 상태를 자동 클릭 검증에서 발견해 새 작성 요청 우선으로 수정
- 마지막 진행 단계 완료 시 완료 화면 자동 전환
- `npm run verify`: typecheck, lint, Jest 21/21 통과
- 360x800, 390x844, 430x932에서 일정·설정·등록·플랜 B 화면의 가로 잘림과 세로 스크롤 확인
- 웹 자동 클릭: 완료 탭, 걷기 최소 정렬의 택시 우선, 여유 시간 10분 저장, 새 준비 행동 추가 확인
- Android `SM_N971N`: 완료 탭 전환, 플랜 B `택시 → 다음 버스 → 지하철` 재정렬, 여유 시간 10분 선택·저장, 사용자 준비 행동 추가 확인
- Android 로그에서 치명적 React Native 런타임 오류 없음
- 남은 위험: 위치 권한과 알림 스위치의 운영체제 권한 연동은 각각 P1 권한·알림 항목에서 구현해야 한다.

## 2026-07-23 Ralph Loop - 준비/이동 시간 계산 엔진

- 입력한 준비 행동 총 43분, 이동수단별 기본 예상 시간, 도착 우선순위별 여유 시간을 반영하는 순수 계산기 구현
- 정상, 즉시 시작, 정시 불가능, 자정 경계, 입력 기반 타임라인 테스트 추가
- 계획 화면의 준비 시작·출발·도착·상태 문구·코치 설명·타임라인을 계산 결과로 교체
- 지연 상태에서는 과거 목표 시각이 아니라 지금 시작 기준 도착 시각으로 즉시 재계산
- `npm run verify`: typecheck, lint, Jest 11/11 통과
- 360x800, 390x844, 430x932 계획 화면에서 가로 잘림과 스크롤 확인
- Android `SM_N971N`: 60분 지각 상태에서 현재 시각 기준 13:53 준비 시작, 14:36 출발, 15:00 도착 재계산 확인
- 남은 위험: 이동 시간은 NAVER/TMAP adapter 연결 전 기본 추정값이며 실제 교통 응답으로 교체해야 한다.

## 2026-07-23 Ralph Loop - 실제 일정 입력과 자동 저장

- `npm run verify`: typecheck, lint, Jest 6/6 통과
- Android `SM_N971N`: 새 AsyncStorage 네이티브 모듈 포함 개발 APK 빌드·설치·실행 성공
- 실기기에서 `Ralph_AutoSave` 입력과 2단계 이동 화면을 앱 강제 종료 후 복원 확인
- AI 계획 생성 후 AsyncStorage 임시 작성본 삭제와 재실행 시 1단계 새 작성본 복귀 확인
- 등록 1단계를 360x800, 390x844, 430x932에서 확인하고 공통 컨테이너의 웹 너비 초과 수정
- 남은 위험: 일정 결과 타임라인은 아직 입력값 기반 역산 엔진이 아니라 데모 타임라인을 사용한다.

## 2026-07-23 검증 기록

- `npx expo-doctor`: 20/20 통과
- `npm run verify`: typecheck, lint, Jest 3/3 통과
- `npm run web -- --port 8081`: Metro web/SSR bundle 성공
- `curl http://localhost:8081`: 렌더된 HTML 응답 확인
- Android 16 `SM-S931N`: `com.ontime.app` 개발 APK 빌드·설치·실행 성공
- Android 실기기 홈/실시간 진행 화면 캡처 및 런타임 오류 로그 확인 완료
- 남은 위험: 다른 기준 화면 크기와 네이티브 권한 동작은 아직 미실행

## 2026-07-23 공급자 결정

- 지도 렌더링과 좌표 기준: NAVER Maps
- 도보 경로: TMAP 보행자 경로안내 API
- 보안 결정: TMAP App Key는 서버 전용이며 앱은 프록시 endpoint만 호출
- 준비 필요: NAVER Cloud Maps 애플리케이션 등록, TMAP API 상품/앱 등록, 허용 도메인·패키지 설정, 개발/운영 키 분리
- 로컬 준비 상태: NAVER Maps Client ID와 TMAP 서버용 App Key를 `.env.local`에 설정 완료. TMAP 키는 앱 번들에서 참조하지 않고 서버 프록시에서만 사용한다.
