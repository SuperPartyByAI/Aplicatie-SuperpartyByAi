# Get Firebase Auth Emulator ID Token
# Usage: $token = .\scripts\get-auth-emulator-token.ps1
#        OR: .\scripts\get-auth-emulator-token.ps1 [email] [password]

param(
    [string]$Email = "test@example.com",
    [string]$Password = "test123456",
    [string]$AuthEmulatorHost = "127.0.0.1:9098"
)

$ErrorActionPreference = "Stop"

# Suppress verbose output when capturing token
$VerbosePreference = "SilentlyContinue"

# 1) Check if Auth Emulator is running
try {
    $testConnection = Test-NetConnection -ComputerName 127.0.0.1 -Port 9098 -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $testConnection) {
        Write-Error "Auth Emulator not running on port 9098. Start emulators first: firebase.cmd emulators:start --only auth" -ErrorAction Stop
    }
} catch {
    Write-Error "Cannot check Auth Emulator: $_" -ErrorAction Stop
}

# 2) Sign up or sign in
$authUrl = "http://$AuthEmulatorHost/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key"
$signInUrl = "http://$AuthEmulatorHost/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key"

# Build request body using ConvertTo-Json (robust JSON escaping)
$requestBody = @{
    email = $Email
    password = $Password
    returnSecureToken = $true
} | ConvertTo-Json -Compress

$idToken = $null
$authSuccess = $false

# Try sign up first
try {
    $signUpResponse = Invoke-RestMethod -Uri $authUrl -Method Post -Body $requestBody -ContentType "application/json" -ErrorAction Stop
    $idToken = $signUpResponse.idToken
    $authSuccess = $true
} catch {
    # Sign up failed, will try sign in below
    $authSuccess = $false
}

# If sign up failed, try sign in
if (-not $authSuccess) {
    try {
        $signInResponse = Invoke-RestMethod -Uri $signInUrl -Method Post -Body $requestBody -ContentType "application/json" -ErrorAction Stop
        $idToken = $signInResponse.idToken
        $authSuccess = $true
    } catch {
        Write-Error "Authentication failed: $_" -ErrorAction Stop
    }
}

# 3) Validate token
if ([string]::IsNullOrEmpty($idToken)) {
    Write-Error "No token received" -ErrorAction Stop
}

# 4) Output token on stdout (for easy capture: $token = .\scripts\get-auth-emulator-token.ps1)
Write-Output $idToken
