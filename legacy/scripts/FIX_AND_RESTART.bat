@echo off
echo ========================================
echo Fix API Key Error - Rebuild App
echo ========================================
echo.
echo This will:
echo 1. Clean build your app
echo 2. Restart with proper Firebase config
echo 3. Test if API key works
echo.
pause

cd /d "%~dp0"

echo.
echo Stopping any running servers...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Building app with environment variables...
echo ========================================
call npm run build

if errorlevel 1 (
    echo.
    echo ❌ Build failed!
    echo Check for errors above.
    pause
    exit /b 1
)

echo.
echo ✅ Build successful!
echo.
echo Starting dev server...
echo ========================================
echo.
echo Your app will start now.
echo.
echo Test admin login at: http://localhost:5173
echo 1. Click "I'm an Admin"
echo 2. Enter your Firebase Auth email/password
echo.
echo Press Ctrl+C to stop the server when done.
echo.
pause

call npm run dev
