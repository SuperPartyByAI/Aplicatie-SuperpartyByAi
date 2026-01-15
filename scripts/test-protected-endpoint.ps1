# Test protected Firebase Functions endpoint with Auth Emulator token
# Usage: .\scripts\test-protected-endpoint.ps1 [endpoint_path]

param(
    [string]$EndpointPath = "/superparty-frontend/us-central1/whatsappProxyGetAccounts",
    [string]$FunctionsHost = "127.0.0.1:5002"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Testing Protected Endpoint ===" -ForegroundColor Cyan
Write-Host ""

# 1) Get token
Write-Host "[1/3] Obtaining Auth Emulator token..." -ForegroundColor Yellow
try {
    $tokenScript = Join-Path $PSScriptRoot "get-auth-emulator-token.ps1"
    # Capture only stdout (token), ignore stderr
    $token = & $tokenScript 2>$null | Select-Object -First 1
    # Trim whitespace/newlines
    $token = $token.Trim()
    if ([string]::IsNullOrEmpty($token)) {
        Write-Error "Failed to obtain token" -ErrorAction Stop
    }
    Write-Host "  ✓ Token obtained (length: $($token.Length))" -ForegroundColor Green
} catch {
    Write-Error "Failed to get token: $_" -ErrorAction Stop
}

# 2) Check if Functions emulator is running
Write-Host "[2/3] Checking Functions Emulator..." -ForegroundColor Yellow
try {
    $testConnection = Test-NetConnection -ComputerName 127.0.0.1 -Port 5002 -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $testConnection) {
        Write-Error "Functions Emulator not running on port 5002. Start emulators first." -ErrorAction Stop
    }
    Write-Host "  ✓ Functions Emulator is running" -ForegroundColor Green
} catch {
    Write-Error "Cannot check Functions Emulator: $_" -ErrorAction Stop
}

# 3) Make request
Write-Host "[3/3] Calling protected endpoint..." -ForegroundColor Yellow
$url = "http://$FunctionsHost$EndpointPath"

try {
    # Ensure token is trimmed (no whitespace/newlines)
    $token = $token.Trim()
    $response = Invoke-WebRequest -Uri $url -Method GET -Headers @{
        "Authorization" = "Bearer $token"
    } -ErrorAction Stop
    
    Write-Host "  ✓ Request successful" -ForegroundColor Green
    Write-Host ""
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor White
    Write-Host "Response Body:" -ForegroundColor White
    Write-Host $response.Content -ForegroundColor Gray
    
    if ($response.StatusCode -eq 401) {
        Write-Host ""
        Write-Host "⚠ WARNING: Received 401 Unauthorized" -ForegroundColor Yellow
        Write-Host "This might indicate:" -ForegroundColor Yellow
        Write-Host "  - Token is invalid or expired" -ForegroundColor Yellow
        Write-Host "  - Auth Emulator is not properly configured" -ForegroundColor Yellow
        Write-Host "  - Functions emulator is not using Auth Emulator" -ForegroundColor Yellow
    } elseif ($response.StatusCode -eq 200) {
        Write-Host ""
        Write-Host "✓ SUCCESS: Endpoint responded with 200 OK" -ForegroundColor Green
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "  ✗ Request failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Status Code: $statusCode" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Error: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    if ($statusCode -eq 401) {
        Write-Host ""
        Write-Host "⚠ Received 401 Unauthorized - token may be invalid" -ForegroundColor Yellow
    }
    exit 1
}
