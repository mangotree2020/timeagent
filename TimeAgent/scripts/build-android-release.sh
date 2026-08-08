#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keystore_path="$project_dir/.release/timeagent-upload.jks"
keychain_service="com.timeagent.app.upload-keystore"

# Android release builds use a standalone JDK when available. The locally installed
# JetBrains Runtime 17.0.9 can crash inside the AArch64 C1 compiler during lint.
if [[ -z "${TIMEAGENT_JAVA_HOME:-}" && -d "/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home" ]]; then
  export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home"
elif [[ -n "${TIMEAGENT_JAVA_HOME:-}" ]]; then
  export JAVA_HOME="$TIMEAGENT_JAVA_HOME"
fi

if [[ ! -x "${JAVA_HOME:-}/bin/java" ]]; then
  echo "A JDK 17 installation is required. Set TIMEAGENT_JAVA_HOME to its home directory." >&2
  exit 1
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  user_home_dir="$(dscl . -read "/Users/$(id -un)" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
  android_sdk_candidate="$user_home_dir/Library/Android/sdk"
  if [[ ! -d "$android_sdk_candidate/platforms" || ! -d "$android_sdk_candidate/build-tools" ]]; then
    echo "ANDROID_HOME is missing and the standard Android SDK was not found." >&2
    exit 1
  fi
  export ANDROID_HOME="$android_sdk_candidate"
fi

if [[ ! -f "$keystore_path" ]]; then
  echo "Upload keystore is missing: $keystore_path" >&2
  exit 1
fi

if ! upload_password="$(security find-generic-password -w -s "$keychain_service" 2>/dev/null)"; then
  echo "Upload keystore password is missing from macOS Keychain: $keychain_service" >&2
  exit 1
fi

export TIMEAGENT_UPLOAD_STORE_FILE="$keystore_path"
export TIMEAGENT_UPLOAD_STORE_PASSWORD="$upload_password"
export TIMEAGENT_UPLOAD_KEY_ALIAS="timeagent-upload"
export TIMEAGENT_UPLOAD_KEY_PASSWORD="$upload_password"
export NODE_ENV="production"

cd "$project_dir"
npx expo prebuild --platform android --no-install

cd "$project_dir/android"
./gradlew app:bundleRelease app:assembleRelease \
  -PreactNativeArchitectures=armeabi-v7a,arm64-v8a

unset upload_password TIMEAGENT_UPLOAD_STORE_PASSWORD TIMEAGENT_UPLOAD_KEY_PASSWORD
