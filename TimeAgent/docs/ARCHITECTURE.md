# 기술 구조

## 선택

- Expo SDK 57 / React Native 0.86 / React 19
- TypeScript strict mode
- Expo Router 파일 기반 내비게이션
- React Context로 데모 도메인 상태 관리
- Jest + jest-expo로 순수 시간 계산과 컴포넌트 단위 검증

Expo의 Continuous Native Generation 방식을 유지하고 `ios/`, `android/`는 필요할 때 생성한다.

## 디렉터리

```text
src/
  app/          라우트와 화면 조립
  components/   디자인 시스템과 도메인 UI
  constants/    토큰
  data/         데모 fixture
  lib/          순수 계산 로직과 단위 테스트
  state/        앱 세션 상태
docs/           요구사항, 하네스, 반복 작업 규칙
```

## 목표 도메인 모듈

MVP API 연결 시 다음 경계를 유지한다.

- `schedule`: 일정 입력, 준비 루틴, 타임라인
- `planning`: 준비 시작/출발/도착 계산과 재계산
- `mobility`: 경로, 교통, 비용, 플랜 B
- `progress`: 현재 단계, 완료, 지연, 건너뛰기, 복귀
- `notifications`: 준비/단계 종료/출발/교통 변경 알림
- `task-execution`: 음성 할 일의 최대 3개 행동 분해, 5분 집중 종료 시각, 현재/다음/완료 상태와 로컬 영속화
- `profile`: 기본 위치, 루틴, 이동 우선순위, 권한

UI는 원시 지도/교통 응답을 직접 사용하지 않고 도메인 모델을 받는다.

## 상태 지속성

진행 세션은 AsyncStorage에 저장한다. 일정·계획·타임라인, 현재 단계 ID, 단계 시작 시각, 단계 제한 시간, 적용 경로, 누적 지연, 마지막 재계산 시각을 저장한다. 복원 시 저장된 남은 초를 신뢰하지 않고 실제 경과 시간을 반영해 타이머를 보정한다. 예정 시간이 지나도 사용자 확인 없이 단계를 자동 완료하지 않는다.

지연 선택은 저장 세션과 분리된 메모리 제안 모델로 먼저 계산한다. 제안에는 준비 총시간·출발·예상 도착의 변경 전후만 담고, 사용자가 적용을 선택한 경우에만 누적 지연과 마지막 재계산 시각을 진행 세션에 기록한다. 거절하거나 화면을 닫으면 제안만 폐기한다.

## 외부 연동 경계

- 지도 표시는 NAVER Maps adapter로 격리한다.
- 장소 좌표화는 NAVER Maps Geocoding 계층으로 분리한다.
- 도보 경로는 TMAP pedestrian routing adapter가 서버 프록시를 통해 호출한다.
- TMAP App Key는 React Native 번들에 포함하지 않는다. 앱은 TimeAgent 서버의 정규화된 mobility endpoint만 호출한다.
- NAVER/TMAP 원시 응답은 UI에 노출하지 않고 공통 `RoutePlan` 도메인 모델로 변환한다.
- AI 출력은 구조화 스키마로 검증하고 설명 문구와 계산 결과를 분리한다.
- 알림 예약 ID를 일정/단계와 함께 저장해 완료 또는 변경 시 이전 알림을 취소한다.
- 위치/알림 권한은 기능 진입 전에 이유를 설명하고 거부 시 수동 입력 경로를 제공한다.

권한 adapter는 `expo-location`과 `expo-notifications` 응답을 `undetermined`, `granted`, `denied`, `blocked`, `error` 상태로 정규화한다. 위치 거부 시 기본 출발지는 AsyncStorage의 수동 입력값을 사용하고, 알림의 운영체제 권한과 앱 내부 알림 사용 설정은 별도로 관리한다. 설정 화면이 다시 활성화될 때 운영체제 권한을 재조회해 외부 설정 변경을 반영한다.

세부 계약과 키 관리 원칙은 `docs/INTEGRATIONS.md`를 따른다.
