# 개발 하네스

하네스는 에이전트나 개발자가 같은 입력, 명령, 화면 기준으로 변경을 검증하도록 만드는 실행 계약이다.

## 환경 고정

- Node.js: 20 이상, 현재 검증 v24 LTS
- 패키지 매니저: npm, `package-lock.json` 커밋
- Expo/React Native 버전: `package.json` 고정
- 설치: 로컬은 `npm install`, CI는 `npm ci`

## 한 번에 실행

```bash
npm run verify
```

이 명령은 다음을 순서대로 실행한다.

1. TypeScript strict typecheck
2. Expo ESLint
3. Jest 단위 테스트

## 개발 루프

```bash
npm start
npm run typecheck
npm test -- --watch
```

기능 구현 중에는 가장 가까운 단위 테스트를 먼저 돌리고, 작업 완료 전에 전체 `verify`를 실행한다.

## Android Maestro E2E

연결된 Android 기기에서 핵심 흐름 전체를 실행한다.

```bash
npm run e2e:android
```

빠른 smoke 태그만 실행할 때는 다음 명령을 사용한다.

```bash
npm run e2e:android:smoke
```

| Flow | 파일 | 검증 범위 |
|---|---|---|
| H-01 | `e2e/maestro/01_first_schedule.yaml` | 신규 설치, 온보딩, 첫 일정, 계획, 진행 |
| B-01 | `e2e/maestro/02_plan_b_confirmation.yaml` | Plan B 근거, 변경 확인, 명시적 적용 |
| J-01 | `e2e/maestro/03_location_denied_fallback.yaml` | 위치 권한 거부, 마지막 위치 경로, 재시도 fallback |
| L-01 | `e2e/maestro/04_personalization_learning.yaml` | 실제 시간 학습, 다음 계획 반영·제외, MVP 지표 생성·초기화 확인 |
| BG-01 | `e2e/maestro/05_background_permission_gate.yaml` | TMAP 실제 경로, 지도 스크롤, 화면 꺼짐 안내, 시스템 위치 권한 화면 진입 |

각 flow는 앱 상태를 독립 초기화한다. J-01의 UI fallback은 릴리스에서 비활성인 `__DEV__` fixture로 결정적으로 검증하며, 실제 Android 권한 팝업 거부는 수동 스모크에서 별도 확인한다. BG-01은 시스템 위치 권한 화면 진입까지만 자동화한다. 민감한 `항상 허용`은 자동 승인하지 않으므로 사용자가 Android 설정에서 직접 승인해야 한다.

## 접근성 점검

연결 폰의 현재 글자 배율을 기록한 뒤 200%로 변경하고 H-01을 실행한다.

```bash
adb shell settings get system font_scale
adb shell settings put system font_scale 2.0
maestro test e2e/maestro/01_first_schedule.yaml
```

검증 후에는 반드시 원래 배율로 복원하고 앱을 재시작한다.

```bash
adb shell settings put system font_scale 1.0
adb shell am force-stop com.ontime.app
adb shell am start -a android.intent.action.VIEW -d ontime:/// com.ontime.app
```

확인 기준은 시간·거리 단위 분리 없음, 핵심 CTA 스크롤 접근 가능, 타임라인 시각 한 줄 유지다. `npm run visual:test`에는 세 viewport의 온보딩 키보드 포커스·Space 실행도 포함한다. TalkBack 실제 읽기 순서·상태 변경 음성의 수동 검증은 사용자 요청으로 현재 작업 계획에서 제외한다.

## 고정 시나리오

`src/data/demo.ts`를 시각/상호작용 검증 fixture로 사용한다.

| ID | 상태 | 기대 결과 |
|---|---|---|
| H-01 | 다음 일정 있음 | 14:00 약속, 12:55 준비 시작, 4분 여유 |
| P-01 | 정상 진행 | 현재 행동과 카운트다운, 다음 행동 표시 |
| P-02 | 6분 지연 | 해결 배너와 변경된 도착 시간 표시 |
| P-03 | 추가 5분 | 남은 계획 즉시 재계산, 변경 단계 표시 |
| B-01 | 플랜 B | 현재 수단을 제외한 대중교통/택시 예상안과 TMAP 도보 실제 경로 비교 |
| C-01 | 완료 | 실제 대비 요약과 다음 계획 추천 |

