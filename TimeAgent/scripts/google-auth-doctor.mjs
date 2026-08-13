import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';

import doctorLib from './google-auth-doctor-lib.js';

const {
  parseAdbPackagePaths,
  parseApkSignerSha1,
  parseInstalledPackageMetadata,
} = doctorLib;

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env.local');
const appConfigPath = resolve(root, 'app.json');
const debugKeystorePath = resolve(root, 'android/app/debug.keystore');

function readLocalEnv(path) {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, '$2');
        return [key, value];
      }),
  );
}

function getDebugSha1() {
  if (!existsSync(debugKeystorePath)) return null;

  try {
    const output = execFileSync(
      'keytool',
      [
        '-J-Duser.language=en',
        '-list',
        '-v',
        '-keystore',
        debugKeystorePath,
        '-alias',
        'androiddebugkey',
        '-storepass',
        'android',
        '-keypass',
        'android',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return output.match(/SHA1:\s*([0-9A-F:]+)/i)?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

function findApkSigner() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    resolve(homedir(), 'Library/Android/sdk'),
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const buildToolsPath = resolve(sdkRoot, 'build-tools');
    if (!existsSync(buildToolsPath)) continue;
    const versions = readdirSync(buildToolsPath).sort((left, right) => (
      right.localeCompare(left, undefined, { numeric: true })
    ));
    for (const version of versions) {
      const candidate = resolve(buildToolsPath, version, 'apksigner');
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function getInstalledApp(androidPackage) {
  if (!androidPackage) return null;
  const apkSigner = findApkSigner();
  if (!apkSigner) return null;

  let temporaryDirectory;
  try {
    execFileSync('adb', ['get-state'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const paths = execFileSync('adb', ['shell', 'pm', 'path', androidPackage], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const baseApkPath = parseAdbPackagePaths(paths);
    if (!baseApkPath) return null;

    temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'timeagent-auth-doctor-'));
    const localApkPath = resolve(temporaryDirectory, 'base.apk');
    execFileSync('adb', ['pull', baseApkPath, localApkPath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const signerOutput = execFileSync(apkSigner, ['verify', '--print-certs', localApkPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const packageOutput = execFileSync('adb', ['shell', 'dumpsys', 'package', androidPackage], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      ...parseInstalledPackageMetadata(packageOutput),
      sha1: parseApkSignerSha1(signerOutput),
    };
  } catch {
    return null;
  } finally {
    if (temporaryDirectory) rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

const localEnv = readLocalEnv(envPath);
const webClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  localEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '';
const appConfig = JSON.parse(readFileSync(appConfigPath, 'utf8'));
const androidPackage = appConfig.expo?.android?.package;
const debugSha1 = getDebugSha1();
const installedApp = getInstalledApp(androidPackage);
const validWebClientId = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(
  webClientId,
);

console.log('Google 로그인 설정 점검');
console.log(`- Web OAuth 클라이언트 ID: ${validWebClientId ? '설정됨' : '누락 또는 형식 오류'}`);
console.log(`- Android 패키지: ${androidPackage ?? '확인 불가'}`);
console.log(`- Android debug SHA-1: ${debugSha1 ?? '확인 불가'}`);
if (installedApp) {
  console.log(`- 연결 기기 설치본: ${installedApp.versionName ?? '?'} (${installedApp.versionCode ?? '?'})`);
  console.log(`- 설치 경로: ${installedApp.installer === 'com.android.vending' ? 'Google Play' : (installedApp.installer ?? '직접 설치')}`);
  console.log(`- 설치본 서명 SHA-1: ${installedApp.sha1 ?? '확인 불가'}`);
} else {
  console.log('- 연결 기기 설치본: 확인하지 않음 (선택 점검)');
}

const errors = [];
if (!validWebClientId) {
  errors.push(
    '.env.local에 EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<Web OAuth 클라이언트 ID>를 설정하세요.',
  );
}
if (!androidPackage) {
  errors.push('app.json의 expo.android.package를 설정하세요.');
}
if (!debugSha1) {
  errors.push('keytool과 android/app/debug.keystore를 확인하세요.');
}

if (errors.length > 0) {
  console.error('\n조치 필요:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('\nGoogle Cloud의 Android OAuth 클라이언트에 패키지명과 사용하는 모든 서명 SHA-1을 등록하세요.');
  if (installedApp?.sha1 && installedApp.sha1 !== debugSha1) {
    console.log(`특히 현재 설치본은 debug 키와 다릅니다. ${installedApp.sha1} 등록 여부를 확인하세요.`);
  }
}
