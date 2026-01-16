# qa_verify_windows.ps1
# QA Verification Script pentru Windows - Flutter Build

Write-Host "=== QA Verification Script (Windows) ===" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

# Step 1: Verify symlink support
Write-Host "`n[1/6] Verifying symlink support..." -ForegroundColor Yellow
$testDir = "$env:TEMP\symlink_test_$(Get-Random)"
$testLink = "$env:TEMP\symlink_link_$(Get-Random)"
try {
    New-Item -ItemType Directory -Path $testDir -Force | Out-Null
    New-Item -ItemType SymbolicLink -Path $testLink -Target $testDir -Force | Out-Null
    if (Test-Path $testLink) {
        Write-Host "✓ Symlink support works" -ForegroundColor Green
        Remove-Item $testLink -Force -ErrorAction SilentlyContinue
        Remove-Item $testDir -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "✗ Symlink support FAILED" -ForegroundColor Red
        Write-Host "  Enable Developer Mode: start ms-settings:developers" -ForegroundColor Yellow
        Write-Host "  Then restart Cursor and run this script again" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "✗ Symlink creation FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Enable Developer Mode: start ms-settings:developers" -ForegroundColor Yellow
    Write-Host "  Then restart Cursor and run this script again" -ForegroundColor Yellow
    Remove-Item $testDir -Force -ErrorAction SilentlyContinue
    exit 1
}

# Step 2: Get root directory
Write-Host "`n[2/6] Getting repository root..." -ForegroundColor Yellow
try {
    $root = git rev-parse --show-toplevel
    if (-not $root) {
        Write-Host "✗ Not in a git repository" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Repository root: $root" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to get repository root: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Make sure you're in the repository directory" -ForegroundColor Yellow
    exit 1
}

# Step 3: Navigate to Flutter project
Write-Host "`n[3/6] Navigating to Flutter project..." -ForegroundColor Yellow
$flutterDir = Join-Path $root "superparty_flutter"
if (-not (Test-Path $flutterDir)) {
    Write-Host "✗ Flutter project not found at: $flutterDir" -ForegroundColor Red
    exit 1
}
Set-Location $flutterDir
Write-Host "✓ In Flutter project directory" -ForegroundColor Green

# Step 4: Flutter clean
Write-Host "`n[4/6] Running flutter clean..." -ForegroundColor Yellow
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

# Step 5: Flutter pub get
Write-Host "`n[5/6] Running flutter pub get..." -ForegroundColor Yellow
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

# Step 6: Flutter analyze
Write-Host "`n[6a/8] Running flutter analyze..." -ForegroundColor Yellow
try {
    flutter analyze --fatal-infos --fatal-warnings
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ flutter analyze FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "  Fix warnings/infos above, then re-run" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ flutter analyze passed" -ForegroundColor Green
} catch {
    Write-Host "✗ flutter analyze FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 7: Flutter test
Write-Host "`n[6b/8] Running flutter test..." -ForegroundColor Yellow
try {
    flutter test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ flutter test FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "  Check test output above for failures" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ flutter test passed" -ForegroundColor Green
} catch {
    Write-Host "✗ flutter test FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 8: Flutter build
Write-Host "`n[6c/8] Running flutter build apk --debug..." -ForegroundColor Yellow
try {
    flutter build apk --debug
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ flutter build FAILED (exit code: $LASTEXITCODE)" -ForegroundColor Red
        Write-Host "  Check build output above for errors" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ flutter build completed successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ flutter build FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== ALL CHECKS PASSED ===" -ForegroundColor Green
Write-Host "Flutter build verification completed successfully!" -ForegroundColor Green
Write-Host "`nTo run the app on emulator, use:" -ForegroundColor Cyan
Write-Host "  flutter run --dart-define=USE_EMULATORS=true" -ForegroundColor White
Write-Host "`n(Ensure T1 emulators are running first)" -ForegroundColor Yellow
