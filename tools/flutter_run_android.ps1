# flutter_run_android.ps1
# Flutter Run Script pentru Android - cu cleanup symlinks

Write-Host "=== Flutter Run Android Script ===" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

# Step 1: Get repository root
Write-Host "`n[1/6] Getting repository root..." -ForegroundColor Yellow
try {
    $root = git rev-parse --show-toplevel 2>$null
    if (-not $root -or -not (Test-Path "$root\.git")) {
        Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
        Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
        Write-Host "  Sau rulează: .\tools\recover_repo.ps1" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ Repository root: $root" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to get repository root: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Set Flutter in PATH for this session
Write-Host "`n[2/6] Setting Flutter in PATH..." -ForegroundColor Yellow
$flutterPath = "$env:USERPROFILE\flutter\bin"
if (Test-Path $flutterPath) {
    $env:Path = "$flutterPath;$env:Path"
    Write-Host "✓ Flutter added to PATH: $flutterPath" -ForegroundColor Green
} else {
    Write-Host "⚠ Flutter not found at: $flutterPath" -ForegroundColor Yellow
    Write-Host "  Make sure Flutter is installed or update the path in this script" -ForegroundColor Yellow
}

# Verify Flutter is accessible
$flutterVersion = flutter --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Flutter not found in PATH. Check installation." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Flutter is accessible" -ForegroundColor Green

# Step 3: Navigate to Flutter project
Write-Host "`n[3/6] Navigating to Flutter project..." -ForegroundColor Yellow
$flutterDir = Join-Path $root "superparty_flutter"
if (-not (Test-Path $flutterDir)) {
    Write-Host "✗ Flutter project not found at: $flutterDir" -ForegroundColor Red
    exit 1
}
Set-Location $flutterDir
Write-Host "✓ In Flutter project directory" -ForegroundColor Green

# Step 4: Kill Java/Gradle processes that might lock files
Write-Host "`n[4/8] Checking for Java/Gradle processes..." -ForegroundColor Yellow
$javaProcesses = Get-Process -Name "java" -ErrorAction SilentlyContinue
if ($javaProcesses) {
    Write-Host "⚠ Found $($javaProcesses.Count) Java process(es) - killing to release file locks" -ForegroundColor Yellow
    $javaProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "✓ Java processes stopped" -ForegroundColor Green
} else {
    Write-Host "✓ No Java processes running" -ForegroundColor Green
}

# Step 5: Cleanup locked symlinks folder (best-effort)
Write-Host "`n[5/8] Cleaning up locked symlinks folder..." -ForegroundColor Yellow
$symlinksPath = Join-Path $flutterDir "windows\flutter\ephemeral\.plugin_symlinks"
if (Test-Path $symlinksPath) {
    try {
        Remove-Item -Path $symlinksPath -Recurse -Force -ErrorAction Stop
        Write-Host "✓ Symlinks folder deleted: $symlinksPath" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Could not delete symlinks folder (may be locked): $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  This is usually OK - Flutter will recreate it" -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ Symlinks folder doesn't exist (nothing to clean)" -ForegroundColor Green
}

# Step 6: Cleanup build folder (best-effort) - fixes "Unable to delete directory" errors
Write-Host "`n[6/8] Cleaning up build folder (best-effort)..." -ForegroundColor Yellow
$buildPath = Join-Path $flutterDir "build"
if (Test-Path $buildPath) {
    try {
        # Try to delete problematic cloud_firestore build folder
        $cloudFirestoreBuild = Join-Path $buildPath "cloud_firestore"
        if (Test-Path $cloudFirestoreBuild) {
            Write-Host "  Attempting to delete cloud_firestore build folder..." -ForegroundColor Cyan
            Remove-Item -Path $cloudFirestoreBuild -Recurse -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
        }
        Write-Host "✓ Build folder cleanup attempted" -ForegroundColor Green
    } catch {
        Write-Host "⚠ Could not fully clean build folder: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  Flutter clean will handle this" -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ Build folder doesn't exist (nothing to clean)" -ForegroundColor Green
}

# Step 7: Flutter clean
Write-Host "`n[7/9] Running flutter clean..." -ForegroundColor Yellow
try {
    flutter clean
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ flutter clean FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "  Check output above for errors" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ flutter clean completed" -ForegroundColor Green
} catch {
    Write-Host "✗ flutter clean FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 8: Flutter pub get
Write-Host "`n[8a/9] Running flutter pub get..." -ForegroundColor Yellow
try {
    flutter pub get
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ flutter pub get FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "  This may indicate symlink issues with plugins" -ForegroundColor Yellow
        Write-Host "  Check output above for 'symlink' or 'Developer Mode' errors" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ flutter pub get completed" -ForegroundColor Green
} catch {
    Write-Host "✗ flutter pub get FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 9: Flutter run
Write-Host "`n[8b/9] Running flutter run..." -ForegroundColor Yellow
Write-Host "  (Ensure T1 emulators are running first)" -ForegroundColor Cyan
try {
    flutter run --dart-define=USE_EMULATORS=true
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ flutter run FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "  Check output above for errors" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "✗ flutter run FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Flutter Run Completed ===" -ForegroundColor Green