시간 의존 테스트에서는 시스템 현재 시각 대신 fixture 시각을 주입한다.

## 수동 스모크 테스트

1. 홈의 `새 일정 추가`에서 3단계를 끝낸다.
2. AI 계획에서 시간 요약과 세로 타임라인을 확인한다.
3. 실시간 진행에서 완료 후 현재 단계가 다음 단계로 이동하는지 확인한다.
4. `시간 더 필요`에서 +5분을 선택하고 지연 문구와 변경 표시를 확인한다.
5. 플랜 B에서 예상 대안에 `예상값`, 도보 실호출에 `TMAP 실제 경로`가 표시되고 시간·거리·비용·환승 정보를 확인할 수 있는지 확인한다.
6. 택시의 `변경 내용 확인`을 눌러도 아직 현재 경로가 유지되고, 확인 카드의 `이 경로 적용`을 누른 뒤에만 진행 화면으로 이동하는지 확인한다.
7. 적용 후 앱을 강제 종료·재실행하고 플랜 B를 열어 `현재 경로 · 택시`가 복원되고 택시가 대안 목록에서 제외되는지 확인한다.
8. 완료 화면에서 홈으로 돌아가 데모가 초기화되는지 확인한다.
9. 일정 화면에서 `완료` 탭을 눌러 완료 기록이 표시되는지 확인한다.
10. 플랜 B의 `걷기 최소`를 눌러 걷기 시간이 짧은 예상안이 먼저 정렬되는지 확인한다.
11. 등록 3단계에서 준비 행동을 추가하고 저장된 목록에 나타나는지 확인한다.
12. 설정에서 여유 시간을 변경한 뒤 앱을 다시 열어 선택값이 유지되는지 확인한다.
13. 권한 화면에서 앱 설명을 확인한 뒤에만 위치 권한 요청 버튼을 누른다.
14. 위치를 거부해 수동 출발지를 저장하고 설정 화면에 같은 값과 거부 상태가 표시되는지 확인한다.
15. 위치를 다시 거부해 차단 상태와 기기 설정 이동 버튼이 표시되는지 확인한다.
16. 알림을 거부하거나 앱 알림을 끈 뒤 앱 내 진행 안내 fallback 문구를 확인한다.
17. 진행 화면에서 `이동 경로 보기`를 열고 `도보 · TMAP 경로`, ETA, 약속까지 시간, km/m 거리, 다음 행동이 표시되는지 확인한다.
18. 이동 화면의 `음성 안내 끄기/켜기`를 눌러 문구·접근성 레이블이 함께 바뀌고 앱 오류가 없는지 확인한다.
19. 앱을 백그라운드로 보낸 뒤 복귀해 위치·경로가 재조회되고, 네트워크 차단 시 마지막 안내·임시 경로·재시도 버튼이 유지되는지 확인한다.
20. 신규 설치/저장 초기화 상태에서 온보딩 3장의 다음·이전·건너뛰기를 확인하고 마지막 `첫 일정 만들기`가 일정 등록 1단계에 진입하는지 확인한다.
21. 온보딩 완료 후 앱을 다시 실행해 온보딩이 반복되지 않는지 확인한다.
22. Journey의 `화면 꺼짐 안내 켜기` 전에 위치 사용 간격·로컬 저장·중지 방법이 표시되는지 확인한다.
23. Android 위치 상세 화면에서 `항상 허용`을 선택하고 앱으로 돌아와 `켜짐`과 위치 foreground-service 상단 알림을 확인한다.
24. 앱을 백그라운드로 보내거나 화면을 끈 뒤 새 위치 event에서 마지막 갱신 시각과 음성 전달 상태가 바뀌는지 확인한다.
25. 백그라운드 TTS 실패 시 동일 행동·ETA·거리가 OS 알림으로 전달되는지 확인한다.
26. `화면 꺼짐 안내 끄기`와 목적지 도착에서 foreground service, task 등록, `@on-time/background-journey` 저장값이 모두 제거되는지 확인한다.
27. 새 일정 1단계에서 `음성으로 일정 만들기`를 열고 사전 설명→마이크 녹음→AI 확인 질문→변경 비교를 확인한 뒤, `이 일정에 적용` 전에는 초안이 유지되고 적용 후에만 등록 화면 값이 바뀌는지 확인한다. 마이크 거부와 네트워크 오류에서는 직접 입력·재시도·수동 등록 경로를 확인한다.
28. 일정 화면의 `캘린더` 탭에서 사전 설명을 확인한 뒤 권한을 허용하고, 실제 Google·Apple/iCloud 또는 기기 캘린더의 향후 30일 일정과 공급자 필터가 표시되는지 확인한다.
29. 시간 일정을 선택해 카드 바로 아래 미리보기를 확인하고 `이 일정 가져오기` 전에는 기존 초안이 유지되며, 누른 뒤에만 제목·날짜·시간·장소가 새 일정 1단계에 반영되는지 확인한다.
30. 종일 일정을 가져와 약속 시간이 빈칸이고 시간을 입력하라는 다음 행동이 표시되는지 확인한다. Android APK에는 `READ_CALENDAR`만 포함되고 `WRITE_CALENDAR`가 없는지도 함께 확인한다.
31. 설정의 `Plus 미리보기`에서 완료 3회 전 남은 횟수, 완료 3회 후 가격안 선택, 적용 전 저장 불변, 관심 등록, 앱 재실행 복원, 철회 확인 전 유지와 확인 후 삭제를 확인한다. 화면에는 결제·자동 갱신·연락처 수집이 없고 기능이 출시 후보임이 표시돼야 한다.
32. 설정의 `Phase 0 테스트 결과`에서 사용자 유형을 고르고 공유 항목에 동의한 뒤 운영체제 공유창을 연다. 공유창을 닫은 뒤 `공유하지 않았어요`를 선택하면 성공 지표가 늘지 않고, 다시 공유해 `공유 완료 확인`을 선택한 경우에만 1회 늘어나는지 확인한다.

