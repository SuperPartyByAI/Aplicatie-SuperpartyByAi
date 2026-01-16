@echo off
REM scripts/adb_reverse_emulators.cmd
REM Wrapper for adb_reverse_emulators.ps1

setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%adb_reverse_emulators.ps1"

if not exist "%PS_SCRIPT%" (
    echo Error: PowerShell script not found: %PS_SCRIPT%
    exit /b 1
)

powershell.exe -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*

endlocal
