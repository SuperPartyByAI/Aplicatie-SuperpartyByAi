# fix_build_locks.ps1
# Fix pentru file locking în build folder (OneDrive issue)

Write-Host "=== Fix Build Folder Locks ===" -ForegroundColor Cyan

$root = git rev-parse --show-toplevel 2>$null
if (-not $root) {
    Write-Host "✗ Not in git repository" -ForegroundColor Red
    exit 1
}

$flutterDir = Join-Path $root "superparty_flutter"
$buildPath = Join-Path $flutterDir "build"

Write-Host "`n[1/3] Stopping Java/Gradle processes..." -ForegroundColor Yellow
$javaProcesses = Get-Process -Name "java" -ErrorAction SilentlyContinue
if ($javaProcesses) {
    $javaProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "✓ Stopped $($javaProcesses.Count) Java process(es)" -ForegroundColor Green
} else {
    Write-Host "✓ No Java processes running" -ForegroundColor Green
}

Write-Host "`n[2/3] Deleting problematic build folder..." -ForegroundColor Yellow
$cloudFirestoreBuild = Join-Path $buildPath "cloud_firestore"
if (Test-Path $cloudFirestoreBuild) {
    Write-Host "  Path: $cloudFirestoreBuild" -ForegroundColor Cyan
    try {
        Remove-Item -Path $cloudFirestoreBuild -Recurse -Force -ErrorAction Stop
        Write-Host "✓ cloud_firestore build folder deleted" -ForegroundColor Green
    } catch {
        Write-Host "✗ Failed to delete: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`nTry manually:" -ForegroundColor Yellow
        Write-Host "  1. Close Cursor/Android Studio" -ForegroundColor White
        Write-Host "  2. Stop all Java processes in Task Manager" -ForegroundColor White
        Write-Host "  3. Run: Remove-Item -Path '$cloudFirestoreBuild' -Recurse -Force" -ForegroundColor White
        Write-Host "  4. Or move repo out of OneDrive: C:\dev\Aplicatie-SuperpartyByAi" -ForegroundColor White
        exit 1
    }
} else {
    Write-Host "✓ cloud_firestore build folder doesn't exist" -ForegroundColor Green
}

Write-Host "`n[3/3] Running flutter clean..." -ForegroundColor Yellow
Set-Location $flutterDir
flutter clean
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Flutter clean completed" -ForegroundColor Green
} else {
    Write-Host "⚠ Flutter clean had issues (may need manual cleanup)" -ForegroundColor Yellow
}

Write-Host "`n=== Fix Complete ===" -ForegroundColor Green
Write-Host "You can now run: .\tools\flutter_run_android.ps1" -ForegroundColor Cyan
