# WhatsApp QR Connect + Test Message Automation
# Usage: .\scripts\whatsapp-connect-qr.ps1 -Name "SuperParty Main" -ToPhone "40373805828" -Message "Test from SuperParty!"

param(
    [Parameter(Mandatory=$true)]
    [string]$Name,
    
    [Parameter(Mandatory=$true)]
    [string]$ToPhone,
    
    [Parameter(Mandatory=$true)]
    [string]$Message,
    
    [string]$BaseUrl = "https://us-central1-superparty-frontend.cloudfunctions.net/whatsapp"
)

$ErrorActionPreference = "Stop"

Write-Host "=== WhatsApp QR Connect Automation ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Verify service health
Write-Host "[1/6] Checking service health..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$BaseUrl/" -Method GET -ErrorAction Stop
    Write-Host "  ✓ Service is online (version: $($healthResponse.version))" -ForegroundColor Green
} catch {
    Write-Error "Service health check failed: $_" -ErrorAction Stop
}

# Step 2: Create account (triggers QR generation)
Write-Host "[2/6] Creating account '$Name'..." -ForegroundColor Yellow
try {
    $body = @{
        name = $Name
    } | ConvertTo-Json -Compress
    
    $createResponse = Invoke-RestMethod -Uri "$BaseUrl/api/whatsapp/add-account" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
    
    if ($createResponse.success -and $createResponse.account) {
        $accountId = $createResponse.account.id
        Write-Host "  ✓ Account created: $accountId" -ForegroundColor Green
    } else {
        Write-Error "Failed to create account. Response: $($createResponse | ConvertTo-Json)" -ErrorAction Stop
    }
} catch {
    Write-Error "Account creation failed: $_" -ErrorAction Stop
}

# Step 3: Poll for QR code (max 60 seconds)
Write-Host "[3/6] Waiting for QR code..." -ForegroundColor Yellow
$qrCode = $null
$maxWaitSeconds = 60
$pollIntervalSeconds = 3
$elapsedSeconds = 0

while ($elapsedSeconds -lt $maxWaitSeconds -and -not $qrCode) {
    Start-Sleep -Seconds $pollIntervalSeconds
    $elapsedSeconds += $pollIntervalSeconds
    
    try {
        $accountsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/whatsapp/accounts" -Method GET -ErrorAction Stop
        
        if ($accountsResponse.success -and $accountsResponse.accounts -and $accountsResponse.accounts.Count -gt 0) {
            $account = $accountsResponse.accounts | Where-Object { $_.id -eq $accountId } | Select-Object -First 1
            
            if ($account -and $account.qrCode) {
                $qrCode = $account.qrCode
                Write-Host "  ✓ QR code received!" -ForegroundColor Green
                break
            }
        }
        
        Write-Host "  ... waiting for QR ($elapsedSeconds/$maxWaitSeconds seconds)" -ForegroundColor Gray
    } catch {
        Write-Host "  ⚠ Polling error: $_" -ForegroundColor Yellow
    }
}

if (-not $qrCode) {
    Write-Error "QR code not received within $maxWaitSeconds seconds. Please check the account manually." -ErrorAction Stop
}

# Step 4: Display QR code in browser
Write-Host "[4/6] Opening QR code in browser..." -ForegroundColor Yellow
try {
    $tempHtml = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.html'
    $htmlContent = @"
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR Code - $Name</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 32px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
        }
        h1 {
            color: #25D366;
            margin-bottom: 8px;
        }
        .instructions {
            color: #666;
            margin: 16px 0;
            line-height: 1.6;
        }
        img {
            max-width: 400px;
            border: 2px solid #25D366;
            border-radius: 8px;
            margin: 16px 0;
        }
        .warning {
            color: #ff9800;
            font-weight: bold;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>WhatsApp QR Code</h1>
        <p class="instructions">
            <strong>Account:</strong> $Name<br>
            <strong>Account ID:</strong> $accountId
        </p>
        <img src="$qrCode" alt="WhatsApp QR Code">
        <p class="instructions">
            1. Open WhatsApp on your phone<br>
            2. Go to Settings → Linked Devices<br>
            3. Tap "Link a Device"<br>
            4. Scan this QR code
        </p>
        <p class="warning">⚠ QR code expires in ~2 minutes</p>
    </div>
</body>
</html>
"@
    
    [System.IO.File]::WriteAllText($tempHtml, $htmlContent, [System.Text.Encoding]::UTF8)
    Start-Process $tempHtml
    Write-Host "  ✓ QR code opened in browser" -ForegroundColor Green
    Write-Host "  📱 Scan the QR code with WhatsApp now!" -ForegroundColor Cyan
} catch {
    Write-Error "Failed to open QR code: $_" -ErrorAction Stop
}

# Step 5: Poll for "connected" status (max 3 minutes)
Write-Host "[5/6] Waiting for connection..." -ForegroundColor Yellow
$connected = $false
$maxWaitSeconds = 180
$pollIntervalSeconds = 5
$elapsedSeconds = 0

while ($elapsedSeconds -lt $maxWaitSeconds -and -not $connected) {
    Start-Sleep -Seconds $pollIntervalSeconds
    $elapsedSeconds += $pollIntervalSeconds
    
    try {
        $accountsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/whatsapp/accounts" -Method GET -ErrorAction Stop
        
        if ($accountsResponse.success -and $accountsResponse.accounts) {
            $account = $accountsResponse.accounts | Where-Object { $_.id -eq $accountId } | Select-Object -First 1
            
            if ($account) {
                $status = $account.status
                Write-Host "  ... status: $status ($elapsedSeconds/$maxWaitSeconds seconds)" -ForegroundColor Gray
                
                if ($status -eq "connected") {
                    $connected = $true
                    Write-Host "  ✓ Account connected!" -ForegroundColor Green
                    break
                }
            }
        }
    } catch {
        Write-Host "  ⚠ Polling error: $_" -ForegroundColor Yellow
    }
}

if (-not $connected) {
    Write-Error "Account did not connect within $maxWaitSeconds seconds. Please check manually." -ErrorAction Stop
}

# Step 6: Send test message
Write-Host "[6/6] Sending test message..." -ForegroundColor Yellow
try {
    $sendBody = @{
        accountId = $accountId
        to = $ToPhone
        message = $Message
    } | ConvertTo-Json -Compress
    
    $sendResponse = Invoke-RestMethod -Uri "$BaseUrl/api/whatsapp/send" -Method POST -Body $sendBody -ContentType "application/json" -ErrorAction Stop
    
    if ($sendResponse.success) {
        Write-Host "  ✓ Message sent successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "=== SUCCESS ===" -ForegroundColor Green
        Write-Host "Account: $Name" -ForegroundColor White
        Write-Host "Account ID: $accountId" -ForegroundColor White
        Write-Host "Status: connected" -ForegroundColor White
        Write-Host "Test message sent to: $ToPhone" -ForegroundColor White
    } else {
        Write-Error "Message send failed. Response: $($sendResponse | ConvertTo-Json)" -ErrorAction Stop
    }
} catch {
    Write-Error "Failed to send message: $_" -ErrorAction Stop
}
