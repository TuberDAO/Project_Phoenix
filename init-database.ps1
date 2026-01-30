# ====================================================
# Project Phoenix - Database Initialization
# Run AFTER adding Windows Firewall rules
# ====================================================

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Project Phoenix - Database Setup" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Verify connectivity first
Write-Host "Testing database connectivity..." -ForegroundColor Yellow
$test = Test-NetConnection 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue

if (-not $test.TcpTestSucceeded) {
    Write-Host "❌ ERROR: Cannot connect to port 5433" -ForegroundColor Red
    Write-Host "Please run the firewall commands as Administrator first!" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Database is reachable" -ForegroundColor Green
Write-Host ""

# Change to API directory
Set-Location apps/api

# 1. Generate Prisma Client
Write-Host "Step 1: Generating Prisma client..." -ForegroundColor Yellow
pnpm exec prisma generate
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma client generated" -ForegroundColor Green
} else {
    Write-Host "❌ Prisma generate failed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Push Database Schema
Write-Host "Step 2: Pushing database schema..." -ForegroundColor Yellow
pnpm exec prisma db push
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database schema created" -ForegroundColor Green
} else {
    Write-Host "❌ Database push failed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Seed Database
Write-Host "Step 3: Seeding database..." -ForegroundColor Yellow
pnpm exec tsx prisma/seed.ts
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database seeded with demo data" -ForegroundColor Green
} else {
    Write-Host "⚠️ Seed failed (non-critical)" -ForegroundColor Yellow
}

# Return to root
Set-Location ../..

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "✅ Database Setup Complete!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now start the dev stack:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Terminal 1: pnpm --filter @phoenix/shared dev" -ForegroundColor White
Write-Host "Terminal 2: pnpm --filter api dev" -ForegroundColor White  
Write-Host "Terminal 3: pnpm --filter worker dev" -ForegroundColor White
Write-Host "Terminal 4: cd apps/web && pnpm dev" -ForegroundColor White
Write-Host ""
Write-Host "Then visit:" -ForegroundColor Yellow
Write-Host "  API:  http://127.0.0.1:4000/health" -ForegroundColor White
Write-Host "  Web:  http://127.0.0.1:3000" -ForegroundColor White
Write-Host ""

