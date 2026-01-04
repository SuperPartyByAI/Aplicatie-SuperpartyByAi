@echo off
setlocal EnableDelayedExpansion

REM Usage: scripts\save_chat_clipboard_and_push.cmd "Titlu sesiune"
if "%~1"=="" (
  echo Usage: %~nx0 "Titlu sesiune"
  exit /b 1
)

for /f "delims=" %%R in ('git rev-parse --show-toplevel') do set "ROOT=%%R"
cd /d "%ROOT%"

for /f "delims=" %%S in ('git rev-parse HEAD') do set "SHA=%%S"
for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%B"

for /f "delims=" %%T in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('yyyy-MM-dd-HHmmss')"') do set "TS=%%T"
for /f "delims=" %%U in ('powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss ''UTC''')"') do set "UTC=%%U"

if not exist "docs" mkdir "docs"
if not exist "docs\ai" mkdir "docs\ai"
if not exist "docs\ai\sessions" mkdir "docs\ai\sessions"

set "SESSION=docs\ai\sessions\SESSION-%TS%-CHAT.md"
set "CHATLOG=docs\ai\CHATLOG.md"
set "TITLE=%~1"

if not exist "%CHATLOG%" (
  > "%CHATLOG%" (
    echo # CHATLOG — SuperPartyByAI ^(append-only^)
    echo.
    echo Regulă: nu lipim conversații brute; salvăm doar logică/decizii/next steps. Fără secrete.
  )
)

> "%SESSION%" (
  echo # CHAT SESSION — %TITLE%
  echo.
  echo - Timestamp: %UTC%
  echo - Branch: %BRANCH%
  echo - Commit (before save): %SHA%
  echo.
  echo ## Transcript (din clipboard)
  echo ```text
)

powershell -NoProfile -Command ^
  "$t=Get-Clipboard -Raw; if([string]::IsNullOrWhiteSpace($t)){Write-Host 'Clipboard gol. Copiază conversația (Ctrl+A, Ctrl+C) și rulează din nou.'; exit 2} ; Add-Content -Encoding UTF8 -Path '%SESSION%' -Value $t; Add-Content -Encoding UTF8 -Path '%SESSION%' -Value '```'"

if errorlevel 2 (
  echo Clipboard gol. Nu am salvat nimic.
  exit /b 2
)

>> "%CHATLOG%" (
  echo.
  echo ### %UTC% — %TITLE%
  echo - Branch: %BRANCH%
  echo - Session file: %SESSION%
)

echo Saved: %SESSION%
echo Updated: %CHATLOG%

git add "%SESSION%" "%CHATLOG%" "scripts\save_chat_clipboard_and_push.cmd"
if errorlevel 1 exit /b 1

git commit -m "docs(ai): save chat transcript (%TS%)"
if errorlevel 1 exit /b 1

git push
if errorlevel 1 exit /b 1

echo Done: saved + committed + pushed.
endlocal
