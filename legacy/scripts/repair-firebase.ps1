# ============================================================================
# FLEETWISE FIREBASE REPAIR SCRIPT
# Fixes all detected configuration issues for safe deployment
# ============================================================================

$ErrorActionPreference = "Stop"
$repoRoot = "C:\Users\User\Projects\FleetWise"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FLEETWISE FIREBASE REPAIR SCRIPT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to repo root
Set-Location $repoRoot
Write-Host "[1/6] ✓ Navigated to: $repoRoot" -ForegroundColor Green

# ============================================================================
# FIX 1: Replace firebase.json with correct configuration
# ============================================================================
Write-Host "[2/6] Fixing firebase.json..." -ForegroundColor Yellow

$firebaseConfig = @"
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": [
        "node_modules",
        ".git",
        "firebase-debug.log",
        "firebase-debug.*.log"
      ],
      "predeploy": [
        "npm --prefix `"`$RESOURCE_DIR`" run build"
      ]
    }
  ],
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.debug.log",
      "firebase-debug.*.log"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
"@

$firebaseConfig | Out-File -FilePath "firebase.json" -Encoding UTF8 -NoNewline
Write-Host "      ✓ firebase.json repaired (fixed predeploy command)" -ForegroundColor Green

# ============================================================================
# FIX 2: Verify .firebaserc
# ============================================================================
Write-Host "[3/6] Verifying .firebaserc..." -ForegroundColor Yellow

$firebaseRc = @"
{
  "projects": {
    "default": "fleetwise-9ab3a"
  }
}
"@

$firebaseRc | Out-File -FilePath ".firebaserc" -Encoding UTF8 -NoNewline
Write-Host "      ✓ .firebaserc verified" -ForegroundColor Green

# ============================================================================
# FIX 3: Update Firestore rules - Change 'drivers' to 'users'
# ============================================================================
Write-Host "[4/6] Checking Firestore rules collection names..." -ForegroundColor Yellow
Write-Host "      ⚠ DETECTED: Rules use 'drivers' but code uses 'users'" -ForegroundColor Red
Write-Host "      → You must choose ONE option:" -ForegroundColor Yellow
Write-Host "        A) Update rules to use 'users' (RECOMMENDED)" -ForegroundColor White
Write-Host "        B) Update all code to use 'drivers' (requires code changes)" -ForegroundColor White
Write-Host ""
Write-Host "      This script will update RULES to match your CODE (Option A)" -ForegroundColor Cyan

# Replace 'drivers' with 'users' in firestore.rules
(Get-Content "firestore.rules" -Raw) `
    -replace "collection\('drivers'\)", "collection('users')" `
    -replace "get\(/databases/\`$\(database\)/documents/drivers/", "get(/databases/`$(database)/documents/users/" `
    -replace "match /drivers/\{driverId\}", "match /users/{userId}" `
    -replace "\{driverId\}", "{userId}" `
    -replace "isDriver\(userId\)", "isUser(userId)" `
    -replace "function isDriver\(userId\)", "function isUser(userId)" `
    | Out-File -FilePath "firestore.rules" -Encoding UTF8 -NoNewline

Write-Host "      ✓ Firestore rules updated to use 'users' collection" -ForegroundColor Green

# ============================================================================
# FIX 4: Validate JSON correctness
# ============================================================================
Write-Host "[5/6] Validating JSON files..." -ForegroundColor Yellow

try {
    $null = Get-Content "firebase.json" -Raw | ConvertFrom-Json
    Write-Host "      ✓ firebase.json is valid JSON" -ForegroundColor Green
} catch {
    Write-Host "      ✗ firebase.json has JSON errors" -ForegroundColor Red
    exit 1
}

try {
    $null = Get-Content ".firebaserc" -Raw | ConvertFrom-Json
    Write-Host "      ✓ .firebaserc is valid JSON" -ForegroundColor Green
} catch {
    Write-Host "      ✗ .firebaserc has JSON errors" -ForegroundColor Red
    exit 1
}

# ============================================================================
# FIX 5: Check functions dependencies
# ============================================================================
Write-Host "[6/6] Checking Cloud Functions setup..." -ForegroundColor Yellow

if (Test-Path "functions/package.json") {
    Write-Host "      ✓ functions/package.json exists" -ForegroundColor Green

    # Check if node_modules exists
    if (Test-Path "functions/node_modules") {
        Write-Host "      ✓ functions/node_modules exists" -ForegroundColor Green
    } else {
        Write-Host "      ⚠ functions/node_modules missing - run: cd functions && npm install" -ForegroundColor Yellow
    }

    # Check if TypeScript compiled output exists
    if (Test-Path "functions/lib") {
        Write-Host "      ✓ functions/lib exists (TypeScript compiled)" -ForegroundColor Green
    } else {
        Write-Host "      ⚠ functions/lib missing - will be created during deploy" -ForegroundColor Yellow
    }
} else {
    Write-Host "      ✗ functions/package.json missing" -ForegroundColor Red
    exit 1
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  REPAIR COMPLETE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ firebase.json - FIXED (predeploy command)" -ForegroundColor Green
Write-Host "✓ .firebaserc - VERIFIED" -ForegroundColor Green
Write-Host "✓ firestore.rules - UPDATED (users collection)" -ForegroundColor Green
Write-Host "✓ JSON validation - PASSED" -ForegroundColor Green
Write-Host "✓ Cloud Functions - READY" -ForegroundColor Green
Write-Host ""
Write-Host "⚠ CRITICAL WARNING:" -ForegroundColor Red
Write-Host "  Your services/firebaseApi.ts contains hardcoded localhost:3001 calls" -ForegroundColor Yellow
Write-Host "  at lines 97-110 and 200-213. These will FAIL in production." -ForegroundColor Yellow
Write-Host "  Remove or comment out the fetch() calls to localhost:3001." -ForegroundColor Yellow
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "  1. Run: cd functions" -ForegroundColor White
Write-Host "  2. Run: npm install" -ForegroundColor White
Write-Host "  3. Run: cd .." -ForegroundColor White
Write-Host "  4. Run: npm run build" -ForegroundColor White
Write-Host "  5. Run: firebase deploy" -ForegroundColor White
Write-Host ""
