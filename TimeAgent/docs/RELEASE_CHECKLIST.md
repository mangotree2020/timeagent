# TimeAgent Android 출시 체크리스트

## Play 개발자 계정 (2026-08-14 확인)

TimeAgent가 있는 계정은 **`winddew71@gmail.com`의 개발자 계정 `신우철`**이다. 개발자 계정 ID는 `5696577809125551196`, Play 앱 ID는 `4973085320407227118`이다. Play Console 접속 시 이 Google 계정으로 로그인해야 하며 URL은 `/console/u/1/developers/5696577809125551196/app/4973085320407227118/...` 형태다.

`mangotree@mangonw.com`에도 개발자 계정 `Manna & Talent`(ID `5249459948074470432`)가 있지만 **2026-02-22에 미사용 사유로 해지**됐다. 이 계정으로 로그인하면 모든 앱 URL이 정책 상태 페이지로 리다이렉트되므로 출시 작업에 사용하지 않는다. 등록 수수료는 환불되지 않으며 이 계정으로 다시 게시하려면 새 계정을 만들어야 한다. `mangotree@mangonw.com`은 앱의 공개 지원 이메일이자 테스터 계정으로만 계속 사용한다.

## 현재 준비 완료

- 패키지명 `com.timeagent.app`, 현재 배포 준비 버전 `1.0.4`, versionCode `5`
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

1. `TimeAgent 내부 테스터` 목록에 유효한 이메일 24개가 저장됐다. 2026-08-16에 5명을 추가했으며 `dongyong5717@gmail.com`은 Play가 유효하지 않은 계정으로 판정해 제외했다. 기존 `statstar6095@gmail.com`과 `sbl2004pa@gmalil.com`도 존재하지 않는 주소로 판정돼 제외했다.
2. Alpha가 활성화됐으며 2026-08-12 현재 Play 대시보드에서 참여를 선택한 테스터 7명이 확인됐다. Gmail에 준비된 초대 초안을 검토·발송하고 등록된 계정 중 5명 이상이 추가로 참여하도록 안내한다. 이메일 목록에 추가하는 것만으로는 참여 인원으로 집계되지 않는다.
3. ~~12명 이상이 참여한 상태를 14일 연속 유지한 뒤 프로덕션 액세스를 신청한다.~~ 2026-08-26 사업자 계정 전환으로 요건 해소, 프로덕션 출시됨.
7. Play Console 개인정보처리방침 URL은 `https://timeflow-landing-mangotree-4133s-projects.vercel.app/privacy`로 교체됐다(2026-08-26 사용자 확인).
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

## 2026-08-14 Alpha 1.0.4 업로드 (파일 전송 대기)

- 앱 버전을 `1.0.4`, versionCode `5`로 올리고 `npm run verify` 35개 스위트·214/214를 통과시킨 뒤 서명 AAB/APK 760개 작업 빌드를 완료했다. AAB SHA-256은 `dd9a87ea7d6bef6c7c6cba1f83fb6148cce8b5993b2ed842115515ba8bf5b6f5`, APK SHA-256은 `c4956250195fdd2ea1bb8b453d16aff17d9ef1801ac123d19cf8d9665c7075a7`이다. APK에서 `com.timeagent.app`, `1.0.4 (5)`, targetSdk 36, 업로드 키 `CN=TimeAgent Upload` 서명을 확인했다.
- Play Console의 비공개 테스트 Alpha 트랙에는 이전 시도에서 남은 임시 버전이 있어 `새 버전 만들기` 대신 `버전 수정`으로 이어받는다. 트랙 URL은 `.../tracks/4698283980079925864`이며 현재 활성 버전은 `1 (1.0.0)`이다.
- 업로드 화면까지는 브라우저 자동화로 도달했으나 **AAB 68MB가 브라우저 업로드 도구의 10MB 한도를 넘어 파일 전송을 자동화할 수 없다.** `업로드` 버튼은 운영체제 파일 선택창을 열어 자동화 대상이 아니다. 끌어다 놓기 쉽도록 `artifacts/TimeAgent-1.0.4-versionCode5.aab`로 복사해 두었고, 사람이 직접 업로드한 뒤 출시 노트를 입력하고 검토를 제출했다.
- 업로드 뒤 Play가 `이 App Bundle 유형과 연결된 가독화 파일이 없습니다`를 안내하지만 이 앱은 난독화를 쓰지 않으므로 무시한다. `android/app/build.gradle`의 `enableMinifyInReleaseBuilds` 기본값이 `false`이고 `android/gradle.properties`에 해당 속성이 없어 `minifyEnabled false`로 빌드되며, 매핑 파일이 생성되는 `android/app/build/outputs/mapping/release/` 디렉터리 자체가 없다. 스택 트레이스는 이미 읽을 수 있는 형태다. 용량을 줄이려고 minify를 켜려면 NAVER 지도와 Nitro Google Signin처럼 리플렉션을 쓰는 모듈의 ProGuard 규칙 검증과 실기기 재확인이 필요하다.
- 2026-08-14 `5 (1.0.4)`를 비공개 테스트 Alpha에 `전체 출시 시작`으로 제출했다. 대시보드 업데이트 상태는 `검토 중`이며 `관리형 게시`가 사용 중지 상태라 검토를 통과하면 테스터에게 자동 배포된다. 같은 트랙에 새 버전을 올려도 프로덕션 액세스의 14일 카운트는 초기화되지 않았다.

