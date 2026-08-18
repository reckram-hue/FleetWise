@echo off
echo ========================================
echo Opening PIN Fix Tool in Browser
echo ========================================
echo.

REM Try to open in default browser
start "" "%~dp0fix-drivers-simple.html"

echo.
echo The PIN fix tool should open in your browser.
echo If it doesn't open, manually open fix-drivers-simple.html in Chrome or Edge.
echo.
pause
