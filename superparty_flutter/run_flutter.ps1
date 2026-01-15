# Script helper pentru a rula Flutter cu puro.exe
# Utilizare: .\run_flutter.ps1 analyze
#          .\run_flutter.ps1 test

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Command,
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Args = @()
)

# Gaseste puro.exe
$puro = (Get-ChildItem `
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\puro.exe", `
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\puro.exe" `
    -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName)

if (-not $puro) {
    Write-Host "Eroare: puro.exe nu a fost gasit in PATH sau WindowsApps" -ForegroundColor Red
    Write-Host "Instaleaza puro de la: https://puro.dev" -ForegroundColor Yellow
    exit 1
}

# Construieste comanda
$fullCommand = "flutter $Command"
if ($Args.Count -gt 0) {
    $fullCommand += " " + ($Args -join " ")
}

Write-Host "Ruleaza: $fullCommand" -ForegroundColor Cyan
Write-Host "Folosind: $puro" -ForegroundColor Gray
Write-Host ""

# Ruleaza comanda
& $puro flutter $Command $Args

$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host "`nComanda completata cu succes!" -ForegroundColor Green
} else {
    Write-Host "`nComanda esuata cu exit code: $exitCode" -ForegroundColor Red
}

exit $exitCode