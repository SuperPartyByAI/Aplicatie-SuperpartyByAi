$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== Firebase Emulator Port Check ==="
Write-Host ""

$repoRoot = Split-Path -Parent $PSScriptRoot
$firebaseJsonPath = Join-Path $repoRoot "firebase.json"

$ports = @{
  Firestore = 8082
  Auth      = 9098
  Functions = 5002
  UI        = 4001
  Hub       = 4401
}

try {
  if (Test-Path $firebaseJsonPath) {
    $json = Get-Content $firebaseJsonPath -Raw | ConvertFrom-Json
    if ($json.emulators.firestore.port) { $ports.Firestore = [int]$json.emulators.firestore.port }
    if ($json.emulators.auth.port)      { $ports.Auth      = [int]$json.emulators.auth.port }
    if ($json.emulators.functions.port) { $ports.Functions = [int]$json.emulators.functions.port }
    if ($json.emulators.ui.port)        { $ports.UI        = [int]$json.emulators.ui.port }
    if ($json.emulators.hub.port)       { $ports.Hub       = [int]$json.emulators.hub.port }
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
if ($allRequiredOpen) {
  Write-Host "OK: All required ports are OPEN."
  exit 0
} else {
  Write-Host "FAIL: Some required ports are CLOSED."
  Write-Host "Start emulators: npm run emu"
  exit 1
}
