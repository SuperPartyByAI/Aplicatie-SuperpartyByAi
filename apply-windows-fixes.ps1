# Script PowerShell pentru aplicarea fix-urilor Windows build
# Rulează din: C:\Users\ursac\Aplicatie-SuperpartyByAi_clean

Write-Host "=== Aplicare fix-uri Windows build ===" -ForegroundColor Cyan

$projectRoot = "C:\Users\ursac\Aplicatie-SuperpartyByAi_clean"
$flutterRoot = "$projectRoot\superparty_flutter"

# Verificare că suntem în directorul corect
if (-not (Test-Path $flutterRoot)) {
    Write-Host "EROARE: Nu găsesc $flutterRoot" -ForegroundColor Red
    Write-Host "Rulează acest script din $projectRoot" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n1. Verificare Flutter..." -ForegroundColor Yellow
Set-Location $flutterRoot
flutter --version

Write-Host "`n2. Backup fișiere..." -ForegroundColor Yellow
$backupDir = "$projectRoot\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$filesToBackup = @(
    "lib\screens\evenimente\evenimente_screen.dart",
    "lib\screens\dovezi\dovezi_screen.dart",
    "lib\services\evidence_service.dart",
    "lib\models\evidence_state_model.dart",
    "lib\models\evidence_model.dart"
)

foreach ($file in $filesToBackup) {
    $source = Join-Path $flutterRoot $file
    if (Test-Path $source) {
        $dest = Join-Path $backupDir $file
        $destDir = Split-Path $dest -Parent
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        Copy-Item $source $dest
        Write-Host "  Backup: $file" -ForegroundColor Gray
    }
}

Write-Host "`nBackup salvat în: $backupDir" -ForegroundColor Green

Write-Host "`n3. Cea mai simplă soluție: Pull branch-ul cu fix-uri" -ForegroundColor Yellow
Write-Host @"

Opțiunea 1 (RECOMANDAT):
------------------------
cd $projectRoot
git fetch origin
git checkout fix/ai-chat-region-and-key-handling
git pull origin fix/ai-chat-region-and-key-handling

cd superparty_flutter
flutter clean
flutter pub get
flutter analyze
flutter run -d windows

Opțiunea 2 (Manual):
--------------------
Aplică fix-urile din WINDOWS_BUILD_FIX.md

"@ -ForegroundColor Cyan

Write-Host "`nDorești să fac pull automat? (y/n): " -ForegroundColor Yellow -NoNewline
$response = Read-Host

if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host "`n4. Pull branch cu fix-uri..." -ForegroundColor Yellow
    Set-Location $projectRoot
    
    git fetch origin
    if ($LASTEXITCODE -ne 0) {
        Write-Host "EROARE: git fetch a eșuat" -ForegroundColor Red
        exit 1
    }
    
    git checkout fix/ai-chat-region-and-key-handling
    if ($LASTEXITCODE -ne 0) {
        Write-Host "EROARE: git checkout a eșuat" -ForegroundColor Red
        exit 1
    }
    
    git pull origin fix/ai-chat-region-and-key-handling
    if ($LASTEXITCODE -ne 0) {
        Write-Host "EROARE: git pull a eșuat" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`n5. Rebuild Flutter..." -ForegroundColor Yellow
    Set-Location $flutterRoot
    
    flutter clean
    flutter pub get
    
    Write-Host "`n6. Analiză cod..." -ForegroundColor Yellow
    flutter analyze
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ SUCCESS: flutter analyze - 0 erori" -ForegroundColor Green
        Write-Host "`nPoți rula acum:" -ForegroundColor Cyan
        Write-Host "  flutter run -d windows" -ForegroundColor White
    } else {
        Write-Host "`n⚠️  flutter analyze a găsit erori" -ForegroundColor Yellow
        Write-Host "Verifică output-ul de mai sus" -ForegroundColor Yellow
    }
} else {
    Write-Host "`nOK, aplică manual fix-urile din WINDOWS_BUILD_FIX.md" -ForegroundColor Yellow
}

Write-Host "`n=== Finalizat ===" -ForegroundColor Cyan
