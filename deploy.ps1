# ============================================================================
# FLEETWISE ONE-CLICK FIREBASE DEPLOYMENT
# Run this script to deploy everything to Firebase
# ============================================================================

$ErrorActionPreference = "Stop"
$repoRoot = "C:\Users\User\Projects\FleetWise"

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "║       FLEETWISE FIREBASE DEPLOYMENT SCRIPT                ║" -ForegroundColor Cyan
Write-Host "║       Project: fleetwise-9ab3a                            ║" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Navigate to repo root
Set-Location $repoRoot
Write-Host "[1/6] ✓ Navigated to: $repoRoot" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 1: Install Cloud Functions Dependencies
# ============================================================================
Write-Host "[2/6] Installing Cloud Functions dependencies..." -ForegroundColor Yellow

Set-Location "functions"
if (Test-Path "node_modules") {
    Write-Host "      → node_modules exists, checking for updates..." -ForegroundColor Gray
    npm install | Out-Null
} else {
    Write-Host "      → Installing for the first time..." -ForegroundColor Gray
    npm install | Out-Null
}
Set-Location ..

Write-Host "      ✓ Cloud Functions dependencies installed" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 2: Build Frontend
# ============================================================================
Write-Host "[3/6] Building frontend (Vite)..." -ForegroundColor Yellow

# Clean old build
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
    Write-Host "      → Cleaned old build" -ForegroundColor Gray
}

npm run build | Out-Null

if (Test-Path "dist/index.html") {
    Write-Host "      ✓ Frontend built successfully" -ForegroundColor Green
    Write-Host "      → Output: dist/index.html" -ForegroundColor Gray
} else {
    Write-Host "      ✗ Frontend build failed!" -ForegroundColor Red
    exit 1
}
Write-Host ""

# ============================================================================
# STEP 3: Select Firebase Project
# ============================================================================
Write-Host "[4/6] Selecting Firebase project..." -ForegroundColor Yellow

firebase use fleetwise-9ab3a

Write-Host "      ✓ Using project: fleetwise-9ab3a" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 4: Deploy to Firebase
# ============================================================================
Write-Host "[5/6] Deploying to Firebase..." -ForegroundColor Yellow
Write-Host "      This will deploy:" -ForegroundColor Gray
Write-Host "      • Firestore security rules" -ForegroundColor Gray
Write-Host "      • Cloud Functions (4 functions)" -ForegroundColor Gray
Write-Host "      • Frontend hosting" -ForegroundColor Gray
Write-Host ""
Write-Host "      ⏳ Please wait 2-5 minutes..." -ForegroundColor Cyan
Write-Host ""

firebase deploy

Write-Host ""
Write-Host "      ✓ Deployment complete!" -ForegroundColor Green
Write-Host ""

# ============================================================================
# STEP 5: Verify Deployment
# ============================================================================
Write-Host "[6/6] Verifying deployment..." -ForegroundColor Yellow

Write-Host ""
Write-Host "      📋 Cloud Functions:" -ForegroundColor Cyan
firebase functions:list

Write-Host ""
Write-Host "      ✓ Deployment verified" -ForegroundColor Green
Write-Host ""

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                                                            ║" -ForegroundColor Green
Write-Host "║                 🎉 DEPLOYMENT SUCCESS! 🎉                  ║" -ForegroundColor Green
Write-Host "║                                                            ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Your FleetWise app is now live!" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Website:  https://fleetwise-9ab3a.web.app" -ForegroundColor Cyan
Write-Host "📊 Console:  https://console.firebase.google.com/project/fleetwise-9ab3a" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Open your website in a browser" -ForegroundColor White
Write-Host "  2. Login as admin" -ForegroundColor White
Write-Host "  3. Add drivers and set their PINs" -ForegroundColor White
Write-Host "  4. Test shift start/end functionality" -ForegroundColor White
Write-Host ""
Write-Host "📖 Full guide: FIREBASE_DEPLOY_GUIDE.md" -ForegroundColor Gray
Write-Host ""

# Offer to open the site
Write-Host "Would you like to open your deployed site now? (Y/N)" -ForegroundColor Cyan
$response = Read-Host

if ($response -eq "Y" -or $response -eq "y") {
    start https://fleetwise-9ab3a.web.app
    Write-Host "✓ Opening site in browser..." -ForegroundColor Green
}

Write-Host ""
Write-Host "Deployment complete! 🚀" -ForegroundColor Green
Write-Host ""
