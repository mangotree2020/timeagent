const {
  parseAdbPackagePaths,
  parseApkSignerSha1,
  parseInstalledPackageMetadata,
} = require('./google-auth-doctor-lib');

describe('Google auth doctor helpers', () => {
  test('selects the base APK from an installed split package', () => {
    expect(parseAdbPackagePaths([
      'package:/data/app/example/base.apk',
      'package:/data/app/example/split_config.ko.apk',
    ].join('\n'))).toBe('/data/app/example/base.apk');
  });

  test('normalizes the installed APK signing SHA-1', () => {
    expect(parseApkSignerSha1(
      'Signer #1 certificate SHA-1 digest: c3a9ba670b12a2c38b9ac949ab1add038cd86857',
    )).toBe('C3:A9:BA:67:0B:12:A2:C3:8B:9A:C9:49:AB:1A:DD:03:8C:D8:68:57');
  });

  test('reads the Play installer and installed app version', () => {
    expect(parseInstalledPackageMetadata([
      'versionCode=1 minSdk=24 targetSdk=36',
      'versionName=1.0.0',
      'installerPackageName=com.android.vending',
    ].join('\n'))).toEqual({
      installer: 'com.android.vending',
      versionCode: '1',
      versionName: '1.0.0',
    });
  });
});
