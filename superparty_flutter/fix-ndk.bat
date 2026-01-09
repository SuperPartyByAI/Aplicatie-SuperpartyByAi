@echo off
echo Fixing corrupted NDK...
echo.

REM Delete the corrupted NDK folder
if exist "C:\Users\ursac\AppData\Local\Android\sdk\ndk\28.2.13676358" (
    echo Deleting corrupted NDK folder...
    rmdir /s /q "C:\Users\ursac\AppData\Local\Android\sdk\ndk\28.2.13676358"
    echo NDK folder deleted.
) else (
    echo NDK folder not found or already deleted.
)

echo.
echo NDK fix complete. Gradle will download a fresh NDK on next build.
echo.
pause
