# Bootstrap script for Firebase Emulators (Windows PowerShell)
# 
# Usage:
#   powershell -ExecutionPolicy Bypass -File tools/run_emulators.ps1
#
# What it does:
#   1. Checks for firebase-tools
#   2. Starts Firestore, Functions, and Auth emulators
#   3. Seeds Firestore with teams + code pools
#   4. Provides instructions for creating admin user

param(
    [string]$ProjectId = "demo-test"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Firebase Emulators Bootstrap (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check firebase-tools
Write-Host "[1/4] Checking firebase-tools..." -ForegroundColor Yellow
try {
    $firebaseVersion = firebase --version 2>&1
    Write-Host "✅ firebase-tools found: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ firebase-tools not found. Install: npm i -g firebase-tools" -ForegroundColor Red
    exit 1
}

# Check Node.js
Write-Host "[2/4] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Install Node.js 20+" -ForegroundColor Red
    exit 1
}

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

# Start emulators in background
Write-Host "[3/4] Starting Firebase emulators..." -ForegroundColor Yellow
Write-Host "   Project: $ProjectId" -ForegroundColor Gray
Write-Host "   Firestore: http://127.0.0.1:8080" -ForegroundColor Gray
Write-Host "   Functions: http://127.0.0.1:5001" -ForegroundColor Gray
Write-Host "   Auth: http://127.0.0.1:9099" -ForegroundColor Gray
Write-Host "   UI: http://127.0.0.1:4000" -ForegroundColor Gray
Write-Host ""

$emulatorJob = Start-Job -ScriptBlock {
    param($repoRoot, $projectId)
    Set-Location $repoRoot
    firebase emulators:start --only firestore,functions,auth --project $projectId
} -ArgumentList $repoRoot, $ProjectId

# Wait for emulators to start (best-effort)
Write-Host "   Waiting for emulators to start (10s)..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# Seed Firestore
Write-Host "[4/4] Seeding Firestore..." -ForegroundColor Yellow
Set-Location $repoRoot
$seedResult = node tools/seed_firestore.js --emulator --project $ProjectId 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Firestore seeded successfully" -ForegroundColor Green
} else {
    Write-Host "⚠️ Seed may have failed (check output above)" -ForegroundColor Yellow
    Write-Host $seedResult
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Emulators are running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Create admin user in Emulator UI:" -ForegroundColor White
Write-Host "   - Open: http://127.0.0.1:4000" -ForegroundColor Gray
Write-Host "   - Go to Authentication tab" -ForegroundColor Gray
Write-Host "   - Add user: email=admin@local.dev, password=admin123456" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Set admin role in Firestore:" -ForegroundColor White
Write-Host "   - In Emulator UI → Firestore" -ForegroundColor Gray
Write-Host "   - Create: users/{uid}" -ForegroundColor Gray
Write-Host "   - Set field: role = 'admin' (string)" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Run Flutter app with emulators:" -ForegroundColor White
Write-Host "   cd superparty_flutter" -ForegroundColor Gray
Write-Host "   flutter run --dart-define=USE_EMULATORS=true" -ForegroundColor Gray
Write-Host ""
Write-Host "4. View emulator logs:" -ForegroundColor White
Write-Host "   Receive-Job -Job $($emulatorJob.Id) -Keep" -ForegroundColor Gray
Write-Host ""
Write-Host "5. Stop emulators:" -ForegroundColor White
Write-Host "   Stop-Job -Job $($emulatorJob.Id); Remove-Job -Job $($emulatorJob.Id)" -ForegroundColor Gray
Write-Host "   (Or press Ctrl+C in the emulator terminal)" -ForegroundColor Gray
Write-Host ""

# Keep script running (user can Ctrl+C to stop)
Write-Host "Emulators are running in background. Press Ctrl+C to stop this script (emulators will continue)." -ForegroundColor Yellow
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Seconds 5
        $jobState = Get-Job -Id $emulatorJob.Id -ErrorAction SilentlyContinue
        if ($null -eq $jobState -or $jobState.State -eq "Failed") {
            Write-Host "⚠️ Emulator job stopped unexpectedly" -ForegroundColor Yellow
            break
        }
    }
} catch {
    Write-Host "`nStopping..." -ForegroundColor Yellow
}
