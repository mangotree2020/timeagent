# CLAUDE.md — TimeAgent

작업 규칙의 원본은 `AGENTS.md`다. 아래는 그 규칙을 그대로 적용하며, Claude Code로 이 저장소에서 일할 때 추가로 지킬 실무 메모다.

@AGENTS.md

## 이 저장소에서 자주 쓰는 명령

| 목적 | 명령 | 비고 |
|---|---|---|
| 전체 검증 | `npm run verify` | TypeScript → Expo ESLint → Jest. 완료 조건. |
| 단일 테스트 | `npx jest src/lib/__tests__/<name>.test.ts` | 구현 전 가장 가까운 테스트부터 |
| 시각 회귀 | `npm run visual:test` | 360×800·390×844·430×932, 기준 갱신은 `visual:update` |
| Play 출시 빌드 | `npm run release:android` | 업로드 키(Keychain) 서명 2-ABI AAB+APK, `android/` prebuild 포함 |
| 실기기 검증용 빌드 | `scripts/build-android-release.sh`와 같은 환경 변수로 `./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a` | 약 11분. 같은 업로드 키라 기존 설치 위에 `adb install -r` 가능 |
| Android E2E | `npm run e2e:android` / `e2e:android:smoke` | Maestro, 연결된 기기 필요 |

빌드 성공 판정은 `npm`·`gradlew` 종료 코드가 아니라 로그의 `BUILD SUCCESSFUL`로 한다(`docs/RELEASE_CHECKLIST.md` 8/19 항목 참고).

## 실기기 검증 메모 (Samsung SM-N971N, Android 12)

- 홈 화면은 계속 애니메이션하므로 `uiautomator dump`가 idle을 못 잡고 멈춘다. 화면 계층은 `maestro hierarchy`로 읽고, 탭은 그 bounds로 `adb shell input tap`한다.
- 폰은 패턴 잠금이라 잠금 해제는 사용자에게 부탁해야 한다. 풀린 뒤에는 `settings put global stay_on_while_plugged_in 7`로 켜 두고, 끝나면 0으로 되돌린다.
- 알림·알람 증거는 `adb shell dumpsys alarm`(`window=0 exactAllowReason=permission`이면 정확 알람), `dumpsys notification --noredact`의 `when=`과 `mSoundNotificationKey`/`mVibrateNotificationKey`, `dumpsys audio`의 player 이벤트, logcat의 `FreecessController`·`Deferring alarm`으로 남긴다.
- 사용자가 같은 폰을 실제로 쓰고 있을 수 있다. 알람이 울리면 사용자가 먼저 끄기도 하므로, 터치 로그(`ViewPostIme pointer`)로 누가 눌렀는지 확인한 뒤 결론을 내린다.
- 실기기에서 마이크가 필요한 음성 흐름은 Mac의 `say -v Yuna "…"`로 발화를 대신할 수 있다.

## 기록 관례

- 기능 변경마다 `docs/EXECUTION_PLAN.md`에 `## YYYY-MM-DD 제목 (완료)` 섹션을 추가하고 `Accept / Implement / Verify / Observe / Evidence` 순으로 적는다. Verify에는 테스트 수, 빌드 tasks 수, APK SHA-256, 실기기 관찰을 시각과 함께 남긴다.
- 사용자에게 보이는 검증 절차가 늘면 `docs/HARNESS.md`의 수동 스모크 번호 목록에 항목을 추가한다.
- 출시 산출물은 `artifacts/TimeAgent-<version>-versionCode<code>.{aab,apk}`로 복사하고 `docs/RELEASE_CHECKLIST.md`에 크기·SHA-256·서명·권한을 기록한다(`artifacts/`는 gitignore).
- 새 Android 권한은 `docs/PLAY_DECLARATIONS.md`에 근거와 앱 내 고지 흐름을 적는다.
- 증거 스크린샷은 `tmp/`에 둔다.

## Git

- 이 디렉터리는 저장소 루트가 아니다(루트는 상위 `workspace`). `git status` 경로가 `TimeAgent/…`로 보이는 것이 정상이며, 형제 디렉터리의 파일은 커밋에 넣지 않는다.
- 커밋 제목은 영어 한 문장으로 사용자에게 보이는 결과를 말한다(예: `Ring the step alarm on time even when the phone has put the app to sleep`). 본문은 왜 그렇게 했는지를 적고, 사용자가 요청했을 때만 커밋·푸시한다.
- 사용자에게 보내는 보고와 요약은 한국어로 쓴다.
