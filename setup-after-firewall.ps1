# ====================================================
# Project Phoenix - Setup After Firewall Configuration
# Run this in regular PowerShell (not Admin)
# From project root: C:\Users\l\Code\Project Phoenix
# ====================================================

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "Project Phoenix - Database Setup" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Generate Prisma Client
Write-Host "Step 1: Generating Prisma client..." -ForegroundColor Yellow
pnpm --filter ./apps/api exec prisma generate
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Prisma client generated" -ForegroundColor Green
} else {
    Write-Host "❌ Prisma generate failed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Push Database Schema
Write-Host "Step 2: Pushing database schema..." -ForegroundColor Yellow
pnpm --filter ./apps/api exec prisma db push
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database schema pushed" -ForegroundColor Green
} else {
    Write-Host "❌ Database push failed" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Seed Database (optional)
Write-Host "Step 3: Seeding database with demo data..." -ForegroundColor Yellow
pnpm --filter ./apps/api exec tsx prisma/seed.ts
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database seeded" -ForegroundColor Green
} else {
    Write-Host "⚠️ Seed failed (optional step)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next: Start the dev stack in 4 separate terminals:" -ForegroundColor Yellow
Write-Host ""
Write-Host "Terminal 1:" -ForegroundColor Cyan
Write-Host "  pnpm --filter @phoenix/shared dev" -ForegroundColor White
Write-Host ""
Write-Host "Terminal 2:" -ForegroundColor Cyan
Write-Host "  pnpm --filter api dev" -ForegroundColor White
Write-Host ""
Write-Host "Terminal 3:" -ForegroundColor Cyan
Write-Host "  pnpm --filter worker dev" -ForegroundColor White
Write-Host ""
Write-Host "Terminal 4:" -ForegroundColor Cyan
Write-Host "  cd apps/web; pnpm dev" -ForegroundColor White
Write-Host ""
Write-Host "Then test:" -ForegroundColor Yellow
Write-Host "  API:  http://127.0.0.1:4000/health" -ForegroundColor White
Write-Host "  Web:  http://127.0.0.1:3000" -ForegroundColor White
Write-Host ""

