# ON:TIME

약속 시간과 장소를 입력하면 준비 시작부터 도착까지 계획하고, 지연이 생기면 남은 행동과 이동 경로를 다시 계산하는 React Native 앱입니다.

현재 저장소에는 Expo Router 기반의 실행 가능한 UI 세로 슬라이스가 포함되어 있습니다.

- 홈 → 3단계 일정 등록 → AI 계획 생성 결과
- 실시간 카운트다운과 단계 완료/추가 시간 처리
- 플랜 B 3안 비교와 경로 적용
- 일정 완료 회고
- 일정, 알림, 설정 탭

## 빠른 시작

Node.js 20 이상이 필요합니다. 이 환경에서는 Node.js v24 LTS로 검증했습니다.

```bash
npm install
npm start
```

터미널에서 `i`(iOS), `a`(Android), `w`(web)를 누르거나 다음 명령을 사용합니다.

```bash
npm run ios
npm run android
npm run web
```

Expo SDK 57 전환기에는 실제 기기의 Expo Go가 구형 SDK일 수 있으므로, SDK 57 개발 빌드 또는 iOS/Android 시뮬레이터 사용을 권장합니다.

## 품질 확인

```bash
npm run verify
```

개별 명령은 `npm run typecheck`, `npm run lint`, `npm test`입니다. 작업 방식과 합격 기준은 [개발 하네스](docs/HARNESS.md), 반복 실행 규칙은 [Ralph Loop](docs/RALPH_LOOP.md)를 따릅니다.

## 문서 지도

- [제품 요구사항](docs/PRODUCT.md)
- [디자인 시스템](docs/DESIGN_SYSTEM.md)
- [기술 구조](docs/ARCHITECTURE.md)
- [지도·경로 연동](docs/INTEGRATIONS.md)
- [개발 하네스](docs/HARNESS.md)
- [Ralph Loop](docs/RALPH_LOOP.md)
- [실행 계획 및 백로그](docs/EXECUTION_PLAN.md)

## 기준 자료

- [공유 대화: Codex 앱 개발 가이드](https://chatgpt.com/share/6a61587f-9a70-83e8-adb0-f5a710461fcf)
- `/Users/winddew/Downloads/AI 일정 알람 앱 UI-UX 기획 요구사항.pdf`
- `/Users/winddew/Downloads/ON-TIME 통합안.html`

구현 기준은 HTML의 마지막 통합안인 **Timeline Coach**입니다. 타임라인 중심 구조에 큰 카운트다운과 짧은 AI 코치 설명을 결합합니다.

지도 표시는 NAVER Maps, 도보 경로 계산은 TMAP API를 사용합니다. 실제 키는 `.env.example`을 참고해 로컬 환경 또는 서버 비밀 저장소에만 설정합니다.
