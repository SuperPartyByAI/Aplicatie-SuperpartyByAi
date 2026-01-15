# Smoke test script for Firebase Functions emulator
# Tests that emulators start successfully and Functions load without errors

$ErrorActionPreference = "Stop"

Write-Host "=== Firebase Functions Emulator Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# 1) Check Node.js version
Write-Host "[1/6] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    Write-Host "  ✓ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Node.js not found in PATH" -ForegroundColor Red
    Write-Host "  Please install Node.js v20 or use nvm-windows to activate it" -ForegroundColor Red
    exit 1
}

# 2) Check Java (required for Firestore emulator)
Write-Host "[2/6] Checking Java..." -ForegroundColor Yellow
try {
    $javaVersion = java -version 2>&1 | Select-Object -First 1
    Write-Host "  ✓ Java found" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Java not found (required for Firestore emulator)" -ForegroundColor Red
    Write-Host "  Install Java 21+ or skip Firestore emulator" -ForegroundColor Red
}

# 3) Set environment variable
Write-Host "[3/6] Setting WHATSAPP_RAILWAY_BASE_URL..." -ForegroundColor Yellow
$env:WHATSAPP_RAILWAY_BASE_URL = "https://whats-upp-production.up.railway.app"
Write-Host "  ✓ WHATSAPP_RAILWAY_BASE_URL=$env:WHATSAPP_RAILWAY_BASE_URL" -ForegroundColor Green

# 4) Install dependencies (if needed)
Write-Host "[4/6] Installing Functions dependencies..." -ForegroundColor Yellow
Push-Location functions
if (-not (Test-Path "node_modules")) {
    Write-Host "  Running npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ npm install failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
} else {
    Write-Host "  ✓ node_modules exists, skipping install" -ForegroundColor Green
}
Pop-Location

# 5) Start emulators in background
Write-Host "[5/6] Starting Firebase emulators..." -ForegroundColor Yellow
Write-Host "  This may take 30-60 seconds..." -ForegroundColor Yellow

$emulatorProcess = Start-Process -FilePath "firebase.cmd" -ArgumentList "emulators:start","--config",".\firebase.json","--only","firestore,functions,auth","--project","superparty-frontend" -PassThru -NoNewWindow

# Wait for emulators to start (check ports)
Write-Host "  Waiting for emulators to start..." -ForegroundColor Yellow
$maxWait = 60
$waited = 0
$portsReady = $false

while ($waited -lt $maxWait -and -not $portsReady) {
    Start-Sleep -Seconds 2
    $waited += 2

    $port8082 = Test-NetConnection -ComputerName 127.0.0.1 -Port 8082 -InformationLevel Quiet -WarningAction SilentlyContinue
    $port5002 = Test-NetConnection -ComputerName 127.0.0.1 -Port 5002 -InformationLevel Quiet -WarningAction SilentlyContinue
    $port4001 = Test-NetConnection -ComputerName 127.0.0.1 -Port 4001 -InformationLevel Quiet -WarningAction SilentlyContinue

    if ($port8082 -and $port5002 -and $port4001) {
        $portsReady = $true
        Write-Host "  ✓ Emulators started (ports 8082, 5002, 4001 open)" -ForegroundColor Green
    } else {
        Write-Host "  Waiting... ($waited/$maxWait seconds)" -ForegroundColor Gray
    }
}

if (-not $portsReady) {
    Write-Host "  ✗ Emulators did not start within $maxWait seconds" -ForegroundColor Red
    Stop-Process -Id $emulatorProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# Wait a bit more for Functions to fully initialize
Start-Sleep -Seconds 5

# 6) Test endpoints
Write-Host "[6/6] Testing endpoints..." -ForegroundColor Yellow

# Test 1: Health endpoint
Write-Host "  Testing GET /health..." -ForegroundColor Yellow
try {
    $healthResponse = curl.exe -s http://127.0.0.1:5002/health 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    ✓ /health returned 200" -ForegroundColor Green
    } else {
        Write-Host "    ✗ /health failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    }
} catch {
    Write-Host "    ✗ /health failed: $_" -ForegroundColor Red
}

# Test 2: Root endpoint (triggers lazy load of WhatsAppManager)
Write-Host "  Testing GET /..." -ForegroundColor Yellow
try {
    $rootResponse = curl.exe -s http://127.0.0.1:5002/ 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    ✓ / returned 200" -ForegroundColor Green
    } else {
        Write-Host "    ✗ / failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
    }
} catch {
    Write-Host "    ✗ / failed: $_" -ForegroundColor Red
}

# Test 3: WhatsApp accounts endpoint (should return 401 without auth, but should NOT crash)
Write-Host "  Testing GET /api/whatsapp/accounts (no auth - should return 401, not crash)..." -ForegroundColor Yellow
try {
    $accountsResponse = curl.exe -s -w "%{http_code}" http://127.0.0.1:5002/api/whatsapp/accounts 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    ✓ /api/whatsapp/accounts returned (should be 401 without auth)" -ForegroundColor Green
    } else {
        Write-Host "    ✗ /api/whatsapp/accounts failed" -ForegroundColor Red
    }
} catch {
    Write-Host "    ✗ /api/whatsapp/accounts failed: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Smoke Test Complete ===" -ForegroundColor Cyan
Write-Host "Emulators are running. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

# Keep script running until user stops it
try {
    Wait-Process -Id $emulatorProcess.Id
} catch {
    Write-Host "Emulators stopped." -ForegroundColor Yellow
}
