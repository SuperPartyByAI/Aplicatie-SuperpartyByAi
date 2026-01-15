# Smoke test for protected endpoints with Auth Emulator token
# Usage: .\scripts\test-protected-endpoint.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Protected Endpoint Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# 1) Get auth token
Write-Host "[1/3] Getting auth token..." -ForegroundColor Yellow
try {
    $token = & "$PSScriptRoot\get-auth-emulator-token.ps1" -Email "test@example.com" -Password "test123456"
    if ([string]::IsNullOrEmpty($token)) {
        Write-Host "  ✗ Failed to get token" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Token obtained (length: $($token.Length))" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Failed to get token: $_" -ForegroundColor Red
    exit 1
}

# 2) Check if Functions emulator is running
Write-Host "[2/3] Checking Functions emulator..." -ForegroundColor Yellow
try {
    $testConnection = Test-NetConnection -ComputerName 127.0.0.1 -Port 5002 -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $testConnection) {
        Write-Host "  ✗ Functions Emulator not running on port 5002" -ForegroundColor Red
        Write-Host "  Start emulators first: firebase.cmd emulators:start --only firestore,functions,auth" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  ✓ Functions Emulator is running" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Cannot check Functions Emulator: $_" -ForegroundColor Red
    exit 1
}

# 3) Test protected endpoint
Write-Host "[3/3] Testing protected endpoint..." -ForegroundColor Yellow

$endpointUrl = "http://127.0.0.1:5002/superparty-frontend/us-central1/whatsappProxyGetAccounts"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-WebRequest -Uri $endpointUrl -Method Get -Headers $headers -ErrorAction Stop
    
    Write-Host "  ✓ Request successful" -ForegroundColor Green
    Write-Host "  Status Code: $($response.StatusCode)" -ForegroundColor Green
    
    if ($response.StatusCode -eq 200) {
        Write-Host "  ✓ Endpoint returned 200 OK" -ForegroundColor Green
        $body = $response.Content | ConvertFrom-Json
        Write-Host "  Response: $($body | ConvertTo-Json -Compress)" -ForegroundColor Gray
    } elseif ($response.StatusCode -eq 401) {
        Write-Host "  ✗ Endpoint returned 401 Unauthorized (auth failed)" -ForegroundColor Red
        Write-Host "  Response: $($response.Content)" -ForegroundColor Red
        exit 1
    } elseif ($response.StatusCode -eq 403) {
        Write-Host "  ⚠ Endpoint returned 403 Forbidden (auth passed, but insufficient permissions)" -ForegroundColor Yellow
        Write-Host "  This is expected if user is not super-admin" -ForegroundColor Yellow
    } else {
        Write-Host "  ⚠ Endpoint returned $($response.StatusCode)" -ForegroundColor Yellow
        Write-Host "  Response: $($response.Content)" -ForegroundColor Gray
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message
    
    if ($statusCode -eq 401) {
        Write-Host "  ✗ Endpoint returned 401 Unauthorized (auth failed)" -ForegroundColor Red
        Write-Host "  Response: $errorBody" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Ensure FIREBASE_AUTH_EMULATOR_HOST is set (Firebase CLI sets this automatically)" -ForegroundColor Yellow
        Write-Host "  2. Verify admin.initializeApp() is called after env vars are set" -ForegroundColor Yellow
        Write-Host "  3. Check that token is valid: .\scripts\get-auth-emulator-token.ps1" -ForegroundColor Yellow
        exit 1
    } else {
        Write-Host "  ✗ Request failed: $_" -ForegroundColor Red
        Write-Host "  Status Code: $statusCode" -ForegroundColor Red
        Write-Host "  Response: $errorBody" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=== Smoke Test Complete ===" -ForegroundColor Cyan
Write-Host "✓ Auth token obtained and validated" -ForegroundColor Green
Write-Host "✓ Protected endpoint accessible (no 401 missing_auth_token)" -ForegroundColor Green
