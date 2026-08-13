# TimeAgent Android 출시 체크리스트

## 현재 준비 완료

- 패키지명 `com.timeagent.app`, 현재 배포 준비 버전 `1.0.3`, versionCode `4`
- targetSdk/compileSdk 36
- Google 로그인, 로그아웃, 계정 연결 해제 및 기기 데이터 삭제 UI
- 앱 내 개인정보처리방침·이용약관
- 백그라운드 위치 명확한 고지 및 사용자가 켜고 끄는 흐름
- 업로드 키로 서명한 AAB/APK 빌드 스크립트
- Play 등록 문안, 데이터 보안·권한 선언 초안, 스토어 이미지
- 웹 개인정보처리방침·약관·계정 삭제 안내 페이지 빌드 성공
- NAVER Cloud Maps `TimeAgent`의 Dynamic Map·Directions 5·Geocoding·Reverse Geocoding 활성화 및 Android 허용 패키지 `com.timeagent.app` 저장
- Google Play 앱 `TimeAgent` 생성 완료(app ID `4973085320407227118`) 및 Play App Signing 약관 동의
- 최신 서명 AAB를 내부 테스트 트랙에 업로드하고 `1.0.0 내부 테스트` 버전을 2026-08-12 10:18에 게시
- 내부 테스트 참여 링크: `https://play.google.com/apps/internaltest/4700868299529463503`
- Play Console 개인정보처리방침, 광고 없음, 정부 앱 아님, 금융 기능 없음, 건강 기능 없음, 광고 ID 미사용 선언 저장
- 내부 테스트 목록 `TimeAgent 내부 테스터`를 생성하고 `mangonetwork@mangonw.com`을 등록하여 내부 테스트 트랙을 활성화
- 스토어 공개 지원 이메일 `mangotree@mangonw.com` 게시 및 앱 카테고리 `생산성` 저장
- Play 심사용 `mangonetwork@mangonw.com` 로그인 정보와 영문 전체 접근 안내 저장
- IARC 콘텐츠 등급 설문 완료: 생성형 AI에 따른 온라인 콘텐츠를 신고하고 대한민국 `3세 이상` 등급 획득
- 타겟층을 `만 18세 이상`으로 저장
- 실제 Android 기기에서 백그라운드 이동 안내 활성화, 명확한 고지, 시스템 `항상 허용`, 활성 상태를 보여 주는 25초 심사용 영상을 생성
- 심사용 영상을 `WOOCHUL SHIN` YouTube 채널에 `일부 공개`로 게시: `https://youtu.be/P8qOTB5MJRY`

## 남은 외부 조건 및 확인 항목

1. `TimeAgent 내부 테스터` 목록에 `silverstar0977@gmail.com`을 포함한 유효한 이메일 19개가 저장됐다. `statstar6095@gmail.com`과 `sbl2004pa@gmalil.com`은 Play가 존재하지 않는 주소로 판정해 제외했다.
2. Alpha가 활성화됐으며 2026-08-12 현재 Play 대시보드에서 참여를 선택한 테스터 7명이 확인됐다. Gmail에 준비된 초대 초안을 검토·발송하고 등록된 계정 중 5명 이상이 추가로 참여하도록 안내한다. 이메일 목록에 추가하는 것만으로는 참여 인원으로 집계되지 않는다.
3. 12명 이상이 참여한 상태를 14일 연속 유지한 뒤 프로덕션 액세스를 신청한다.
4. Play 심사용 계정 `mangonetwork@mangonw.com`의 비밀번호를 심사 완료 전까지 유지하고 2단계 인증을 다시 켜지 않는다. 로그인 정보와 접근 지침은 Console에 저장했다.
5. Google 앱 검토는 완료됐으며 Alpha `1.0.0`이 활성 상태다. 후속 정책 또는 품질 알림이 발생하면 해당 항목을 수정한다.
6. Google Play 웹에서 `Samsung SM-S931N` 설치 완료를 확인했다. USB 연결된 `Samsung SM-N971N`도 현재 Google Play 설치본 `1.0.0 (1)`이며 Android 12에 전달된 APK는 이전 앱 서명 키 `C3:A9:BA:67:0B:12:A2:C3:8B:9A:C9:49:AB:1A:DD:03:8C:D8:68:57`을 사용한다. 이전 키용 Android OAuth 클라이언트를 추가한 뒤 `mangotree@mangonw.com` 로그인, 홈 진입, 강제 종료·재실행 세션 복원, 설정 이메일 표시를 확인했다.

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

## 2026-08-12 Play 업로드 산출물

