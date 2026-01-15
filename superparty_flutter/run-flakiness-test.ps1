# Flakiness Detection Script
# Runs Flutter tests multiple times with random seeds

$ErrorActionPreference = "Continue"
$rounds = 15
$failedRounds = @()
$allResults = @()

Write-Host "=== Flutter Test Flakiness Detection ===" -ForegroundColor Cyan
Write-Host "Running $rounds rounds with random seeds..." -ForegroundColor Yellow
Write-Host ""

for ($i = 1; $i -le $rounds; $i++) {
    $seed = Get-Random -Minimum 1 -Maximum 2147483647
    Write-Host "[Round $i/$rounds] Running with seed: $seed" -ForegroundColor Yellow
    
    $startTime = Get-Date
    $output = puro flutter test -r expanded -j 1 --timeout 60s --test-randomize-ordering-seed $seed 2>&1
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    $exitCode = $LASTEXITCODE
    
    $result = @{
        Round = $i
        Seed = $seed
        ExitCode = $exitCode
        Duration = [math]::Round($duration, 2)
        Passed = ($exitCode -eq 0)
        Output = $output
    }
    
    $allResults += $result
    
    if ($exitCode -eq 0) {
        Write-Host "  [PASS] Round $i passed ($([math]::Round($duration, 2))s)" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Round $i FAILED (seed: $seed, $([math]::Round($duration, 2))s)" -ForegroundColor Red
        $failedRounds += $result
        Write-Host ""
        Write-Host "Last 150 lines of output:" -ForegroundColor Yellow
        $output | Select-Object -Last 150 | ForEach-Object { Write-Host $_ }
        Write-Host ""
        break  # Stop on first failure for analysis
    }
    
    Write-Host ""
}

Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Total rounds: $rounds" -ForegroundColor White
Write-Host "Passed: $($rounds - $failedRounds.Count)" -ForegroundColor Green
Write-Host "Failed: $($failedRounds.Count)" -ForegroundColor $(if ($failedRounds.Count -eq 0) { "Green" } else { "Red" })

if ($failedRounds.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed rounds:" -ForegroundColor Red
    foreach ($fail in $failedRounds) {
        Write-Host "  Round $($fail.Round) - Seed: $($fail.Seed)" -ForegroundColor Red
    }
    exit 1
} else {
    Write-Host ""
    Write-Host "[SUCCESS] All rounds passed! No flakiness detected." -ForegroundColor Green
    exit 0
}
