# Project Phoenix - Quick Start

Get up and running in 5 minutes.

## Prerequisites

```bash
# Check Node.js version (need 18+)
node --version

# Install pnpm if not already installed
npm install -g pnpm

# Check Docker
docker --version
docker compose version
```

## Setup Commands

```bash
# 1. Start database and Redis
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Create .env file (copy from example or create manually)
# Windows PowerShell:
Copy-Item README.md .env  # Then edit .env with correct values
# Unix/Mac:
cat > .env << 'EOF'
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/phoenix"
REDIS_URL="redis://localhost:6379"
POLYMARKET_API_BASE="https://api.polymarket.com"
POLYMARKET_GAMMA_BASE="https://gamma-api.polymarket.com"
POLYGON_RPC_URL="https://polygon-rpc.com"
UMA_SUBGRAPH_URL=""
NEWS_API_KEY=""
TWITTER_BEARER=""
SLACK_WEBHOOK_URL=""
NODE_ENV="development"
EOF

# 4. Initialize database
pnpm db:push

# 5. Seed with mock data
pnpm db:seed

# 6. Start all services
pnpm dev
```

## Verify Setup

Open these URLs in your browser:

- **Dashboard**: http://localhost:3000
- **API Health**: http://localhost:4000/health
- **API Alerts**: http://localhost:4000/alerts

You should see:
- Dashboard with 2 high-risk bets
- API returning `{"ok": true}`
- Alerts showing bets with IRS >= 75

## Test the API

```bash
# Get all markets
curl http://localhost:4000/markets

# Get high-risk alerts
curl http://localhost:4000/alerts

# Score a bet
curl -X POST http://localhost:4000/score/bet \
  -H "Content-Type: application/json" \
  -d '{"betId":"bet-001"}'

# Get wallet profile
curl http://localhost:4000/wallets/0xabcdef1234567890abcdef1234567890abcdef12
```

## Browse the Dashboard

1. Go to http://localhost:3000
2. See "High-Risk Bets (Last 24h)" with 2 critical alerts
3. Click on a bet to view the market
4. Click on a wallet address to view the wallet profile

## Troubleshooting

**Port conflicts?**
```bash
# Check what's using the ports
# Windows:
netstat -ano | findstr "3000 4000 5432 6379"
# Mac/Linux:
lsof -i :3000 -i :4000 -i :5432 -i :6379
```

**Database issues?**
```bash
# Reset database
cd apps/api
npx prisma db push --force-reset
pnpm db:seed
```

**Clean install?**
```bash
pnpm clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

## Next Steps

- Read `SETUP.md` for detailed documentation
- Read `TECHNICAL_SPEC.md` for architecture details
- Explore the seeded wallets:
  - High-risk: `0xabcdef1234567890abcdef1234567890abcdef12`
  - Established: `0x1234567890abcdef1234567890abcdef12345678`
- Explore the seeded markets:
  - High activity: `market-002`
  - Stable: `market-001`

## Project Structure

```
project-phoenix/
├── apps/
│   ├── api/          # Fastify API (port 4000)
│   ├── web/          # Next.js UI (port 3000)
│   └── worker/       # BullMQ workers (background)
├── packages/
│   └── shared/       # Types & utilities
├── docker-compose.yml
└── turbo.json
```

## Available Scripts

```bash
pnpm dev          # Start all services
pnpm build        # Build all packages
pnpm test         # Run tests
pnpm lint         # Lint code
pnpm db:push      # Update database schema
pnpm db:seed      # Seed mock data
```

## Stop Services

```bash
# Stop dev servers (Ctrl+C in terminal)

# Stop Docker services
docker compose down
```

That's it! You're ready to detect insider whales. 🔥

