# Gemini 일정 도우미 기준선

## 목적과 범위

`gemini-3.1-flash-lite` 운영 회귀를 같은 입력과 판정 규칙으로 확인한다. 실제 사용자 녹음은 사용하지 않는다. 평가셋은 12개 고정 한국어 텍스트와 사용자가 명시적으로 제공한 합성·사전 동의 M4A를 선택적으로 포함한다.

고정 사례는 상대 날짜, KST 자정 경계, 오늘, 명시 날짜, 목적지 수정, 이동수단과 비용 우선순위, 준비 행동 병합·삭제, 날짜·시간 누락 질문, 다회 대화, 현재 스키마가 지원하지 않는 반복 일정의 질문 fallback을 포함한다.

## 실행

텍스트 기준선:

```bash
npm run benchmark:assistant
```

합성 M4A를 포함한 기준선:

```bash
ASSISTANT_BENCHMARK_AUDIO=/absolute/path/to/consented-fixture.m4a npm run benchmark:assistant
```

기본 endpoint는 서울 리전 운영 `assistant` 함수다. 다른 환경은 `ASSISTANT_BENCHMARK_URL`로 명시한다. 스크립트는 API 키를 읽지 않고 공개 Edge Function만 호출한다. 결과는 표준 출력으로만 내며 음성이나 응답을 파일로 저장하지 않는다.

## 판정과 비용 계산

- 구조화 성공: HTTP 200, Edge Function의 JSON 응답 검증 통과, 토큰 사용량 존재.
- 필드 정확도: fixture가 지정한 날짜·시간·enum·준비 시간·질문 여부의 정확 일치. 목적지만 `서울시청`과 `서울 시청` 같은 공백 차이를 동일하게 본다.
- 지연: 클라이언트 요청 시작부터 JSON 수신까지 wall-clock 밀리초. p50/p95는 nearest-rank 방식이다.
- 비용: modality별 입력 토큰과 출력·사고 토큰에 표준 유료 단가를 적용한다. 무료 tier 할인은 반영하지 않는다.

2026-07-28 공식 표준 단가는 텍스트 입력 $0.25/M, 오디오 입력 $0.50/M, 출력 및 사고 토큰 $1.50/M이다. 단가는 변경될 수 있으므로 재측정 전에 [Gemini 공식 가격](https://ai.google.dev/gemini-api/docs/pricing)을 다시 확인한다. 토큰 필드는 [Interactions API의 usage 계약](https://ai.google.dev/api/interactions-api)을 따른다.

## 2026-07-28 운영 기준선

환경: Supabase 서울 리전, `gemini-3.1-flash-lite`, `store: false`, `thinking_level: minimal`, KST 현지 날짜 `2026-07-28`.

| 구분 | 표본 | 구조화 성공 | 사례/필드 정확도 | p50 | p95 | 평균 요청 비용 | 1,000건 예상 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 전체 | 13 | 100% | 13/13 · 33/33 | 1,899ms | 3,244ms | $0.000507 | $0.507 |
| 텍스트 | 12 | 100% | 12/12 | 1,891ms | 2,365ms | $0.000503 | $0.503 |
| Yuna 합성 M4A | 1 | 100% | 1/1 · 5/5 | 3,244ms | 3,244ms | $0.000559 | $0.559 |

음성 1건은 연결과 비용 계산을 확인하는 smoke 기준이다. 다양한 발화 길이·화자·억양·소음 환경의 품질이나 p95를 대표하지 않는다. 모델·프롬프트·응답 스키마·가격이 바뀌면 이 표를 새 실행 결과로 갱신한다.
