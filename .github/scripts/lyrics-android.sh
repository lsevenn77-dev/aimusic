#!/usr/bin/env bash
set -euo pipefail
out="$RUNNER_TEMP/lyrics-android"
mkdir -p "$out"
export JAVA_HOME="$JAVA_HOME_17_X64"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
test -e /dev/kvm
sudo chmod a+rw /dev/kvm
image='system-images;android-30;google_apis;x86_64'
sdkmanager --install "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1" "$image"
cd app/android
bash gradlew --console=plain --max-workers=3 -PaifectTest -Pandroid.injected.build.abi=x86_64 :app:assembleDebug :app:assembleDebugAndroidTest
echo no | avdmanager create avd --name LyricsQA --package "$image" --device pixel_4
emulator -avd LyricsQA -port 5554 -accel on -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect >"$out/emulator.log" 2>&1 &
emu_pid=$!
export ANDROID_SERIAL=emulator-5554
finish() {
  adb logcat -d -s LyricsDeviceTest:I AndroidRuntime:E TestRunner:I >"$out/device.log" 2>&1 || true
  adb emu kill >/dev/null 2>&1 || kill "$emu_pid" 2>/dev/null || true
}
trap finish EXIT
for i in $(seq 1 150); do
  if [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then break; fi
  kill -0 "$emu_pid" || { tail -50 "$out/emulator.log"; exit 1; }
  sleep 2
done
[[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]
adb shell input keyevent 82
adb shell wm size 780x1688
adb shell wm density 320
for animation in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$animation" 0
done
adb shell getprop ro.build.version.sdk
adb install -r -t app/build/outputs/apk/debug/app-debug.apk
adb install -r -t app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
suite=kr.co.aifect.app.DesignCaptureTest
adb shell am instrument -w -r -e class "$suite#compactLyricsTogglePreservesTheScreenAndPlayback,$suite#compactLyricsPreserveOpenAndClosedReaderDuringPlayback" kr.co.aifect.app.devicecheck/androidx.test.runner.AndroidJUnitRunner | tr -d '\r' | tee "$out/instrumentation.txt"
grep -Eq '^OK \(2 tests\)' "$out/instrumentation.txt"
adb logcat -d -s LyricsDeviceTest:I | tee "$out/lyrics-playback.txt"