## 2026-08-19 비공개 테스트 1.0.6 빌드 (업로드 대기)

- 버전 `1.0.6 (7)`, 패키지 `com.timeagent.app`, targetSdk 36, ABI `arm64-v8a`·`armeabi-v7a`. Play에 올라간 최신 버전은 `1.0.4 (5)`라 versionCode를 더 올리지 않고 그대로 제출한다.
- AAB: `artifacts/TimeAgent-1.0.6-versionCode7.aab` (68,495,065 bytes)
- AAB SHA-256: `48267b62c29fde968752d9de29cc9871c81ae6ea5570cb166c2f96460a361daf`
- APK: `artifacts/TimeAgent-1.0.6-versionCode7.apk` (117,384,581 bytes)
- APK SHA-256: `041d8b0df6553ed638905d8f98810f2c3174a481d18df79a02d7bb55d547e376`
- 서명: `CN=TimeAgent Upload`, SHA-1 `05:0B:58:2C:0B:D8:6F:80:CF:19:60:A6:4D:F9:02:51:7B:41:8E:B1`, SHA-256 `8F:0D:B5:A5:…:68:D8:2F:A2`. 기록된 업로드 인증서와 일치하며 APK Signature Scheme v2로 서명됐다.
- 권한: `READ_CALENDAR` 유지, `WRITE_CALENDAR`·외부 저장소·화면 오버레이 없음, `allowBackup=false`.
- 검증: `npm run verify` 성공(TypeScript, Expo lint, Jest 44개 스위트·442/442).
- 실기기 확인(SM-N971N, 부산 해운대): 음성 `내일 오후 3시 홍대입구역에서 회의` → `홍대입구역이라는 곳이 이 근처에는 없어서 전국에서 찾았어요`와 홍대입구역 3건(모두 333km)이 뜨고 자동 입력은 없다. 후보를 고르면 목적지·지도·최근 장소에 반영된다. 근처 이름 `서면역`은 질문 없이 즉시 확정돼 이전 동작이 유지된다.
- Play 업로드는 사람이 직접 해야 한다. AAB 68MB가 브라우저 업로드 도구의 10MB 한도를 넘고 `업로드` 버튼이 운영체제 파일 선택창을 열기 때문이다. 끌어다 놓을 파일은 `artifacts/TimeAgent-1.0.6-versionCode7.aab`다.
- 프로덕션 액세스 요건(테스터 12명 이상·14일 연속)은 아직 진행 중이므로 이번에도 비공개 테스트 Alpha 트랙에 올린다. 남은 일수는 Play Console 대시보드에서 다시 확인한다.

## 2026-08-26 프로덕션 후보 1.0.10 제출본 (업로드 완료·Play 검토 중)

앞의 8/22 `1.0.9 (9)` 제출본을 대체한다. 커밋 `ab57cef`(스플래시 아이콘 20% 축소), `3fbd838`(대중교통 공급자 분리·약속 시각 기준 TMAP 시간표 경로·TAGO 첫 탑승 실시간 도착·NAVER/카카오맵 연결·`이동 시간 근거` 카드, 준비 행동 시간 좌우 드럼), `289cd2e`(mobility Edge Function 배포 기록)가 포함됐다.