- 업로드 AAB: `android/app/build/outputs/bundle/release/app-release.aab` (약 65MB)
- AAB SHA-256: `00d37cd7cdaa2466a856273c36fdc042f1c58971c27913b017156de8e9a3848a`
- Play 분석 결과: 최소 API 24, 대상 API 36, 예상 설치 크기 39.6MB
- 비공개 테스트 버전: Alpha `1 (1.0.0)`, versionCode `1`, Google 검토 완료, 최신 출시 버전으로 활성화
- 비공개 테스트 웹 참여 링크: `https://play.google.com/apps/testing/com.timeagent.app`
- 비공개 테스트 이메일 목록: `TimeAgent 내부 테스터`, 유효한 18명 저장 및 참여 선택 7명 확인
- Play 현재 앱 서명 SHA-1: `38:97:2A:ED:75:B3:F8:74:C3:D2:6A:3D:24:32:37:EA:05:B1:39:06`
- Play 이전 앱 서명 SHA-1(Android 12 실설치 확인): `C3:A9:BA:67:0B:12:A2:C3:8B:9A:C9:49:AB:1A:DD:03:8C:D8:68:57`
- Google Cloud 이전 키 Android OAuth: `TimeAgent Android Play Previous Key`, `18828044372-9h162r7cbub3d63375mt7cua2gan815p.apps.googleusercontent.com`
- Google Cloud Android OAuth: `TimeAgent Android Play`, `18828044372-fcs2rber93fj8vo5rj7p7ioisu59h0oe.apps.googleusercontent.com`, 패키지 `com.timeagent.app`, Play 앱 서명 SHA-1 등록 완료
- 제출 후 로컬 검증: `npm run verify` 성공(TypeScript, Expo lint, Jest 34개 스위트·185/185)
- 백그라운드 위치 심사용 영상: `artifacts/play-store/timeagent-location-review.mp4` (25.20초, H.264, 1080×2280)
- 영상 SHA-256: `1581677b697c32a24de11f93d4e9b3b2af00394de794cd8b92949c0e12a2e532`
- YouTube 일부 공개 URL: `https://youtu.be/P8qOTB5MJRY`

## 2026-08-13 Google 로그인 복구 재배포 산출물

- 원인: OAuth 대상의 테스트 사용자 제한은 프로덕션 게시로 해소했지만, Samsung Android 12의 Play 설치 APK에는 Google Cloud에 등록되지 않은 Play `이전 앱 서명 키` SHA-1 `C3:A9:…:68:57`이 사용돼 `UNREGISTERED_ON_API_CONSOLE`이 발생했다.
- 조치: 기존 현재 앱 서명 키 `38:97:…:39:06` OAuth 클라이언트는 보존하고, 같은 패키지 `com.timeagent.app`의 이전 키 전용 Android OAuth 클라이언트를 추가한다. `npm run auth:doctor`가 연결된 설치본의 installer·버전·실제 서명을 함께 출력하도록 보강했다.
- AAB: `artifacts/TimeAgent-v1.0.1-release.aab`
- AAB SHA-256: `a70ee86958406ad744cfcf9568a0e03ee777fd20f7314b67c0f5f013f5b43f0c`
- APK: `artifacts/TimeAgent-v1.0.1-release.apk`
- APK SHA-256: `9d7a06ad789370ed07ea8108fda15aa30ddc2905b1f1e03d1b2f123d822101ed`
- 검증: `npm run auth:doctor`, `npm run verify` 성공(TypeScript, Expo lint, Jest 35개 스위트·188/188)
- Play 상태: Alpha versionCode 2 임시 출시 화면 준비 완료. Chrome 확장 프로그램의 로컬 파일 접근 권한 활성화 후 AAB 업로드·검토 제출이 남아 있다.

## 2026-08-13 Alpha 1.0.3 테스트 배포 산출물

- 버전: `1.0.3 (4)`, 패키지 `com.timeagent.app`, targetSdk 36
- AAB: `android/app/build/outputs/bundle/release/app-release.aab` (68,452,360 bytes)
- AAB SHA-256: `13123a57334a8612910536c95369e6a3ab3205b08cc9b543b9b1ce7ecd445701`
- APK: `android/app/build/outputs/apk/release/app-release.apk` (117,293,033 bytes)
- APK SHA-256: `1409dc109a82ca04941318eb9f309ca54287f9a05474ade0eee2ba9a92d60605`
- 검증: `npm run verify` 성공(TypeScript, Expo lint, Jest 35개 스위트·192/192), APK Signature Scheme v2 서명 확인
- 테스터: `silverstar0977@gmail.com` 추가 완료, `TimeAgent 내부 테스터` 유효 목록 19명
- Play 상태: Alpha 임시 버전 편집 화면 준비 완료. Chrome ChatGPT 확장 프로그램의 `Allow access to file URLs` 권한 활성화 후 AAB 업로드·검토 제출이 남아 있다.

## 남은 기술 위험

- `npm audit --omit=dev`는 1 high, 12 moderate를 보고한다. high는 Jest 경로의 `brace-expansion`, moderate는 주로 Expo 설정/CLI 도구 체인이다. 자동 제안이 현재 SDK 57에서 Expo 46으로의 호환되지 않는 변경을 포함하므로 `--force` 수정은 적용하지 않았다. Expo가 호환 패치를 제공하면 다시 점검한다.
- NAVER Maps SDK 3.23.2에서 D8 stack-map 경고가 반복되지만 release 빌드와 lint는 성공했다. 내부 테스트에서 지도 실행과 crash/ANR을 확인한다.
- Google Cloud Android OAuth 클라이언트에 Play 앱 서명 SHA-1을 등록했다. 비공개 테스트 배포본에서 Google 로그인 실동작을 확인해야 한다.
- iOS는 bundle ID/build number만 예약했다. iOS OAuth 클라이언트, Xcode 서명, App Store Connect 정책 제출은 별도 출시 작업이다.
