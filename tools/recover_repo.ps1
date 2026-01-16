# recover_repo.ps1
# Recovery script - funcționează chiar dacă pornești în System32

Write-Host "=== Repository Recovery Script ===" -ForegroundColor Cyan

# Step 1: Navigate to common location
Write-Host "`n[1/4] Navigating to Desktop..." -ForegroundColor Yellow
$desktop = [Environment]::GetFolderPath("Desktop")
$oneDriveDesktop = Join-Path $env:USERPROFILE "OneDrive\Desktop"
if (Test-Path $oneDriveDesktop) {
    Set-Location $oneDriveDesktop
    Write-Host "✓ In OneDrive Desktop" -ForegroundColor Green
} else {
    Set-Location $desktop
    Write-Host "✓ In Desktop" -ForegroundColor Green
}

# Step 2: List directories
Write-Host "`n[2/4] Available directories:" -ForegroundColor Yellow
$dirs = Get-ChildItem -Directory | Where-Object { $_.Name -like "*Superparty*" -or $_.Name -like "*Aplicatie*" }
if ($dirs.Count -eq 0) {
    Write-Host "No matching directories found. Listing all:" -ForegroundColor Yellow
    $dirs = Get-ChildItem -Directory
}
$dirs | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor White }

# Step 3: Auto-detect or prompt
$repoName = "Aplicatie-SuperpartyByAi"
$repoPath = Join-Path (Get-Location) $repoName

if (-not (Test-Path $repoPath)) {
    Write-Host "`n[3/4] Repository not found at: $repoPath" -ForegroundColor Yellow
    Write-Host "Enter repository folder name (or full path):" -ForegroundColor Cyan
    $input = Read-Host
    if (Test-Path $input) {
        $repoPath = $input
    } else {
        $repoPath = Join-Path (Get-Location) $input
    }
}

if (-not (Test-Path $repoPath)) {
    Write-Host "✗ Repository not found: $repoPath" -ForegroundColor Red
    exit 1
}

Set-Location $repoPath
Write-Host "✓ Navigated to: $repoPath" -ForegroundColor Green

# Step 4: Verify .git and package.json
Write-Host "`n[4/4] Verifying repository..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    Write-Host "✗ .git folder not found - not a git repository" -ForegroundColor Red
    Write-Host "  Make sure you're in the correct folder" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ .git folder found" -ForegroundColor Green

if (-not (Test-Path "package.json")) {
    Write-Host "✗ package.json not found in root" -ForegroundColor Red
    Write-Host "  Make sure you're in the repository root" -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ package.json found" -ForegroundColor Green

Write-Host "`n=== Repository Ready ===" -ForegroundColor Green
Write-Host "Current directory: $(Get-Location)" -ForegroundColor Cyan
Write-Host "You can now run npm/flutter commands" -ForegroundColor Green
