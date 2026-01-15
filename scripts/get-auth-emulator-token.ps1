# Get Firebase Auth Emulator ID Token
# Usage: .\scripts\get-auth-emulator-token.ps1 [email] [password]

param(
    [string]$Email = "test@example.com",
    [string]$Password = "test123456",
    [string]$AuthEmulatorHost = "127.0.0.1:9098"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Firebase Auth Emulator Token Generator ===" -ForegroundColor Cyan
Write-Host ""

# 1) Check if Auth Emulator is running
Write-Host "[1/4] Checking Auth Emulator..." -ForegroundColor Yellow
try {
    $testConnection = Test-NetConnection -ComputerName 127.0.0.1 -Port 9098 -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $testConnection) {
        Write-Host "  ✗ Auth Emulator not running on port 9098" -ForegroundColor Red
        Write-Host "  Start emulators first: firebase.cmd emulators:start --only auth" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "  ✓ Auth Emulator is running" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Cannot check Auth Emulator: $_" -ForegroundColor Red
    exit 1
}

# 2) Sign up or sign in
Write-Host "[2/4] Authenticating user..." -ForegroundColor Yellow

$authUrl = "http://$AuthEmulatorHost/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key"

# Build request body using ConvertTo-Json (robust JSON escaping)
$requestBody = @{
    email = $Email
    password = $Password
    returnSecureToken = $true
} | ConvertTo-Json -Compress

try {
    $signUpResponse = Invoke-RestMethod -Uri $authUrl -Method Post -Body $requestBody -ContentType "application/json" -ErrorAction Stop
    
    $idToken = $signUpResponse.idToken
    $localId = $signUpResponse.localId
    
    Write-Host "  ✓ User authenticated: $Email (ID: $localId)" -ForegroundColor Green
} catch {
    # If sign up fails (user might exist), try sign in
    Write-Host "  ⚠ Sign up failed, trying sign in..." -ForegroundColor Yellow
    
    $signInUrl = "http://$AuthEmulatorHost/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key"
    
    try {
        $signInResponse = Invoke-RestMethod -Uri $signInUrl -Method Post -Body $requestBody -ContentType "application/json" -ErrorAction Stop
        
        $idToken = $signInResponse.idToken
        $localId = $signInResponse.localId
        
        Write-Host "  ✓ User signed in: $Email (ID: $localId)" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Authentication failed: $_" -ForegroundColor Red
        Write-Host "  Response: $($_.Exception.Response)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        exit 1
    }
}

# 3) Validate token
Write-Host "[3/4] Validating token..." -ForegroundColor Yellow

if ([string]::IsNullOrEmpty($idToken)) {
    Write-Host "  ✗ No token received" -ForegroundColor Red
    exit 1
}

$tokenLength = $idToken.Length
Write-Host "  ✓ Token received (length: $tokenLength)" -ForegroundColor Green

# 4) Output token
Write-Host "[4/4] Token ready" -ForegroundColor Yellow
Write-Host ""

# Return token on stdout (for easy capture: $token = .\scripts\get-auth-emulator-token.ps1)
# Write to stdout first (before other output) so it can be captured
Write-Output $idToken

# Then show usage info
Write-Host "=== ID Token ===" -ForegroundColor Cyan
Write-Host $idToken -ForegroundColor White
Write-Host ""
Write-Host "=== Usage Example ===" -ForegroundColor Cyan
Write-Host "curl.exe -i http://127.0.0.1:5002/superparty-frontend/us-central1/whatsappProxyGetAccounts -H `"Authorization: Bearer $idToken`"" -ForegroundColor White
Write-Host ""
Write-Host "=== PowerShell Variable ===" -ForegroundColor Cyan
Write-Host "`$env:AUTH_TOKEN = `"$idToken`"" -ForegroundColor White
Write-Host ""
