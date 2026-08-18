@echo off
echo ========================================
echo FleetWise PIN Fix Tool
echo ========================================
echo.
echo This will:
echo 1. Add PIN (1234) to all your drivers
echo 2. Deploy Cloud Functions
echo 3. Start your app
echo.
pause

echo.
echo Step 1: Fixing driver PINs...
echo ========================================
node fix-pins-easy.cjs

if errorlevel 1 (
    echo.
    echo ❌ Error fixing PINs!
    echo Please check the error message above.
    pause
    exit /b 1
)

echo.
echo ✅ PINs fixed successfully!
echo.
pause

echo.
echo Step 2: Deploying Cloud Functions...
echo ========================================
echo This may take 2-3 minutes, please wait...
echo.
cd functions
call firebase deploy --only functions

if errorlevel 1 (
    echo.
    echo ❌ Error deploying functions!
    echo Make sure you're logged into Firebase.
    echo Try: firebase login
    pause
    cd ..
    exit /b 1
)

cd ..
echo.
echo ✅ Cloud Functions deployed!
echo.
pause

echo.
echo Step 3: Starting your app...
echo ========================================
echo.
echo Your app will start now.
echo Press Ctrl+C to stop it when done testing.
echo.
pause

npm run dev
