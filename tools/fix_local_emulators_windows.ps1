# tools/fix_local_emulators_windows.ps1
# Self-healing script for Firebase emulators on Windows
# Fixes port conflicts, encoding issues, starts emulators, seeds, and verifies

param(
    [string]$ProjectId = "demo-test",
    [int]$MaxWaitSeconds = 60,
    [int]$MaxKillRetries = 3
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Firebase Emulators Fix & Start (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify repo root
Write-Host "[1/8] Verifying repo root..." -ForegroundColor Yellow
if (-not (Test-Path "package.json") -or -not (Test-Path "firebase.json")) {
    Write-Host "[FAIL] Not in repo root. Missing package.json or firebase.json" -ForegroundColor Red
    Write-Host "  Run this script from the repository root directory" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Repo root verified" -ForegroundColor Green
Write-Host ""

# Step 2: Read ports from firebase.json
Write-Host "[2/8] Reading ports from firebase.json..." -ForegroundColor Yellow
try {
    $firebaseJson = Get-Content "firebase.json" -Raw | ConvertFrom-Json
    $firestorePort = $firebaseJson.emulators.firestore.port
    $authPort = $firebaseJson.emulators.auth.port
    $functionsPort = $firebaseJson.emulators.functions.port
    $uiPort = $firebaseJson.emulators.ui.port
    $hubPort = if ($firebaseJson.emulators.hub) { $firebaseJson.emulators.hub.port } else { 4401 }
    $loggingPort = if ($firebaseJson.emulators.logging) { $firebaseJson.emulators.logging.port } else { 4500 }
    
    Write-Host "[OK] Ports read:" -ForegroundColor Green
    Write-Host "  Firestore: $firestorePort" -ForegroundColor Gray
    Write-Host "  Auth: $authPort" -ForegroundColor Gray
    Write-Host "  Functions: $functionsPort" -ForegroundColor Gray
    Write-Host "  UI: $uiPort" -ForegroundColor Gray
    Write-Host "  Hub: $hubPort" -ForegroundColor Gray
    Write-Host "  Logging: $loggingPort" -ForegroundColor Gray
} catch {
    Write-Host "[FAIL] Error reading firebase.json: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Kill processes holding ports
Write-Host "[3/8] Freeing ports..." -ForegroundColor Yellow
$allPorts = @($firestorePort, $authPort, $functionsPort, $uiPort, $hubPort, $loggingPort)
$portsToKill = $allPorts | Sort-Object -Unique

function Kill-PortProcesses {
    param([int[]]$Ports, [int]$MaxRetries = 3)
    
    for ($retry = 1; $retry -le $MaxRetries; $retry++) {
        $killedAny = $false
        $stillBlocked = @()
        
        foreach ($port in $Ports) {
            try {
                $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
                if ($connections) {
                    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
                    foreach ($pid in $pids) {
                        try {
                            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                            if ($proc) {
                                Write-Host "  Killing process on port $port : PID $pid ($($proc.ProcessName))" -ForegroundColor Yellow
                                Stop-Process -Id $pid -Force -ErrorAction Stop
                                $killedAny = $true
                            }
                        } catch {
                            Write-Host "  WARNING: Could not kill PID $pid : $_" -ForegroundColor Yellow
                        }
                    }
                }
                
                # Re-check if port is still taken
                Start-Sleep -Milliseconds 500
                $stillConnections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
                if ($stillConnections) {
                    $stillPids = $stillConnections | Select-Object -ExpandProperty OwningProcess -Unique
                    foreach ($stillPid in $stillPids) {
                        $stillProc = Get-Process -Id $stillPid -ErrorAction SilentlyContinue
                        if ($stillProc) {
                            $stillBlocked += @{Port=$port; PID=$stillPid; Name=$stillProc.ProcessName}
                        }
                    }
                }
            } catch {
                # Port might not be in use, continue
            }
        }
        
        if ($stillBlocked.Count -eq 0) {
            Write-Host "[OK] All ports freed" -ForegroundColor Green
            return $true
        }
        
        if ($retry -lt $MaxRetries) {
            Write-Host "  Retry $retry/$MaxRetries : Some ports still blocked, retrying..." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    }
    
    # Final failure report
    Write-Host "[FAIL] Could not free all ports after $MaxRetries retries:" -ForegroundColor Red
    foreach ($blocked in $stillBlocked) {
        Write-Host "  Port $($blocked.Port) : PID $($blocked.PID) ($($blocked.Name))" -ForegroundColor Red
    }
    Write-Host "  Manual fix: Stop the processes above or change ports in firebase.json" -ForegroundColor Yellow
    return $false
}

if (-not (Kill-PortProcesses -Ports $portsToKill -MaxRetries $MaxKillRetries)) {
    exit 1
}
Write-Host ""

# Step 4: Fix check_emu_ports.ps1 encoding issues
Write-Host "[4/8] Fixing check_emu_ports.ps1 encoding..." -ForegroundColor Yellow
$checkScriptPath = "scripts\check_emu_ports.ps1"
if (Test-Path $checkScriptPath) {
    try {
        $content = Get-Content $checkScriptPath -Raw -Encoding UTF8
        # Replace Unicode symbols with ASCII (already done in previous fixes, but ensure it's saved correctly)
        $content = $content -replace '✓', '[OK]'
        $content = $content -replace '✗', '[FAIL]'
        $content = $content -replace '⚠️', 'WARNING:'
        $content = $content -replace '❌', '[FAIL]'
        $content = $content -replace '✅', '[OK]'
        
        # Save as UTF-8 without BOM
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText((Resolve-Path $checkScriptPath), $content, $utf8NoBom)
        Write-Host "[OK] check_emu_ports.ps1 encoding fixed" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Could not fix check_emu_ports.ps1 : $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "WARNING: check_emu_ports.ps1 not found" -ForegroundColor Yellow
}
Write-Host ""

# Step 5: Start emulators
Write-Host "[5/8] Starting Firebase emulators..." -ForegroundColor Yellow
$emulatorWindow = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$PWD'; firebase.cmd emulators:start --config .\firebase.json --only firestore,functions,auth --project $ProjectId"
) -PassThru

Write-Host "  [OK] Emulators started in separate window (PID: $($emulatorWindow.Id))" -ForegroundColor Green
Write-Host ""

# Step 6: Poll ports until ready
Write-Host "[6/8] Waiting for emulators to be ready..." -ForegroundColor Yellow
function Test-Port {
    param([string]$emulatorHost, [int]$Port, [int]$TimeoutMs = 500)
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect($emulatorHost, $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($wait) {
            $tcpClient.EndConnect($connect) | Out-Null
            $tcpClient.Close()
            return $true
        } else {
            $tcpClient.Close()
            return $false
        }
    } catch {
        return $false
    }
}

$requiredPorts = @(
    @{Port=$firestorePort; Name="Firestore"},
    @{Port=$authPort; Name="Auth"},
    @{Port=$functionsPort; Name="Functions"},
    @{Port=$uiPort; Name="UI"}
)

$startTime = Get-Date
$allReady = $false
$checkInterval = 2

while (-not $allReady) {
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    if ($elapsed -gt $MaxWaitSeconds) {
        Write-Host "[FAIL] Timeout waiting for emulators (${MaxWaitSeconds}s)" -ForegroundColor Red
        Write-Host "  Check the emulator window for errors" -ForegroundColor Yellow
        exit 1
    }

    $readyPorts = @()
    foreach ($portInfo in $requiredPorts) {
        if (Test-Port -emulatorHost "127.0.0.1" -Port $portInfo.Port -TimeoutMs 500) {
            $readyPorts += $portInfo.Name
        }
    }

    if ($readyPorts.Count -eq $requiredPorts.Count) {
        $allReady = $true
        Write-Host "  [OK] All emulators ready!" -ForegroundColor Green
    } else {
        $readyStr = if ($readyPorts.Count -gt 0) { " ($($readyPorts -join ', ') ready)" } else { "" }
        Write-Host "  Waiting... ($([math]::Round($elapsed))s elapsed)$readyStr" -ForegroundColor Gray
        Start-Sleep -Seconds $checkInterval
    }
}
Write-Host ""

# Step 7: Seed Firestore
Write-Host "[7/8] Seeding Firestore..." -ForegroundColor Yellow
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:$firestorePort"
$seedResult = node tools/seed_firestore.js --emulator --project $ProjectId 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Firestore seeded successfully" -ForegroundColor Green
    # Verify seed used correct port
    if ($seedResult -match "Using Firestore emulator at 127\.0\.0\.1:(\d+)") {
        $seedPort = $matches[1]
        if ($seedPort -ne $firestorePort) {
            Write-Host "WARNING: Seed script used port $seedPort instead of $firestorePort" -ForegroundColor Yellow
            Write-Host "  Check tools/seed_firestore.js to ensure it reads from firebase.json" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[FAIL] Seed failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    Write-Host $seedResult
    exit 1
}
Write-Host ""

# Step 8: Verify with emu:check
Write-Host "[8/8] Verifying emulator ports..." -ForegroundColor Yellow
$checkResult = & powershell.exe -ExecutionPolicy Bypass -NoProfile -File "scripts\check_emu_ports.ps1" 2>&1
$checkExitCode = $LASTEXITCODE

if ($checkExitCode -eq 0 -or $checkResult -match "\[OK\] All required ports are open") {
    Write-Host "[OK] Port verification passed" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Port verification failed" -ForegroundColor Red
    Write-Host $checkResult
    exit 1
}
Write-Host ""

# Success summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] Setup complete! Emulators are running." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Run Flutter app (cold start, not hot restart):" -ForegroundColor White
Write-Host "   cd superparty_flutter" -ForegroundColor Gray
Write-Host "   flutter clean" -ForegroundColor Gray
Write-Host "   flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=false" -ForegroundColor Gray
Write-Host ""
Write-Host "2. If using Android emulator with adb reverse:" -ForegroundColor White
Write-Host "   .\scripts\adb_reverse_emulators.ps1" -ForegroundColor Gray
Write-Host "   flutter run --dart-define=USE_EMULATORS=true --dart-define=USE_ADB_REVERSE=true" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Stop emulators:" -ForegroundColor White
Write-Host "   Close the emulator window, or press Ctrl+C in that window" -ForegroundColor Gray
Write-Host ""
