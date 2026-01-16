@echo off
REM scripts/flutter_reset_windows.bat
REM Wrapper for flutter_reset_windows.ps1

setlocal

REM Get script directory
set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%flutter_reset_windows.ps1"

REM Check if PowerShell script exists
if not exist "%PS_SCRIPT%" (
    echo Error: PowerShell script not found: %PS_SCRIPT%
    exit /b 1
)

REM Run PowerShell script
powershell.exe -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*

endlocal
