# tools/run_android_local.ps1
Write-Host "=== Flutter Run Android (Local) ===" -ForegroundColor Cyan
$ErrorActionPreference = "Stop"

function Try-Kill($name) {
  try { taskkill /F /IM $name /T 2>$null | Out-Null } catch {}
}

function Try-RmDir($path) {
  try {
    if (Test-Path $path) { cmd /c "rmdir /s /q `"$path`"" | Out-Null }
  } catch {}
}

# 1) Flutter in PATH (session only)
Write-Host "`n[1/9] Setting Flutter in PATH..." -ForegroundColor Yellow
$flutterBin = Join-Path $env:USERPROFILE "flutter\bin"
if (Test-Path (Join-Path $flutterBin "flutter.bat")) {
  $env:Path = "$flutterBin;$env:Path"
  Write-Host "OK: $flutterBin" -ForegroundColor Green
} else {
  throw "flutter.bat not found at $flutterBin. Update the path in this script."
}

# 2) ADB path
Write-Host "`n[2/9] Checking ADB..." -ForegroundColor Yellow
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "ADB not found: $adb" }
Write-Host "OK: $adb" -ForegroundColor Green

# 3) Repo root
Write-Host "`n[3/9] Verifying git repo..." -ForegroundColor Yellow
$root = (git rev-parse --show-toplevel 2>$null)
if (-not $root) { throw "Not in a git repository. cd to repo root and retry." }
if (-not (Test-Path (Join-Path $root ".git"))) { throw ".git not found in $root" }
Write-Host "OK: $root" -ForegroundColor Green

$flutterDir = Join-Path $root "superparty_flutter"
if (-not (Test-Path $flutterDir)) { throw "superparty_flutter not found: $flutterDir" }

# 4) Kill blockers
Write-Host "`n[4/9] Killing processes that lock files..." -ForegroundColor Yellow
Try-Kill "java.exe"
Try-Kill "dart.exe"
Try-Kill "gradle.exe"
Start-Sleep -Seconds 2
Write-Host "OK" -ForegroundColor Green

# 5) Aggressive cleanup (OneDrive locks)
Write-Host "`n[5/9] Cleaning locked build/cache folders..." -ForegroundColor Yellow
Try-RmDir (Join-Path $flutterDir "build")
Try-RmDir (Join-Path $flutterDir "windows\flutter\ephemeral\.plugin_symlinks")
Try-RmDir (Join-Path $flutterDir "android\.gradle")
Try-RmDir (Join-Path $flutterDir ".dart_tool")
Write-Host "OK" -ForegroundColor Green

# 6) Flutter clean + pub get
Write-Host "`n[6/9] flutter clean / pub get..." -ForegroundColor Yellow
Set-Location $flutterDir
& flutter clean | Out-Host
& flutter pub get | Out-Host

# 7) Check emulator
Write-Host "`n[7/9] Checking Android emulator..." -ForegroundColor Yellow
$devices = & $adb devices
$emu = ($devices | Select-String -Pattern '^emulator-\d+\s+device' | Select-Object -First 1).ToString()
if (-not $emu) { throw "No Android emulator detected. Start emulator then rerun." }
Write-Host "OK: $emu" -ForegroundColor Green

# 8) adb reverse ports
Write-Host "`n[8/9] adb reverse (8082/9098/5002)..." -ForegroundColor Yellow
& $adb reverse tcp:8082 tcp:8082 | Out-Host
& $adb reverse tcp:9098 tcp:9098 | Out-Host
& $adb reverse tcp:5002 tcp:5002 | Out-Host
Write-Host "OK" -ForegroundColor Green

# 9) Run app
Write-Host "`n[9/9] Running app (USE_EMULATORS=true)..." -ForegroundColor Yellow
Write-Host "Ensure Firebase emulators are running in T1 (npm run emu)" -ForegroundColor Cyan
& flutter run --dart-define=USE_EMULATORS=true | Out-Host
