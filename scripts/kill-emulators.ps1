param(
  [switch]$Force
)

$ports = @(4001, 4401, 4500, 4501, 5002, 8082, 9098, 9151)

function Get-PidsOnPort([int]$port) {
  $lines = netstat -ano | Select-String "LISTENING\s+\d+$" | ForEach-Object { $_.Line }
  $hits = $lines | Where-Object { $_ -match ":(\d+)\s+LISTENING\s+(\d+)$" -and [int]$matches[1] -eq $port }
  $pids = @()
  foreach ($h in $hits) {
    if ($h -match ":(\d+)\s+LISTENING\s+(\d+)$") { $pids += [int]$matches[2] }
  }
  return ($pids | Select-Object -Unique)
}

$toKill = @{}

foreach ($p in $ports) {
  $pids = Get-PidsOnPort $p
  if ($pids.Count -gt 0) {
    $toKill[$p] = $pids
  }
}

if ($toKill.Count -eq 0) {
  Write-Host "No emulator ports are currently in use." -ForegroundColor Green
  return
}

Write-Host "Processes holding emulator ports:" -ForegroundColor Yellow
foreach ($kv in $toKill.GetEnumerator()) {
  $port = $kv.Key
  $pids = $kv.Value -join ", "
  Write-Host "  Port $port -> PID(s): $pids"
}

if (-not $Force) {
  $ans = Read-Host "Kill these processes? (y/N)"
  if ($ans -notin @("y","Y","yes","YES")) {
    Write-Host "Aborted." -ForegroundColor Yellow
    return
  }
}

$killed = 0
foreach ($kv in $toKill.GetEnumerator()) {
  foreach ($pid in $kv.Value) {
    try {
      Stop-Process -Id $pid -Force -ErrorAction Stop
      $killed++
    } catch {
      Write-Host "Failed to kill PID $pid : $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

Write-Host "Killed $killed process(es). Ports should be free now." -ForegroundColor Green
