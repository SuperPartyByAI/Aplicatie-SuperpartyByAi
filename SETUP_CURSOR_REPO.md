# Setup Cursor Repository - Pași Exacți Windows

## 1. Deschide Repo-ul Corect în Cursor

### Pași:

1. **Deschide Cursor**

2. **File → Open Folder** (sau `Ctrl+K Ctrl+O`)

3. **Selectează folderul repo:**
   ```
   C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi
   ```

4. **Verificare rapidă în terminal Cursor:**
   - Deschide terminal în Cursor (`Ctrl+`` sau View → Terminal)
   - Rulează:
   ```powershell
   Get-Location
   git status
   dir
   ```

**PASS criteriu:**
- `Get-Location` arată: `C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi`
- `git status` arată branch-ul și status-ul repo-ului (nu "not a git repository")
- `dir` arată: `.git`, `package.json`, `superparty_flutter`, `functions`, etc.

**FAIL semnal:**
- `Get-Location` arată alt path (ex: `C:\Windows\System32`)
- `git status` spune "not a git repository"
- `dir` nu arată `.git` sau `package.json`

**Fix:** Click pe folderul repo în sidebar-ul Cursor sau File → Open Folder din nou.

---

## 2. Recovery Flow PowerShell (dacă terminalul pornește în System32)

Salvează ca `tools\recover_repo.ps1` și rulează:

```powershell
# tools\recover_repo.ps1
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
```

**Cum rulezi:**
```powershell
# Chiar dacă ești în System32 sau alt loc
cd C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi
.\tools\recover_repo.ps1
```

SAU direct:
```powershell
.\tools\recover_repo.ps1
```
(scriptul te duce automat la Desktop și caută repo-ul)

---

## 3. Blocuri de Comenzi (T1/T2/T3) cu Verificare Root

### Terminal 1 (T1) - Emulators

```powershell
# Verificare root
$root = git rev-parse --show-toplevel 2>$null
if (-not $root -or -not (Test-Path "$root\.git")) {
    Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
    Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
    exit 1
}
cd $root
Write-Host "✓ Repository root: $root" -ForegroundColor Green

# Start emulators
npm run emu
```

**NOTĂ:** Terminalul T1 trebuie să rămână deschis - emulators trebuie să ruleze continuu.

---

### Terminal 2 (T2) - Seed + Functions

```powershell
# Verificare root
$root = git rev-parse --show-toplevel 2>$null
if (-not $root -or -not (Test-Path "$root\.git")) {
    Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
    Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
    exit 1
}
cd $root
Write-Host "✓ Repository root: $root" -ForegroundColor Green

# Seed
npm run seed:emu

# Așteaptă 3 secunde
Start-Sleep -Seconds 3

# Functions
cd functions
npm ci
npm test
npm run build
node test-event-creation.js
```

---

### Terminal 3 (T3) - Flutter

```powershell
# Verificare root
$root = git rev-parse --show-toplevel 2>$null
if (-not $root -or -not (Test-Path "$root\.git")) {
    Write-Host "✗ Nu ești în repo. Trebuie să dai cd în folderul repo sau să-l deschizi cu Open Folder." -ForegroundColor Red
    Write-Host "  Folder repo: C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi" -ForegroundColor Yellow
    exit 1
}
cd $root
Write-Host "✓ Repository root: $root" -ForegroundColor Green

# Flutter
cd superparty_flutter
flutter clean
flutter pub get
flutter analyze --fatal-infos --fatal-warnings
flutter test
flutter build apk --debug
flutter run --dart-define=USE_EMULATORS=true
```

---

## 4. Fallback Manual (dacă git rev-parse eșuează)

Dacă vezi eroarea: "Nu ești în repo. Trebuie să dai cd în folderul repo..."

**Fix manual:**

```powershell
# Opțiunea 1: cd direct
cd C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi

# Verifică că ești în locul corect
Get-Location
git status
Test-Path ".git"
Test-Path "package.json"

# Dacă toate sunt OK, rulează comenzile din nou
```

**Opțiunea 2: Deschide în Cursor**
1. File → Open Folder
2. Selectează: `C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi`
3. Deschide terminal nou în Cursor (va porni automat în repo)

---

## Quick Start (Copy-Paste Ready)

### Pasul 1: Deschide Cursor Corect
1. File → Open Folder
2. Selectează: `C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi`
3. Verifică: `Get-Location` în terminal arată path-ul corect

### Pasul 2: Dacă terminalul pornește greșit
```powershell
cd C:\Users\ursac\OneDrive\Desktop\Aplicatie-SuperpartyByAi
.\tools\recover_repo.ps1
```

### Pasul 3: Rulează T1/T2/T3
Folosește blocurile de mai sus (T1/T2/T3) - fiecare verifică root-ul automat.

---

## Verificare Finală

După setup, rulează:

```powershell
Get-Location
git rev-parse --show-toplevel
Test-Path "package.json"
Test-Path "superparty_flutter\pubspec.yaml"
Test-Path "functions\package.json"
```

**PASS criteriu:** Toate returnează `True` sau path-uri corecte

**FAIL semnal:** Orice returnează `False` sau path greșit → refă setup-ul
