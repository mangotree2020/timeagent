import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const localEnv = readLocalEnv(envPath);
const webClientId =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  localEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '';
const appConfig = JSON.parse(readFileSync(appConfigPath, 'utf8'));
const androidPackage = appConfig.expo?.android?.package;
const debugSha1 = getDebugSha1();
const validWebClientId = /^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/i.test(
  webClientId,
);

console.log('Google 로그인 설정 점검');
console.log(`- Web OAuth 클라이언트 ID: ${validWebClientId ? '설정됨' : '누락 또는 형식 오류'}`);
console.log(`- Android 패키지: ${androidPackage ?? '확인 불가'}`);
console.log(`- Android debug SHA-1: ${debugSha1 ?? '확인 불가'}`);

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
  console.log('\n로컬 설정이 준비됐습니다. Google Cloud의 Android OAuth 클라이언트와 위 패키지/SHA-1이 일치하는지 확인하세요.');
}
