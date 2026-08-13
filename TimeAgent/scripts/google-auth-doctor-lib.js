function parseAdbPackagePaths(output) {
  const paths = output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^package:/, ''))
    .filter(Boolean);
  return paths.find((path) => path.endsWith('/base.apk')) ?? paths[0] ?? null;
}

function parseApkSignerSha1(output) {
  const digest = output.match(/Signer #1 certificate SHA-1 digest:\s*([0-9a-f]+)/i)?.[1];
  return digest?.match(/.{1,2}/g)?.join(':').toUpperCase() ?? null;
}

function parseInstalledPackageMetadata(output) {
  return {
    installer: output.match(/installerPackageName=([^\s]+)/)?.[1] ?? null,
    versionCode: output.match(/versionCode=(\d+)/)?.[1] ?? null,
    versionName: output.match(/versionName=([^\s]+)/)?.[1] ?? null,
  };
}

module.exports = {
  parseAdbPackagePaths,
  parseApkSignerSha1,
  parseInstalledPackageMetadata,
};
