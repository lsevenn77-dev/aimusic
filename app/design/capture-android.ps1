param(
    [Parameter(Mandatory=$true)][string]$Serial,
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$SdkRoot = $(if($env:ANDROID_SDK_ROOT){$env:ANDROID_SDK_ROOT}else{Join-Path $env:LOCALAPPDATA 'Android/Sdk'})
)
$ErrorActionPreference = 'Stop'
# Use a dedicated Android 15 AVD, launched with -no-audio. Never install this on a user's phone.
if($Serial -notmatch '^emulator-\d+$'){throw 'Use a dedicated emulator serial.'}
if(!$JavaHome -or !(Test-Path (Join-Path $JavaHome 'bin/java.exe'))){throw 'Pass -JavaHome for JDK 21.'}
$env:JAVA_HOME = $JavaHome
$adb = Join-Path $SdkRoot 'platform-tools/adb.exe'
$hardware = (& $adb -s $Serial shell getprop ro.hardware | Out-String).Trim()
if($hardware -notin @('ranchu','goldfish')){throw 'Target is not an Android emulator.'}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$android = Join-Path $repo 'app/android'
if((Get-Content (Join-Path $android 'app/build.gradle') -Raw) -notmatch 'versionName\s+["'']2\.5\.35["'']'){throw 'Update the capture version and catalog before capturing a newer build.'}
function Invoke-Checked([string]$Program,[string[]]$Arguments){
    & $Program @Arguments
    if($LASTEXITCODE -ne 0){throw "$Program failed ($LASTEXITCODE)"}
}
Invoke-Checked $adb @('-s',$Serial,'shell','wm','size','780x1688')
Invoke-Checked $adb @('-s',$Serial,'shell','wm','density','320')
Invoke-Checked (Join-Path $android 'gradlew.bat') @('-p',$android,':app:assembleDebug',':app:assembleDebugAndroidTest','-PaifectTest','--console=plain')
Invoke-Checked $adb @('-s',$Serial,'install','-r',(Join-Path $android 'app/build/outputs/apk/debug/app-debug.apk'))
Invoke-Checked $adb @('-s',$Serial,'install','-r',(Join-Path $android 'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'))
$tests = 'kr.co.aifect.app.DesignCaptureTest,kr.co.aifect.app.karaoke.KaraokeDeviceTest#captureCurrentDesignWithoutMicrophone'
$result = & $adb -s $Serial shell am instrument -w -r -e class $tests kr.co.aifect.app.test.test/androidx.test.runner.AndroidJUnitRunner
$code = $LASTEXITCODE
$log = Join-Path ([IO.Path]::GetTempPath()) ('aifect-design-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.log')
$result | Set-Content -Encoding utf8 $log
if($code -ne 0 -or ($result -join "`n") -notmatch 'OK \(4 tests\)' -or ($result -join "`n") -match 'FAILURES!!!|INSTRUMENTATION_FAILED'){throw "Capture failed; no existing PNGs were replaced. See $log"}
$destination = Join-Path $PSScriptRoot 'screens/2.5.35'
New-Item -ItemType Directory -Force $destination | Out-Null
$catalog = Get-Content (Join-Path $PSScriptRoot 'screen-catalog.json') -Raw | ConvertFrom-Json
foreach($entry in $catalog | Select-Object -First 29){
    $name = [IO.Path]::GetFileName($entry[0])
    Invoke-Checked $adb @('-s',$Serial,'pull',('/sdcard/Android/data/kr.co.aifect.app.test/files/design-2535/'+$name),(Join-Path $destination $name))
}
$recording = @{
 'design-2535-ready.png'='30-recording-ready.png'
 'design-2535-duet-editor.png'='31-duet-editor.png'
 'design-2535-recording-lyrics.png'='32-recording-lyrics.png'
 'design-2535-sound.png'='33-sound-settings.png'
 'design-2535-reverb.png'='34-reverb-settings.png'
 'design-2535-post-top.png'='35-post-production.png'
 'design-2535-post-bottom.png'='36-save-recording.png'
}
foreach($name in $recording.Keys){
    Invoke-Checked $adb @('-s',$Serial,'pull',('/sdcard/Android/data/kr.co.aifect.app.test/files/'+$name),(Join-Path $destination $recording[$name]))
}
Write-Output "Saved 36 native screens to $destination. Log: $log"
Write-Output 'Run npm run boards and npm run catalog in app/design to refresh boards, gallery metadata and file hashes.'
