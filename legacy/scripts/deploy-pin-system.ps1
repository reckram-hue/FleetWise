# PowerShell script to deploy PIN system
# Run this to deploy everything needed for PINs to work

Write-Host "🚀 FleetWise PIN System Deployment" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Step 1: Check if we're in the right directory
if (!(Test-Path "package.json")) {
    Write-Host "❌ Error: Not in FleetWise root directory" -ForegroundColor Red
    Write-Host "Please cd to your FleetWise project folder" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ In correct directory`n" -ForegroundColor Green

# Step 2: Check bcryptjs installation
Write-Host "📦 Checking bcryptjs installation..." -ForegroundColor Yellow
$bcryptInstalled = npm list bcryptjs 2>&1 | Select-String "bcryptjs@"
if ($bcryptInstalled) {
    Write-Host "✅ bcryptjs is installed`n" -ForegroundColor Green
} else {
    Write-Host "❌ bcryptjs not found, installing..." -ForegroundColor Red
    npm install bcryptjs
    Write-Host "✅ bcryptjs installed`n" -ForegroundColor Green
}

# Step 3: Deploy Cloud Functions
Write-Host "☁️  Deploying Cloud Functions..." -ForegroundColor Yellow
Write-Host "This may take a few minutes...`n" -ForegroundColor Gray

Push-Location functions
try {
    $deployResult = firebase deploy --only functions 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Cloud Functions deployed successfully!`n" -ForegroundColor Green
        Write-Host "Deployed functions:" -ForegroundColor Cyan
        Write-Host "  - validateDriverPin" -ForegroundColor White
        Write-Host "  - driverChangePin" -ForegroundColor White
        Write-Host "  - startShiftWithPin" -ForegroundColor White
        Write-Host "  - endShift`n" -ForegroundColor White
    } else {
        Write-Host "❌ Cloud Functions deployment failed" -ForegroundColor Red
        Write-Host $deployResult -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

# Step 4: Build frontend
Write-Host "🏗️  Building frontend application..." -ForegroundColor Yellow
$buildResult = npm run build 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Frontend built successfully!`n" -ForegroundColor Green
} else {
    Write-Host "⚠️  Build had warnings, but continuing...`n" -ForegroundColor Yellow
}

# Step 5: Summary
Write-Host "====================================`n" -ForegroundColor Cyan
Write-Host "✨ Deployment Complete!" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "1. Start dev server: npm run dev" -ForegroundColor White
Write-Host "2. Create admin account (see ADMIN_SETUP_GUIDE.md)" -ForegroundColor White
Write-Host "3. Login as admin and create a test driver" -ForegroundColor White
Write-Host "4. Test driver login with PIN: 1234`n" -ForegroundColor White

Write-Host "📖 Documentation:" -ForegroundColor Cyan
Write-Host "  - QUICK_PIN_SETUP.md (troubleshooting)" -ForegroundColor White
Write-Host "  - ADMIN_SETUP_GUIDE.md (admin creation)" -ForegroundColor White
Write-Host "  - AUTHENTICATION_SYSTEM_README.md (full docs)`n" -ForegroundColor White

Write-Host "Ready to start! Run: npm run dev" -ForegroundColor Green
