@echo off
echo ========================================
echo Starting FleetWise System
echo ========================================
echo.
echo 1. Starting Backend Server (Port 3001)...
start "FleetWise Backend" /D "server" npm run dev

echo 2. Starting Frontend App (Port 5173)...
npm run dev
