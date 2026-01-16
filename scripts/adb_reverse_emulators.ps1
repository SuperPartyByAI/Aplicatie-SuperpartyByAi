# scripts/adb_reverse_emulators.ps1
# Setup ADB reverse for Firebase emulators on Android emulator

$ErrorActionPreference = "Continue"
Write-Host "=== ADB Reverse Setup for Firebase Emulators ===" -ForegroundColor Cyan

# ADB path
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"

if (-not (Test-Path $adb)) {
    Write-Host "`n[FAIL] ADB not found at: $adb" -ForegroundColor Red
    Write-Host "  Install Android SDK Platform Tools or update path" -ForegroundColor Yellow
    Write-Host "  Expected location: $env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -ForegroundColor Gray
    exit 1
}

Write-Host "[OK] ADB found: $adb" -ForegroundColor Green

# Check if emulator is connected
Write-Host "`nChecking Android emulator..." -ForegroundColor Yellow
$devices = & $adb devices 2>&1
$emulatorFound = $false
$emulatorId = $null

foreach ($line in $devices) {
    if ($line -match "emulator-(\d+)\s+device") {
        $emulatorFound = $true
        $emulatorId = $matches[0]
        Write-Host "[OK] Android emulator found: $emulatorId" -ForegroundColor Green
        break
    }
}

if (-not $emulatorFound) {
    Write-Host "[FAIL] No Android emulator detected" -ForegroundColor Red
    Write-Host "`nAvailable devices:" -ForegroundColor Yellow
    $devices | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "  1. Start Android emulator from Android Studio" -ForegroundColor White
    Write-Host "  2. Or use command line: emulator -avd <AVD_NAME>" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    exit 1
}

# Read ports from firebase.json (single source of truth)
function Read-EmulatorPorts {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $firebaseJsonPath = Join-Path $repoRoot "firebase.json"
    
    if (-not (Test-Path $firebaseJsonPath)) {
        Write-Host "WARNING: firebase.json not found, using defaults" -ForegroundColor Yellow
        return @(
            @{Port=8082; Service="Firestore"},
            @{Port=9098; Service="Auth"},
            @{Port=5002; Service="Functions"}
        )
    }
    
    try {
        $json = Get-Content $firebaseJsonPath -Raw | ConvertFrom-Json
        $ports = @()
        
        if ($json.emulators.firestore) {
            $ports += @{Port = $json.emulators.firestore.port; Service = "Firestore"}
        }
        if ($json.emulators.auth) {
            $ports += @{Port = $json.emulators.auth.port; Service = "Auth"}
        }
        if ($json.emulators.functions) {
            $ports += @{Port = $json.emulators.functions.port; Service = "Functions"}
        }
        
        return $ports
    } catch {
        Write-Host "WARNING: Error reading firebase.json, using defaults: $_" -ForegroundColor Yellow
        return @(
            @{Port=8082; Service="Firestore"},
            @{Port=9098; Service="Auth"},
            @{Port=5002; Service="Functions"}
        )
    }
}

# Setup port forwarding (ports from firebase.json: single source of truth)
Write-Host "`nSetting up ADB reverse..." -ForegroundColor Yellow
$ports = Read-EmulatorPorts

$success = $true
foreach ($portInfo in $ports) {
    $result = & $adb reverse tcp:$($portInfo.Port) tcp:$($portInfo.Port) 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] $($portInfo.Service):$($portInfo.Port)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] $($portInfo.Service):$($portInfo.Port) failed: $result" -ForegroundColor Red
        $success = $false
    }
}

if (-not $success) {
    Write-Host "`nWARNING: Some port reversals failed" -ForegroundColor Yellow
    Write-Host "  Check ADB connection: & $adb devices" -ForegroundColor Yellow
    exit 1
}

# Show active reversals
Write-Host "`nActive ADB reversals:" -ForegroundColor Cyan
$reversals = & $adb reverse --list 2>&1
if ($reversals -and $reversals.Count -gt 0) {
    foreach ($line in $reversals) {
        if ($line.Trim()) {
            Write-Host "  $line" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "  (none)" -ForegroundColor Gray
}

Write-Host "`n[OK] ADB reverse setup complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  cd superparty_flutter" -ForegroundColor White
Write-Host "  flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true" -ForegroundColor White
