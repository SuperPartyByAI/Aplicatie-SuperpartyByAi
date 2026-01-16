@echo off
REM tools/fix_local_emulators_windows.cmd
REM Wrapper for fix_local_emulators_windows.ps1

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0fix_local_emulators_windows.ps1" %*
if %ERRORLEVEL% NEQ 0 exit /b %ERRORLEVEL%
