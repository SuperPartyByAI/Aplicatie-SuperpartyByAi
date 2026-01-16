# scripts/check_emu_ports.ps1
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Firebase Emulator Port Check ==="
Write-Host ""

# Repo root from script location
$repoRoot = Split-Path -Parent $PSScriptRoot
$firebaseJsonPath = Join-Path $repoRoot "firebase.json"

# Defaults (if firebase.json not readable)
$ports = @{
  Firestore = 8082
  Auth      = 9098
  Functions = 5002
  UI        = 4001
  Hub       = 4401
}

# Try read ports from firebase.json if present
try {
  if (Test-Path $firebaseJsonPath) {
    $json = Get-Content $firebaseJsonPath -Raw | ConvertFrom-Json
    if ($json.emulators.firestore.port) { $ports.Firestore = [int]$json.emulators.firestore.port }
    if ($json.emulators.auth.port)      { $ports.Auth      = [int]$json.emulators.auth.port }
    if ($json.emulators.functions.port) { $ports.Functions = [int]$json.emulators.functions.port }
    if ($json.emulators.ui.port)        { $ports.UI        = [int]$json.emulators.ui.port }
    if ($json.emulators.hub.port)       { $ports.Hub       = [int]$json.emulators.hub.port }
  } else {
    Write-Host "WARNING: firebase.json not found at $firebaseJsonPath, using defaults."
  }
} catch {
  Write-Host "WARNING: Error reading firebase.json, using defaults: $($_.Exception.Message)"
}

function Test-Port([int]$port) {
  try {
    $c = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue
    return [bool]$c.TcpTestSucceeded
  } catch { return $false }
}

$required = @(
  @{ Name="Firestore"; Port=$ports.Firestore },
  @{ Name="Auth";      Port=$ports.Auth },
  @{ Name="Functions"; Port=$ports.Functions }
)

$optional = @(
  @{ Name="UI";  Port=$ports.UI },
  @{ Name="Hub"; Port=$ports.Hub }
)

Write-Host "Port Status:"
Write-Host "------------"

$allRequiredOpen = $true

foreach ($p in $required) {
  $ok = Test-Port $p.Port
  $status = if ($ok) { "OPEN" } else { "CLOSED" }
  if (-not $ok) { $allRequiredOpen = $false }
  Write-Host ("{0}:{1} [{2}] (required)" -f $p.Name, $p.Port, $status)
}

foreach ($p in $optional) {
  $ok = Test-Port $p.Port
  $status = if ($ok) { "OPEN" } else { "CLOSED" }
  Write-Host ("{0}:{1} [{2}] (optional)" -f $p.Name, $p.Port, $status)
}

Write-Host ""
Write-Host "ADB Reverse Status:"
Write-Host "-------------------"
try {
  $adb = Get-Command adb -ErrorAction Stop
  $devices = & adb devices
  $hasEmu = ($devices -match "emulator-\d+\s+device")
  if ($hasEmu) {
    Write-Host "OK: Android emulator connected"
    $rev = & adb reverse --list
    if ([string]::IsNullOrWhiteSpace($rev)) {
      Write-Host "WARNING: No ADB reversals configured"
      Write-Host ("  adb reverse tcp:{0} tcp:{0}" -f $ports.Firestore)
      Write-Host ("  adb reverse tcp:{0} tcp:{0}" -f $ports.Auth)
      Write-Host ("  adb reverse tcp:{0} tcp:{0}" -f $ports.Functions)
    } else {
      Write-Host "ADB reversals:"
      $rev
    }
  } else {
    Write-Host "WARNING: No Android emulator device detected in adb devices"
  }
} catch {
  Write-Host "WARNING: adb not found in PATH"
}

Write-Host ""
if ($allRequiredOpen) {
  Write-Host "OK: All required ports are OPEN."
  exit 0
} else {
  Write-Host "FAIL: Some required ports are CLOSED."
  Write-Host "Start emulators: npm run emu"
  exit 1
}
