#!/usr/bin/env bash
set -euo pipefail
out="$RUNNER_TEMP/lyrics-android"
mkdir -p "$out"
export JAVA_HOME="$JAVA_HOME_17_X64"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
cd "$RUNNER_TEMP/lyrics-apks"
sha256sum --check SHA256SUMS
test -e /dev/kvm
sudo chmod a+rw /dev/kvm
emulator -accel-check
echo no | avdmanager create avd --name LyricsQA --package "$AVD_IMAGE" --device pixel_4
adb start-server
emulator -avd LyricsQA -port 5554 -accel on -cores 2 -memory 2048 -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect >"$out/emulator.log" 2>&1 &
emu_pid=$!
export ANDROID_SERIAL=emulator-5554
finish() {
  local status=$?
  if [[ "$(timeout 4s adb get-state 2>/dev/null || true)" == device ]]; then
    timeout 8s adb logcat -d -s LyricsDeviceTest:I AndroidRuntime:E TestRunner:I >"$out/device.log" 2>&1 || true
    timeout 4s adb emu kill >/dev/null 2>&1 || true
  fi
  kill "$emu_pid" 2>/dev/null || true
  if (( status != 0 )); then tail -50 "$out/emulator.log"; fi
}
trap finish EXIT
deadline=$((SECONDS + 300))
booted=''
while (( SECONDS < deadline )); do
  kill -0 "$emu_pid" || { echo 'The emulator exited before boot completed.'; exit 1; }
  if [[ "$(timeout 3s adb get-state 2>/dev/null || true)" == device ]]; then
    booted=$(timeout 3s adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
    if [[ "$booted" == 1 ]]; then break; fi
  fi
  sleep 2
done
[[ "$booted" == 1 ]] || { echo 'The emulator did not boot within five minutes.'; exit 1; }
adb shell input keyevent 82
adb shell wm size 780x1688
adb shell wm density 320
for animation in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb shell settings put global "$animation" 0
done
for prop in ro.build.version.release ro.build.version.sdk ro.product.cpu.abi; do
  printf '%s=' "$prop"; adb shell getprop "$prop" | tr -d '\r'
done | tee "$out/device-properties.txt"
timeout 90s adb install -r -t app-debug.apk
timeout 90s adb install -r -t app-debug-androidTest.apk
suite=kr.co.aifect.app.DesignCaptureTest
timeout 5m adb shell am instrument -w -r -e timeout_msec 120000 -e class "$suite#compactLyricsTogglePreservesTheScreenAndPlayback,$suite#compactLyricsPreserveOpenAndClosedReaderDuringPlayback" kr.co.aifect.app.devicecheck/androidx.test.runner.AndroidJUnitRunner | tr -d '\r' | tee "$out/instrumentation.txt"
grep -Eq '^OK \(2 tests\)' "$out/instrumentation.txt"
adb logcat -d -s LyricsDeviceTest:I | tee "$out/lyrics-playback.txt"
