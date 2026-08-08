# TimeAgent Android 출시 체크리스트

## 현재 준비 완료

- 패키지명 `com.timeagent.app`, 버전 `1.0.0`, versionCode `1`
- targetSdk/compileSdk 36
- Google 로그인, 로그아웃, 계정 연결 해제 및 기기 데이터 삭제 UI
- 앱 내 개인정보처리방침·이용약관
- 백그라운드 위치 명확한 고지 및 사용자가 켜고 끄는 흐름
- 업로드 키로 서명한 AAB/APK 빌드 스크립트
- Play 등록 문안, 데이터 보안·권한 선언 초안, 스토어 이미지
- 웹 개인정보처리방침·약관·계정 삭제 안내 페이지 빌드 성공
- NAVER Cloud Maps `TimeAgent`의 Dynamic Map·Directions 5·Geocoding·Reverse Geocoding 활성화 및 Android 허용 패키지 `com.timeagent.app` 저장

## 사람이 완료해야 하는 차단 항목

1. 새 개인 Play Console 개발자 계정(`winddew71@gmail.com`, 개발자명 `신우철`, 계정 ID `5696577809125551196`) 생성과 신분증 제출은 완료됐다. 2026-08-07 14시 기준 Console에서 `Google에서 신원 확인 중입니다`를 재확인했다. 승인 후 연락처 전화번호 인증을 완료해야 앱 만들기 잠금이 해제된다. 실제 Android 휴대기기 확인 항목은 현재 미완료 목록에서 사라졌다.
2. 새 Console에서 앱을 만들고 Play App Signing에 등록한 뒤, `앱 서명 키 인증서` SHA-1을 Google Cloud의 Android OAuth 클라이언트에 추가한다. 업로드 키 SHA-1과 Play 앱 서명 SHA-1은 다르다.
3. 운영 지원 이메일과 개인정보 문의 연락처를 확정한다.
4. 공개 배포된 `https://timeflow-landing.wcshin.chatgpt.site/privacy`를 Play Console 개인정보처리방침 URL에 등록한다. 이용약관은 `/terms`, 계정 삭제 안내는 `/delete-account`에서 HTTP 200 응답을 확인했다.
5. Play 심사용 Google 계정과 접근 지침을 준비한다.
6. 백그라운드 위치 및 foreground-service 실제 기기 영상을 촬영해 선언에 첨부한다.
7. 운영 Supabase·Gemini·지도 공급자의 보존/로그 정책을 확인하고 데이터 보안 답변을 확정한다.

## 빌드와 키 관리

```bash
npm run release:android
```

- 업로드 키: `.release/timeagent-upload.jks` (Git 제외, Expo prebuild가 지우는 `android/` 밖에 보관)
- 별칭: `timeagent-upload`
- 암호: macOS Keychain 서비스 `com.timeagent.app.upload-keystore`, 계정 `TimeAgent`
- JDK: `TIMEAGENT_JAVA_HOME` 또는 macOS의 독립 Oracle JDK 17을 사용한다. 로컬 JetBrains Runtime 17.0.9는 AArch64 lint 중 JVM 크래시가 확인되어 출시 스크립트에서 제외한다.
- 키 파일과 Keychain 암호를 서로 다른 보안 저장소에 백업한다. 암호를 저장소·문서·메신저에 기록하지 않는다.
- 매 출시마다 `versionCode`를 증가시키고 사용자용 `version`을 결정한다.

## 업로드 전 확인

```bash
npm ci
npm run verify
npx expo-doctor
npm run visual:test
npm run release:android
```

1. AAB 서명과 SHA-256을 확인한다.
2. 최종 APK/AAB의 권한 목록을 확인한다.
3. Play 내부 테스트 트랙에 AAB를 업로드한다.
4. Play 배포본에서 Google 로그인, 오늘 일정, 일정 생성, 성별별 준비 기본값, 알림, 위치 거부, 백그라운드 위치 중지를 확인한다.
5. 비공개 테스트 피드백과 Android Vitals의 crash/ANR을 확인한 뒤 공개 범위를 늘린다.

## 2026-08-07 생성 산출물

- AAB: `artifacts/TimeAgent-v1.0.0-release.aab` (약 65MB, 홈 날씨 포함)
- AAB SHA-256: `365eac1b44daaf74116ceed093ffc9866c34126af8e9ff8aded6875efb71bb83`
- APK: `artifacts/TimeAgent-v1.0.0-release.apk` (약 112MB, arm64-v8a·armeabi-v7a 실기기 검증본)
- APK SHA-256: `8589acee7e6e26a40da775d1d8724813ab5b259276e62dd72b8df0e1269b1730`
- 업로드 인증서 SHA-1: `05:0B:58:2C:0B:D8:6F:80:CF:19:60:A6:4D:F9:02:51:7B:41:8E:B1`
- 업로드 인증서 SHA-256: `8F:0D:B5:A5:2D:A5:3F:CA:29:F2:D7:BA:19:7A:E8:6B:5B:AD:00:52:C8:4A:48:5C:9C:5C:4F:6A:68:D8:2F:A2`
- 포함 ABI: `arm64-v8a`, `armeabi-v7a`

최종 manifest에서 외부 저장소, 화면 오버레이, 캘린더 쓰기, 백그라운드 미디어 재생 권한이 없고 `allowBackup=false`임을 확인했다.

## 남은 기술 위험

- `npm audit --omit=dev`는 1 high, 12 moderate를 보고한다. high는 Jest 경로의 `brace-expansion`, moderate는 주로 Expo 설정/CLI 도구 체인이다. 자동 제안이 현재 SDK 57에서 Expo 46으로의 호환되지 않는 변경을 포함하므로 `--force` 수정은 적용하지 않았다. Expo가 호환 패치를 제공하면 다시 점검한다.
- NAVER Maps SDK 3.23.2에서 D8 stack-map 경고가 반복되지만 release 빌드와 lint는 성공했다. 내부 테스트에서 지도 실행과 crash/ANR을 확인한다.
- 현재 Google OAuth는 개발/업로드 인증서만으로 완결되지 않는다. Play App Signing 등록 후 Play 앱 서명 SHA-1을 추가해야 배포본 로그인이 동작한다.
- iOS는 bundle ID/build number만 예약했다. iOS OAuth 클라이언트, Xcode 서명, App Store Connect 정책 제출은 별도 출시 작업이다.
