@echo off
setlocal EnableDelayedExpansion

REM Usage: scripts\save_session.cmd "Titlu sesiune"
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

set "SESSION=docs\ai\sessions\SESSION-%TS%.md"
set "CHATLOG=docs\ai\CHATLOG.md"
set "TITLE=%~1"

REM Create CHATLOG if missing
if not exist "%CHATLOG%" (
  > "%CHATLOG%" (
    echo # CHATLOG — SuperPartyByAI ^(append-only^)
    echo.
    echo Regulă: nu lipim conversații brute; salvăm doar logică/decizii/next steps. Fără secrete.
  )
)

REM Write SESSION file
> "%SESSION%" (
  echo # SESSION — %TITLE%
  echo.
  echo - Timestamp: %UTC%
  echo - Branch: %BRANCH%
  echo - Commit: %SHA%
  echo.
  echo ## Rezumat
  echo - TODO
  echo.
  echo ## Decizii / Invariants
  echo - TODO
  echo.
  echo ## Next
  echo 1^) TODO
  echo 2^) TODO
  echo.
  echo ## Note
  echo - TODO
)

REM Append pointer to CHATLOG
>> "%CHATLOG%" (
  echo.
  echo ### %UTC% — %TITLE%
  echo - Commit: %SHA%
  echo - Session file: %SESSION%
)

echo Saved: %SESSION%
echo Updated: %CHATLOG%
echo Next:
echo   git add %SESSION% %CHATLOG% scripts\save_session.cmd
echo   git commit -m "docs(ai): save session"
echo   git push

endlocal
