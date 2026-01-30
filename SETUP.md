# Project Phoenix - Setup Guide

Complete setup instructions for the insider whale detection system.

## Prerequisites

- **Node.js** 18+ (with npm/npx)
- **pnpm** 8+ (`npm install -g pnpm`)
- **Docker** & **Docker Compose**
- **Git**

## Quick Start

### 1. Start Infrastructure

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Verify services are running:

```bash
docker compose ps
```

### 2. Install Dependencies

Install all workspace dependencies:

```bash
pnpm install
```

### 3. Configure Environment

Create `.env` file in the root:

```bash
# On Unix/Mac:
cp .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```

The default values in `.env.example` work for local development.

### 4. Initialize Database

Push the Prisma schema to PostgreSQL:

```bash
pnpm db:push
```

Seed the database with mock data:

```bash
pnpm db:seed
```

### 5. Start All Services

Start all development servers:

```bash
pnpm dev
```

This will start:
- **Web UI**: http://localhost:3000
- **API**: http://localhost:4000
- **Worker**: Background process (logs to console)

## Accessing the Application

### Web Dashboard

Open http://localhost:3000 in your browser. You should see:

1. **Dashboard** with high-risk bets from the last 24 hours
2. **Active Markets** section
3. **Recent News Events** section (placeholder)

### API Endpoints

Test the API at http://localhost:4000:

**Health Check**:
```bash
curl http://localhost:4000/health
```

**Get Markets**:
```bash
curl http://localhost:4000/markets?status=open&limit=5
```

**Get Alerts** (high-risk bets):
```bash
curl http://localhost:4000/alerts
```

**Score a Bet**:
```bash
curl -X POST http://localhost:4000/score/bet \
  -H "Content-Type: application/json" \
  -d '{"betId":"bet-001"}'
```

**Get Wallet Profile**:
```bash
curl http://localhost:4000/wallets/0x1234567890abcdef1234567890abcdef12345678
```

### Explore Seeded Data

The database is seeded with:
- 3 wallets (one new, two established)
- 3 markets (Bitcoin, AI regulation, SpaceX)
- 4 bets (2 high-risk, 1 medium, 1 low)
- 2 news events
- 4 computed scores

Navigate to:
- `/wallet/0xabcdef1234567890abcdef1234567890abcdef12` - High-risk new wallet
- `/market/market-002` - Market with high-risk activity

## Development

### Run Individual Apps

```bash
# API only
cd apps/api
pnpm dev

# Web only
cd apps/web
pnpm dev

# Worker only
cd apps/worker
pnpm dev
```

### Database Management

**View database in Prisma Studio**:
```bash
cd apps/api
pnpm db:studio
```

**Create a migration**:
```bash
pnpm db:migrate
```

**Reset database**:
```bash
cd apps/api
npx prisma db push --force-reset
pnpm db:seed
```

### Run Tests

Run all tests:
```bash
pnpm test
```

Run API tests only:
```bash
cd apps/api
pnpm test
```

Watch mode:
```bash
cd apps/api
pnpm test:watch
```

### Linting

```bash
pnpm lint
```

### Build for Production

```bash
pnpm build
```

## Architecture Overview

### Monorepo Structure

