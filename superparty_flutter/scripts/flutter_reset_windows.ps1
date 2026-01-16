# scripts/flutter_reset_windows.ps1
# Flutter Build Reset Script for Windows
# Fixes file locks (kernel_blob.bin, mergeDebugAssets) by killing processes and cleaning build folders

param(
    [switch]$RunAfterClean = $false,
    [string]$Device = ""
)

$ErrorActionPreference = "Stop"
Write-Host "=== Flutter Build Reset (Windows) ===" -ForegroundColor Cyan

# Helper functions
function Try-Kill($name) {
    try {
        $processes = Get-Process -Name $name -ErrorAction SilentlyContinue
        if ($processes) {
            Write-Host "  Killing $name processes..." -ForegroundColor Yellow
            taskkill /F /IM $name /T 2>$null | Out-Null
            Start-Sleep -Milliseconds 500
            return $true
        }
        return $false
    } catch {
        return $false
    }
}

function Try-RmDir($path) {
    try {
        if (Test-Path $path) {
            Write-Host "  Deleting: $path" -ForegroundColor Yellow
            cmd /c "rmdir /s /q `"$path`"" 2>$null | Out-Null
            Start-Sleep -Milliseconds 300
            return $true
        }
        return $false
    } catch {
        Write-Host "  ⚠️ Could not delete: $path (may be locked)" -ForegroundColor Yellow
        return $false
    }
}

# Check if project is in OneDrive
$currentPath = Get-Location
if ($currentPath -like "*OneDrive*") {
    Write-Host "`n⚠️  WARNING: Project is in OneDrive path!" -ForegroundColor Yellow
    Write-Host "   OneDrive sync can cause file locks during build." -ForegroundColor Yellow
    Write-Host "   Recommendation: Move project to C:\dev\ or pause OneDrive sync." -ForegroundColor Yellow
    Write-Host "   Press Ctrl+C to cancel, or Enter to continue..." -ForegroundColor Yellow
    $null = Read-Host
}

# Step 1: Get Flutter path
Write-Host "`n[1/8] Setting Flutter in PATH..." -ForegroundColor Yellow
$flutterBin = Join-Path $env:USERPROFILE "flutter\bin"
if (Test-Path (Join-Path $flutterBin "flutter.bat")) {
    $env:Path = "$flutterBin;$env:Path"
    Write-Host "✓ Flutter added to PATH" -ForegroundColor Green
} else {
    Write-Host "⚠️ Flutter not found at: $flutterBin" -ForegroundColor Yellow
    Write-Host "  Update path in script or ensure Flutter is installed" -ForegroundColor Yellow
}

# Step 2: Get repository root
Write-Host "`n[2/8] Verifying repository..." -ForegroundColor Yellow
$root = (git rev-parse --show-toplevel 2>$null)
if (-not $root) {
    Write-Host "⚠️ Not in git repository, using current directory" -ForegroundColor Yellow
    $root = $currentPath
} else {
    Write-Host "✓ Repository root: $root" -ForegroundColor Green
}

$flutterDir = Join-Path $root "superparty_flutter"
if (-not (Test-Path $flutterDir)) {
    Write-Host "✗ Flutter project not found: $flutterDir" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Flutter project: $flutterDir" -ForegroundColor Green

Set-Location $flutterDir

# Step 3: Stop Gradle daemon
Write-Host "`n[3/8] Stopping Gradle daemon..." -ForegroundColor Yellow
$gradlew = Join-Path $flutterDir "android\gradlew.bat"
if (Test-Path $gradlew) {
    try {
        & $gradlew --stop 2>$null | Out-Null
        Write-Host "✓ Gradle daemon stopped" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Could not stop Gradle daemon (may not be running)" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️ gradlew.bat not found, skipping" -ForegroundColor Yellow
}

# Step 4: Kill blocking processes
Write-Host "`n[4/8] Killing processes that lock files..." -ForegroundColor Yellow
$killed = @()
if (Try-Kill "dart.exe") { $killed += "dart.exe" }
if (Try-Kill "java.exe") { $killed += "java.exe" }
if (Try-Kill "gradle.exe") { $killed += "gradle.exe" }
if (Try-Kill "flutter.exe") { $killed += "flutter.exe" }

# Also try to kill adb if it's blocking (rare but possible)
$adbProcesses = Get-Process -Name "adb" -ErrorAction SilentlyContinue
if ($adbProcesses) {
    Write-Host "  Found adb processes, but keeping them (needed for emulator)" -ForegroundColor Yellow
}

if ($killed.Count -gt 0) {
    Write-Host "✓ Killed: $($killed -join ', ')" -ForegroundColor Green
} else {
    Write-Host "✓ No blocking processes found" -ForegroundColor Green
}

Start-Sleep -Seconds 2

# Step 5: Clean build folders
Write-Host "`n[5/8] Cleaning build folders..." -ForegroundColor Yellow
$cleaned = @()

if (Try-RmDir (Join-Path $flutterDir "build")) { $cleaned += "build" }
if (Try-RmDir (Join-Path $flutterDir ".dart_tool")) { $cleaned += ".dart_tool" }
if (Try-RmDir (Join-Path $flutterDir "android\app\build")) { $cleaned += "android/app/build" }
if (Try-RmDir (Join-Path $flutterDir "android\.gradle")) { $cleaned += "android/.gradle" }
if (Try-RmDir (Join-Path $flutterDir "windows\flutter\ephemeral\.plugin_symlinks")) { $cleaned += "windows/.../.plugin_symlinks" }

if ($cleaned.Count -gt 0) {
    Write-Host "✓ Cleaned: $($cleaned -join ', ')" -ForegroundColor Green
} else {
    Write-Host "✓ No build folders found (already clean)" -ForegroundColor Green
}

# Step 6: Flutter clean
Write-Host "`n[6/8] Running flutter clean..." -ForegroundColor Yellow
try {
    & flutter clean 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ flutter clean completed" -ForegroundColor Green
    } else {
        Write-Host "⚠️ flutter clean had warnings (continuing anyway)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ flutter clean error (continuing anyway): $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 7: Flutter pub get
Write-Host "`n[7/8] Running flutter pub get..." -ForegroundColor Yellow
try {
    & flutter pub get 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ flutter pub get completed" -ForegroundColor Green
    } else {
        Write-Host "✗ flutter pub get FAILED" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ flutter pub get FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 8: Optional - Run Flutter
if ($RunAfterClean) {
    Write-Host "`n[8/8] Running Flutter app..." -ForegroundColor Yellow
    
    $runArgs = @()
    if ($Device) {
        $runArgs += "-d"
        $runArgs += $Device
    }
    
    Write-Host "  Command: flutter run $($runArgs -join ' ')" -ForegroundColor Cyan
    & flutter run @runArgs
} else {
    Write-Host "`n[8/8] Build reset complete!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  - Run: flutter run" -ForegroundColor White
    Write-Host "  - Or: flutter build apk" -ForegroundColor White
    Write-Host "  - Or: Re-run this script with -RunAfterClean flag" -ForegroundColor White
}

Write-Host "`n=== Done ===" -ForegroundColor Green
