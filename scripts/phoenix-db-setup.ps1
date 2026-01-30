param()

Write-Host "== Phoenix: Prisma generate + db push ==" -ForegroundColor Cyan

# Ensure .envs are present (we already wrote them earlier)
Write-Host "Using DATABASE_URL from apps/api/.env" -ForegroundColor Yellow
Push-Location "apps/api"

# Prisma generate
pnpm exec prisma generate
if ($LASTEXITCODE -ne 0) { exit 1 }

# Prisma db push
pnpm exec prisma db push
if ($LASTEXITCODE -ne 0) { exit 1 }

Pop-Location
Write-Host "✅ Prisma schema applied. You're ready to start the dev stack." -ForegroundColor Green

