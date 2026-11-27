#!/usr/bin/env bash
set -euo pipefail
out="$RUNNER_TEMP/lyrics-ios"
mkdir -p "$out"
xcodebuild -version
xcrun simctl list devices available -j > "$out/devices.json"
device=$(python3 - "$out/devices.json" <<'PY'
import json, re, sys
with open(sys.argv[1]) as f:
    devices = json.load(f)['devices']
runtimes = [key for key in devices if '.iOS-' in key]
for runtime in sorted(runtimes, key=lambda key: tuple(map(int, re.findall(r'\d+', key.split('.iOS-')[-1]))), reverse=True):
    phones = [d for d in devices[runtime] if d.get('isAvailable') and d['name'].startswith('iPhone')]
    if phones:
        phone = next((d for d in phones if d['name'] in ('iPhone 17','iPhone 16','iPhone 15')), phones[0])
        print(phone['name'] + ' · ' + runtime, file=sys.stderr)
        print(phone['udid'])
        break
else:
    raise SystemExit('No available iPhone simulator')
PY
)
xcrun simctl bootstatus "$device" -b
xcodebuild test -project app/ios/AIFECT.xcodeproj -scheme AIFECT -configuration Debug \
  -destination "platform=iOS Simulator,id=$device" -parallel-testing-enabled NO \
  -clonedSourcePackagesDirPath "$RUNNER_TEMP/LyricsPackages" -derivedDataPath "$RUNNER_TEMP/LyricsDerivedData" \
  -resultBundlePath "$out/Lyrics.xcresult" \
  -only-testing:AIFECTUITests/StreamingUITests/testCompactLyricsPreserveReaderAndRunningAudio \
  -only-testing:AIFECTUITests/StreamingUITests/testBottomTabsReceiveDirectTouchWithMiniPlayer \
  > "$out/xcodebuild.log" 2>&1 || { grep -E 'error:|failed|XCTAssert|Executed [0-9]+ tests' "$out/xcodebuild.log" | tail -60 || true; exit 1; }
xcrun xcresulttool get test-results summary --path "$out/Lyrics.xcresult" > "$out/summary.json"
python3 - "$out/summary.json" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    summary = json.load(f)
print(json.dumps(summary, indent=2))
assert summary['passedTests'] == 2 and summary['failedTests'] == 0 and summary['skippedTests'] == 0
PY