- 버전 `1.0.10 (10)`, 패키지 `com.timeagent.app`, targetSdk 36, minSdk 24, ABI `arm64-v8a`·`armeabi-v7a`
- AAB: `artifacts/TimeAgent-1.0.10-versionCode10.aab` (68,721,854 bytes)
- AAB SHA-256: `bfc53ae9cf9e559a8e09aa5b4d26430f688bc846001b39c671e9aed7778ae983`
- APK: `artifacts/TimeAgent-1.0.10-versionCode10.apk` (117,731,349 bytes)
- APK SHA-256: `8cf2ce8df48c152079bc8fcb500c15923aa167ef891ae7ea23e4e9c35327622c`
- 서명: `CN=TimeAgent Upload` SHA-1 `05:0B:58:2C:0B:D8:6F:80:CF:19:60:A6:4D:F9:02:51:7B:41:8E:B1`, AAB(`jarsigner` verified)·APK(`apksigner`) 동일
- 권한: 1.0.9와 동일 — `READ_CALENDAR`, `SCHEDULE_EXACT_ALARM`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, 위치(전경·백그라운드·FGS), `RECORD_AUDIO`, 알림. 새 권한 없음(외부 지도 연결은 `Linking.openURL`로 앱 스킴을 시도하고 실패 시 웹으로 넘어가므로 `<queries>` 선언 불필요). `WRITE_CALENDAR`·외부 저장소·화면 오버레이 없음.
- 빌드: `npm run release:android`, Gradle 797 tasks `BUILD SUCCESSFUL`(9분 44초, 12:36~12:46), `npm run verify` 56스위트·574/574, 시각 회귀 237 passed
- 서버: mobility Edge Function은 TAGO 공공데이터포털 계정키 폴백을 포함해 재배포됐다. 2026-08-27 버스도착정보·버스정류소정보 개발계정이 모두 승인됐고 `/health`는 `realtimeArrivals: configured`다. 00:13 KST `/v1/arrivals` 실호출에서 서면역 정류소·31번의 `realtime` 응답(정류소 ID, 도착예정 초, 남은 정류장 수)을 수신했다. 심야 값 9,973초·99정류장은 다음 운행편/공급자 센티널 가능성이 있어 주간 앱 표시를 추가 관찰한다. TMAP 대중교통 API는 00:02 KST 재확인에도 429라 한도 주기·사용량을 콘솔에서 확인해야 한다.
- 실기기(SM-N971N, Android 12): 같은 코드의 arm64 APK(`191c2607…`)로 좌우 드럼(12→15분)과 네이버 지도·카카오맵 연결을 확인했다. 이 2-ABI AAB/APK 자체의 기기 설치는 하지 않았다.
- Play 업로드는 사람이 직접 한다(AAB 68MB가 브라우저 업로드 도구 한도를 넘음). 끌어다 놓을 파일은 `artifacts/TimeAgent-1.0.10-versionCode10.aab`다. → 2026-08-26 사용자 보고: 개발자 계정을 사업자 계정으로 전환해 비공개 테스트 12명·14일 요건이 사라졌고, `1.0.9 (9)`가 프로덕션에 출시된 상태다. `1.0.10 (10)` AAB는 프로덕션 트랙에 업로드되어 Play 검토 중이다. 검토 통과 후 `이동 시간 근거` 카드의 `TMAP 시간표 기준` 근거를 프로덕션 설치본에서 확인한다.
- 2026-08-26 23:01 KST 재확인: `/health` ok, `/v1/routes/estimates` 200, `/v1/routes/transit` 503 — TMAP 대중교통 API 직접 호출도 `429 QUOTA_EXCEEDED`(도보·자동차 API는 정상). 한도 초기화(KST 자정 추정) 뒤 다시 확인한다. `TAGO_SERVICE_KEY` 발급 절차는 `docs/EXECUTION_PLAN.md` 2026-08-26 마지막 항목.
- Play 데이터 안전 섹션 변경 없음(경로·도착 조회는 좌표만 서버로 보내며 원문 위치·검색어를 저장·집계하지 않는다, `docs/PRODUCT.md` 오류·비용·데이터 기준).

## 2026-08-22 비공개 테스트 1.0.9 제출본 (업로드 대기)