## Android ARM64 개발 APK

```bash
cd android
./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8083 tcp:8083
```

NAVER 지도 의존성을 받으려면 `app.json`의 `expo-build-properties`에 `https://repository.map.naver.com/archive/maven`이 유지돼야 한다. 지도 타일은 NAVER Cloud Maps의 Android 패키지 허용 설정까지 별도로 검증한다.

## 시각 회귀 매트릭스

각 핵심 화면을 360x800, 390x844, 430x932에서 라이트 모드로 캡처한다. 최소 대상은 홈, 등록 3단계, AI 결과, 캘린더 일정, 정상/지연 진행, 플랜 B, 완료, 설정, Plus 미리보기, Phase 0 테스트 결과다.

### 세 기준 화면 시각 회귀

Playwright 브라우저를 최초 한 번 설치한다.

```bash
npx playwright install chromium
```

기준 이미지와 현재 화면을 비교한다.

```bash
npm run visual:test
```

의도한 디자인 변경을 검토한 뒤에만 기준 이미지를 갱신한다.

```bash
npm run visual:update
```

`playwright.config.mjs`가 Expo web server, 한국 시간대, 고정 모바일 viewport를 준비한다. `e2e/visual/app.visual.spec.mjs`는 홈·등록 3단계·AI 계획·개인화 계획·MVP 지표·Plan B·Journey fallback/화면 읽기·완료·설정·Plus·Phase 0 테스트 결과·정상/지연 진행을 검증하며 기준 PNG는 `e2e/visual/__screenshots__/`에 보관한다. 각 테스트는 가로 넘침과 기준 이미지 대비 0.2% 초과 차이를 실패로 처리한다.

확인 항목:

- 텍스트/CTA 잘림과 겹침 없음
- 키보드 표시 중 다음 CTA 접근 가능
- 하단 내비게이션과 기기 safe area 충돌 없음
- 폰트 200% 확대 시 핵심 상태 문구 유지
- 색상 제거 상태에서도 정상/지연/오류 구분 가능

Maestro 흐름은 `e2e/maestro/`에 두고 고정 시나리오 ID를 테스트 이름에 사용한다.

## 실패 처리

- 테스트를 삭제하거나 완화해 통과시키지 않는다.
- 환경 문제와 제품 회귀를 분리해 기록한다.
- 재현 가능한 최소 fixture를 먼저 추가한 다음 수정한다.
- `npm audit fix --force`는 Expo 호환성을 깨뜨릴 수 있으므로 자동 실행하지 않는다.
