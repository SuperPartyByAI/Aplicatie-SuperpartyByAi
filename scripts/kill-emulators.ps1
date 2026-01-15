# Kill processes using Firebase emulator ports
# Usage: .\scripts\kill-emulators.ps1 [--force]

param(
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=== Firebase Emulator Port Cleanup ===" -ForegroundColor Cyan
Write-Host ""

$ports = @(
    @{ Port = 4001; Name = "UI" },
    @{ Port = 4401; Name = "Hub" },
    @{ Port = 9098; Name = "Auth" },
    @{ Port = 8082; Name = "Firestore" },
    @{ Port = 5002; Name = "Functions" }
)

$foundProcesses = @()

foreach ($portInfo in $ports) {
    $port = $portInfo.Port
    $name = $portInfo.Name
    
    try {
        # Find processes using this port
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        
        if ($connections) {
            foreach ($conn in $connections) {
                $pid = $conn.OwningProcess
                $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                
                if ($process) {
                    $foundProcesses += @{
                        Port = $port
                        Name = $name
                        PID = $pid
                        ProcessName = $process.ProcessName
                        ProcessPath = $process.Path
                    }
                }
            }
        }
    } catch {
        # Port might not be in use
    }
}

if ($foundProcesses.Count -eq 0) {
    Write-Host "✓ No processes found on emulator ports" -ForegroundColor Green
    exit 0
}

Write-Host "Found processes on emulator ports:" -ForegroundColor Yellow
Write-Host ""
foreach ($proc in $foundProcesses) {
    Write-Host "  Port $($proc.Port) ($($proc.Name)): PID $($proc.PID) - $($proc.ProcessName)" -ForegroundColor White
    if ($proc.ProcessPath) {
        Write-Host "    Path: $($proc.ProcessPath)" -ForegroundColor Gray
    }
}
Write-Host ""

if (-not $Force) {
    $response = Read-Host "Kill these processes? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "Killing processes..." -ForegroundColor Yellow
$killed = 0
$failed = 0

foreach ($proc in $foundProcesses) {
    try {
        Stop-Process -Id $proc.PID -Force -ErrorAction Stop
        Write-Host "  ✓ Killed PID $($proc.PID) (Port $($proc.Port))" -ForegroundColor Green
        $killed++
    } catch {
        Write-Host "  ✗ Failed to kill PID $($proc.PID): $_" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
if ($killed -gt 0) {
    Write-Host "✓ Killed $killed process(es)" -ForegroundColor Green
}
if ($failed -gt 0) {
    Write-Host "✗ Failed to kill $failed process(es)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Ports are now free. You can start emulators." -ForegroundColor Green