```
project-phoenix/
├── apps/
│   ├── api/          # Fastify REST API
│   ├── web/          # Next.js 14 dashboard
│   └── worker/       # BullMQ background workers
├── packages/
│   └── shared/       # Shared types, constants, utils
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

### Key Components

#### 1. Shared Package (`@phoenix/shared`)

Exports:
- `PreResolutionFeatures` - Feature vector type
- `InsiderRiskScore` - Score type
- Constants (thresholds, weights)
- Utilities (formatting, normalization)

#### 2. API (`apps/api`)

- **Prisma Schema**: Database models (Market, Bet, Wallet, Score, etc.)
- **Routes**:
  - `/health` - Health check
  - `/markets` - List/get markets
  - `/wallets/:address` - Wallet profile
  - `/alerts` - High-risk bets
  - `/score/bet` - Compute IRS
- **Scoring Engine**:
  - `computeFeatureVector()` - Extract features from bet
  - `computeInsiderScore()` - Calculate 0-100 IRS with components

#### 3. Worker (`apps/worker`)

BullMQ queues:
- `INGEST_POLYMARKET` - Fetch from Polymarket API
- `INGEST_ONCHAIN` - Scan blockchain events
- `FEATURE_COMPUTE` - Compute feature vectors
- `SCORING` - Calculate IRS and persist
- `NEWS_INGEST` - Fetch news/Twitter data

Currently mocked; extend handlers to integrate real data sources.

#### 4. Web (`apps/web`)

Next.js 14 App Router pages:
- `/` - Dashboard with alerts and active markets
- `/wallet/[address]` - Wallet profile
- `/market/[id]` - Market detail with bets

Components:
- `ScoreBadge` - Visual risk indicator
- `Navigation` - Top nav bar
- shadcn/ui components (Card, Badge, Button)

## Insider Risk Score (IRS)

### Components (0-100 scale)

1. **Stake Impact (30%)**
   - Bet size / pool fraction
   - Z-score of bet size
   - Probability delta

2. **Temporal/Event Proximity (25%)**
   - Time to resolution
   - Proximity to announcements
   - Oracle request timing

3. **Wallet/Cluster History (20%)**
   - New wallet flag
   - Betting frequency
   - Aggregate volume

4. **Evasion/Urgency (15%)**
   - High gas priority
   - Funding patterns
   - Source obfuscation

5. **Market Microstructure (10%)**
   - Marketable orders
   - Slippage footprint
   - Liquidity targeting

### Risk Levels

| IRS Range | Level    | Badge Color |
|-----------|----------|-------------|
| 0-19      | Neutral  | Gray        |
| 20-49     | Watch    | Yellow      |
| 50-74     | High     | Orange      |
| 75-100    | Critical | Red         |

## Troubleshooting

### Database Connection Issues

Ensure PostgreSQL is running:
```bash
docker compose ps postgres
```

Restart if needed:
```bash
docker compose restart postgres
```

### Redis Connection Issues

Check Redis:
```bash
docker compose ps redis
```

Test connection:
```bash
docker compose exec redis redis-cli ping
# Should return: PONG
```

### Port Already in Use

If ports 3000, 4000, 5432, or 6379 are in use:

1. Stop conflicting services
2. Or modify ports in:
   - `apps/web/package.json` (dev script)
   - `apps/api/src/index.ts` (PORT const)
   - `docker-compose.yml` (port mappings)

### Build Errors

Clear caches and reinstall:
```bash
pnpm clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### Prisma Client Out of Sync

Regenerate Prisma Client:
```bash
cd apps/api
npx prisma generate
```

## Next Steps

### Extend with Real Data

1. **Polymarket Integration**:
   - Implement API client in `apps/api/src/lib/polymarket.ts`
   - Fetch markets and trades
   - Update ingest worker handlers

2. **On-Chain Monitoring**:
   - Connect to Polygon RPC
   - Listen to CTF Exchange events
   - Parse bet transactions

3. **News/Social Signals**:
   - Integrate NewsAPI, Twitter API
   - Match news to markets with NLP
   - Compute timing correlations

4. **Advanced Features**:
   - Wallet clustering (graph analysis)
   - Historical pattern matching
   - ML-based anomaly detection

### Production Deployment

1. Set environment variables in production
2. Use managed PostgreSQL (e.g., Supabase, Neon)
3. Use managed Redis (e.g., Upstash, Redis Cloud)
4. Deploy API/Worker to serverless or containers
5. Deploy Web to Vercel/Netlify
6. Set up monitoring (Sentry, Datadog)
7. Configure alerting (Slack webhooks)

## Support

For issues or questions:
- Check logs in terminal where `pnpm dev` is running
- Review Prisma schema in `apps/api/prisma/schema.prisma`
- Inspect API routes in `apps/api/src/routes/`
- Check browser DevTools console for frontend errors

## License

MIT