앞의 8/20 `1.0.8 (8)` 빌드를 대체한다. 커밋 `c098800`이 포함됐다: 준비 단계 종료 알람(끌 때까지 울리고 끄면 완료)·1분 전 예고·자동 시작 시 진행 화면 열림·음성 이동수단 탭 후 안내, 그리고 정확한 시각 알람(`SCHEDULE_EXACT_ALARM`)과 배터리 최적화 예외(`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) 상태를 보여 주는 `준비 알람 정확도` 카드, 종료 알람이 다음 단계 안내보다 4초 먼저 울리는 예약 순서다.

- 버전 `1.0.9 (9)`, 패키지 `com.timeagent.app`, targetSdk 36, minSdk 24, ABI `arm64-v8a`·`armeabi-v7a`
- AAB: `artifacts/TimeAgent-1.0.9-versionCode9.aab` (68,518,986 bytes)
- AAB SHA-256: `e421ffa7082b56497e6e6b4e4aeaf899d1e32bb7dfd5458426a82d370c3b2b6c`
- APK: `artifacts/TimeAgent-1.0.9-versionCode9.apk` (117,490,273 bytes)
- APK SHA-256: `a8336982dc41a42880b76b51161ddfdeb8575164002febba6ebdb497e0baade2`
- 서명: `CN=TimeAgent Upload` SHA-1 `05:0B:58:2C:0B:D8:6F:80:CF:19:60:A6:4D:F9:02:51:7B:41:8E:B1`, AAB·APK 동일, APK Signature Scheme v2
- 권한: `READ_CALENDAR` 유지, 새로 `SCHEDULE_EXACT_ALARM`·`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 추가(AAB manifest에서 확인), `WRITE_CALENDAR`·외부 저장소·화면 오버레이 없음. 근거와 앱 내 고지 흐름은 `docs/PLAY_DECLARATIONS.md`의 "정확한 시각 알람·배터리 최적화 예외" 항목이며, Play Console의 별도 선언 양식은 `USE_EXACT_ALARM`에만 있어 이 빌드에는 해당하지 않는다. 심사에서 배터리 최적화 예외 요청 근거를 물으면 같은 문안을 쓴다.
- 빌드: `npm run release:android`, Gradle 797 tasks `BUILD SUCCESSFUL`(9분 13초), `npm run verify` 47스위트·486/486
- 실기기(SM-N971N, Android 12): 같은 코드의 arm64 APK로 백그라운드 동결 상태에서 단계 종료 알람이 예정 시각 ±0.2초에 알람 소리·진동과 함께 도착하는 것을 확인했다(`docs/EXECUTION_PLAN.md` 2026-08-21 항목). 이 2-ABI AAB/APK 자체의 기기 설치는 하지 않았다.
- Play 데이터 안전 섹션 변경 없음(두 권한은 데이터를 다루지 않는다). 8/20 항목의 `앱 활동` 전송 반영은 여전히 남아 있다.

## 2026-08-20 비공개 테스트 1.0.8 최종 제출본 (업로드 대기)

앞의 8/19 빌드를 대체한다. 이후 커밋 `2dd22ef`~`a3f89fa`가 포함됐다: Phase 0 결과 화면 삭제와 서버 집계 전환(`pilot_summaries` 마이그레이션·`/v1/pilot-summary` 배포 완료), 설정 화면 정리(원터치 화면 모드·루틴 행 통합·지표 접기), 음성 흐름 보정(말하지 않은 장소 차단·중복 준비 행동 제거·지도 닫기), TMAP 실시간 이동 시간(`/v1/routes/estimates` 배포 완료), 홈 약속 카드 정리. 이동수단은 학습 대상에서 완전히 제외됐다.

- 버전 `1.0.8 (8)`, 패키지 `com.timeagent.app`, targetSdk 36, ABI `arm64-v8a`·`armeabi-v7a`
- AAB: `artifacts/TimeAgent-1.0.8-versionCode8.aab` (68,495,987 bytes)
- AAB SHA-256: `2c65e8017ab62dd987b7387639c8c62a5156d8e070796e941a65af6ca367d26e`
- APK: `artifacts/TimeAgent-1.0.8-versionCode8.apk` (117,385,693 bytes)
- APK SHA-256: `6b38610957ae151aa573c4019749e016fa9b1c4958b96468de7cafb1fd411244`
- 서명 `CN=TimeAgent Upload` SHA-1 `05:0B:58:…:8E:B1` 일치, 금지 권한 0건
- 검증: `npm run verify` 46스위트·473/473, 시각 회귀 228/228
- 실기기(SM-N971N): 홈 카드가 제목으로 시작하고 시간·장소가 22px로 커졌다. 화면 모드는 카드 없는 버튼 하나에 언어 버튼은 없다. 학습 기록에 `자가용 이동` 등 이동 행이 없다. 같은 서면 약속이 지하철 41분·택시 36분으로 수단별 실시간 값을 보였다.
- Play 데이터 안전 섹션에 `앱 활동` 전송 항목(집계값, `POST /v1/pilot-summary`)을 반영해야 한다. `docs/DATA_SAFETY.md` 초안 기준.

## 2026-08-19 비공개 테스트 1.0.8 빌드 (제출본, 업로드 대기)

앞의 `1.0.6 (7)` 빌드와 앱 코드가 같고 `app.json`의 버전 값만 올린 것이다. 실기기에서 확인한 전국 검색 동작은 그 항목에 기록돼 있으며, 이 빌드가 실제로 제출할 산출물이다.

- 버전 `1.0.8 (8)`, 패키지 `com.timeagent.app`, targetSdk 36, minSdk 24, ABI `arm64-v8a`·`armeabi-v7a`
- AAB: `artifacts/TimeAgent-1.0.8-versionCode8.aab` (68,495,055 bytes)
- AAB SHA-256: `8ba04f7de457fde212db11f79ebdfa4e8863c6e8124e477350ff2f23c50dbed9`
- APK: `artifacts/TimeAgent-1.0.8-versionCode8.apk` (117,384,581 bytes)
- APK SHA-256: `399367878494d51aec5f60931ee0350500d4e26932bd9c087b5a56a41e328675`
- 서명: `CN=TimeAgent Upload`, SHA-1 `05:0B:58:2C:0B:D8:6F:80:CF:19:60:A6:4D:F9:02:51:7B:41:8E:B1`
- 권한: `READ_CALENDAR` 유지, `WRITE_CALENDAR`·외부 저장소·화면 오버레이 없음
- 실기기: SM-N971N에 설치해 `1.0.8 (8)`로 올라가고 앱이 실행되며 로그인 세션과 홈 화면이 복원되는 것을 확인했다.
- 빌드 판정은 `npm`의 종료 코드가 아니라 로그의 `BUILD SUCCESSFUL`로 한다. Gradle 데몬이 중간에 `stop command received`로 죽어도 래퍼가 0을 반환해 성공처럼 보이는 경우가 있다. 이번 작업에서 실제로 한 번 발생했다.

## 프로덕션 액세스 진행 상황 (2026-08-14 확인 · 2026-08-26 종결)

**2026-08-26 종결: 개발자 계정을 사업자 계정으로 전환해 이 요건이 더 이상 적용되지 않으며 `1.0.9 (9)`가 프로덕션에 출시됐다.** 아래는 개인 계정 시점의 기록이다.

Play Console 대시보드 기준이며 이전 기록의 테스터 7명보다 진전됐다.

- [x] 비공개 테스트 버전 게시
- [x] 12명 이상의 테스터가 비공개 테스트 참여를 선택
- [ ] 12명 이상을 대상으로 14일 이상 비공개 테스트 실행 — **현재 1일차**

`신우철`은 개인 계정이라 이 요건이 적용된다. 참여 인원이 12명 아래로 떨어지면 카운트가 끊길 수 있고 현재 인원이 최소선과 같으므로, 참여 링크 `https://play.google.com/apps/testing/com.timeagent.app`으로 여유 인원을 더 확보한다.

**공개 테스트는 비공개 테스트의 대안이 아니다.** Play Console 공개 테스트 화면은 `프로덕션 액세스 권한이 있어야 공개 테스트를 사용할 수 있습니다`라고 안내한다. 순서는 비공개 테스트 요건 충족 → 프로덕션 액세스 신청·승인 → 공개 테스트와 프로덕션 사용이다. 지금 비공개 테스트를 중단하고 공개 테스트로 바꾸는 선택지는 없다.

## 남은 기술 위험

- `npm audit --omit=dev`는 1 high, 12 moderate를 보고한다. high는 Jest 경로의 `brace-expansion`, moderate는 주로 Expo 설정/CLI 도구 체인이다. 자동 제안이 현재 SDK 57에서 Expo 46으로의 호환되지 않는 변경을 포함하므로 `--force` 수정은 적용하지 않았다. Expo가 호환 패치를 제공하면 다시 점검한다.
- NAVER Maps SDK 3.23.2에서 D8 stack-map 경고가 반복되지만 release 빌드와 lint는 성공했다. 내부 테스트에서 지도 실행과 crash/ANR을 확인한다.
- Google Cloud Android OAuth 클라이언트에 Play 앱 서명 SHA-1을 등록했다. 비공개 테스트 배포본에서 Google 로그인 실동작을 확인해야 한다.
- iOS는 bundle ID/build number만 예약했다. iOS OAuth 클라이언트, Xcode 서명, App Store Connect 정책 제출은 별도 출시 작업이다.
