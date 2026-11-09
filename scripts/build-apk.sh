#!/usr/bin/env bash
# Builds the web app, syncs it into the Android project and produces a signed APK in dist-apk/.
# Needs: JDK 21, Android SDK (ANDROID_HOME) and a keystore at KEYSTORE (default ../timbrando-keys/timbrando.jks).
set -euo pipefail
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-/root/Android/sdk}"
KEYSTORE="${KEYSTORE:-../timbrando-keys/timbrando.jks}"
KEY_PASS="${KEY_PASS:-timbrando-local}"
BUILD_TOOLS="$ANDROID_HOME/build-tools/35.0.0"
VERSION="$(node -p "require('./package.json').version")"
npm run build
npx cap sync android
(cd android && ./gradlew --no-daemon -q assembleRelease)
mkdir -p dist-apk
UNSIGNED=android/app/build/outputs/apk/release/app-release-unsigned.apk
"$BUILD_TOOLS/zipalign" -f -p 4 "$UNSIGNED" dist-apk/aligned.apk
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias timbrando --ks-pass "pass:$KEY_PASS" --key-pass "pass:$KEY_PASS" --out "dist-apk/timbrando-$VERSION.apk" dist-apk/aligned.apk
rm dist-apk/aligned.apk
echo "APK: dist-apk/timbrando-$VERSION.apk"
