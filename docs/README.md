# Project Phoenix - Documentation

## Overview

Project Phoenix is a comprehensive insider whale detection system for prediction markets (Polymarket). It uses 53+ pre-resolution features to compute an Insider Risk Score (IRS) that identifies potentially suspicious trading activity before market resolution.

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Docker & Docker Compose
- PostgreSQL (via Docker)
- Redis (via Docker)

### Installation

```bash
# Clone repository
cd project-phoenix

# Install dependencies
pnpm install

# Start infrastructure
docker compose up -d

# Push database schema
pnpm db:push

# Seed with demo data
tsx scripts/seed-small.ts

# Start all services
pnpm dev
```

This starts:
- **Web**: http://localhost:3000
- **API**: http://localhost:4000
- **Worker**: Background processes

---

## Environment Variables

### Root `.env`

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/phoenix"
REDIS_URL="redis://localhost:6379"

# Polymarket APIs
POLYMARKET_API_BASE="https://data-api.polymarket.com"
POLYMARKET_GAMMA_BASE="https://gamma-api.polymarket.com"
CLOB_HOST="https://clob.polymarket.com"
POLYGON_RPC_URL="https://polygon-rpc.com"
POLYMARKET_WS_URL="wss://ws-subscriptions-clob.polymarket.com/ws/market"

# UMA Oracle
UMA_SUBGRAPH_URL=""  # Optional

# News & Social
NEWS_ENABLED="true"
NEWS_API_KEY=""  # Optional: NewsAPI key
TWITTER_ENABLED="true"
TWITTER_BEARER=""  # Optional: Twitter API bearer token

# Trading (optional)
TRADING_ENABLED="false"
DRY_RUN="true"

# Export
EXPORT_TOKEN=""  # Optional: Bearer token for CSV/PDF exports

# Alerts
SLACK_WEBHOOK_URL=""  # Optional: Slack notifications
ALERT_IRS_THRESHOLD="75"

# Worker
ENABLE_WEBSOCKETS="true"
INGEST_INTERVAL_SEC="15"
NEWS_INGEST_INTERVAL_SEC="60"

# Rate Limits (format: "requests/period" where period is like "10s" or "1m")
RATE_DATA_GENERAL="200/10s"
RATE_GAMMA_MARKETS="125/10s"
RATE_CLOB_BOOK="200/10s"
RATE_NEWS_API="100/1m"
RATE_TWITTER_API="50/1m"
```

---

## Architecture

### Apps

1. **`apps/web`** (Next.js 14)
   - Dashboard with filters, tables, charts
   - Market detail pages
   - Wallet profiles
   - Settings page (weight tuning)
   - Backtest interface

2. **`apps/api`** (Fastify)
   - RESTful API with 20+ endpoints
   - Scoring engine (IRS computation)
   - Feature computation (53 fields)
   - Backtest runner
   - Export utilities (CSV, PDF)
   - Audit logging

3. **`apps/worker`** (Node.js + BullMQ)
   - Polymarket data ingestion (REST + WebSocket)
   - News/Twitter ingestion
   - Feature computation pipeline
   - Scoring jobs
   - Alert notifications

### Packages

1. **`packages/shared`**
   - Type definitions (`PreResolutionFeatures`, `InsiderRiskScore`)
   - Constants (thresholds, weights)
   - Utility functions (normalization, stats)

---

## Core Concepts

### Insider Risk Score (IRS)

A 0-100 score computed from 53 pre-resolution features across 5 categories:

1. **Stake Impact (30%)**
   - `fractionOfPool`
   - `zScoreBetSize`
   - `deltaProb`

2. **Temporal/Event Proximity (25%)**
   - `timeToResolutionSec`
   - `preAnnouncementProximityMin`
   - `oracleProximitySec`

3. **Wallet/Cluster History (20%)**
   - `newWalletFlag`
   - `walletBetCount24h`
   - `walletAggUsd7d`

4. **Evasion/Urgency (15%)**
   - `gasPriorityFlag`
   - `fanInCount24h`
   - `fundingGapSec`

5. **Market Microstructure Context (10%)**
   - `isMarketableOrder`
   - `slippageFootprintBps`
   - `bookImbalanceAfter`
   - `firstMoverFlag`
   - `lowLiquiditySideFlag`

### Weight Tuning

Analysts can adjust category weights without redeployment:

```bash
curl -X POST http://localhost:4000/config/weights \
  -H "Content-Type: application/json" \
  -d '{"preset": "strict"}'
```

Presets:
- **default**: Balanced (30/25/20/15/10)
- **strict**: Emphasizes temporal/evasion (25/30/15/20/10)
- **balanced**: Equal weights (20/20/20/20/20)
- **lenient**: Reduces evasion (35/20/25/10/10)

Weights are cached in-memory (10s refresh) and affect all new scores immediately.

---

## API Endpoints

### Configuration

- **GET /config/weights** - Get current weights & presets
- **POST /config/weights** - Update weights (body: `{weights}` or `{preset}`)

### Scoring

- **POST /score/bet** - Score a bet (body: `{betId}` or `{bet: {...}}`)

### Alerts

- **GET /alerts** - List high-risk bets
  - Query: `minIrs`, `from`, `to`, `category`, `cursor`, `limit`
  - Returns: alerts with chips (Marketable, LowLiquidity, Oracle<1h, FinalHour, ChatterLull, Burst)

### Markets

- **GET /markets** - List markets (`status`, `cursor`, `limit`)
- **GET /markets/:id** - Get market details
- **GET /markets/:id/bets** - Get market bets (`from`, `to`, `limit`)

### Wallets

- **GET /wallets/:address** - Get wallet profile
- **GET /wallets/:address/scores** - Get score timeline (`from`, `to`, `limit`)

### Backtest

- **POST /backtest/run** - Run backtest (body: `{from, to, minIrs?, weightsPreset?}`)
- **GET /backtest/last** - Get last backtest result

### Export

- **GET /export/alerts.csv** - Export alerts as CSV (`from`, `to`, `minIrs`)
- **GET /export/bets.csv** - Export bets as CSV (`marketId`, `from`, `to`)
- **POST /export/report.pdf** - Generate HTML report (body: `{from, to, minIrs}`)

### Audit

- **GET /audit** - Get audit logs (`type`, `refId`, `from`, `to`, `cursor`)
- **GET /audit/evidence/:betId** - Get evidence snapshot for a bet

### Auth & Trading (when `TRADING_ENABLED=true`)

- **POST /auth/derive** - Derive API key (body: `{privateKey, signatureType?, funder?}`)
- **GET /auth/api-keys** - List API keys (`address`)
- **DELETE /auth/api-key/:keyId** - Delete API key
- **POST /trade/mirror** - Mirror trade (body: `{betId, side, size, maxPrice?, privateKey}`)

---

## Adding New Features

### 1. Update Type Definition

Edit `packages/shared/src/types.ts`:

```typescript
export type PreResolutionFeatures = {
  // ...existing fields...
  myNewFeature: number;
};
```

### 2. Compute Feature

Edit `apps/api/src/features/computeFeatureVector.ts`:

```typescript
export function computeFeatureVector(...) {
  // ...existing computations...
  
  const myNewFeature = calculateMyFeature(bet, market);
  
  return {
    // ...existing fields...
    myNewFeature,
  };
}
```

### 3. Persist Automatically

Features are automatically persisted in `FeatureSnapshot.features` (JSON column). No schema changes needed.

### 4. (Optional) Use in Scoring

Edit `apps/api/src/scoring/insiderScore.ts` to incorporate the new feature into one of the 5 components.

---

## Trading with MetaMask

### Enable Trading

```env
TRADING_ENABLED="true"
DRY_RUN="true"  # Set to "false" for live trading
```

### Derive API Key

```bash
curl -X POST http://localhost:4000/auth/derive \
  -H "Content-Type: application/json" \
  -d '{
    "privateKey": "0x...",
    "signatureType": 0
  }'
```

Returns: `{ apiKey, passphrase }`

### Mirror a Trade

```bash
curl -X POST http://localhost:4000/trade/mirror \
  -H "Content-Type: application/json" \
  -d '{
    "betId": "bet-001",
    "side": "buy",
    "size": 100,
    "maxPrice": 0.55,
    "privateKey": "0x..."
  }'
```

Returns:
- **DRY_RUN=true**: `{ dryRun: true, preview: {...} }`
- **DRY_RUN=false**: `{ orderId, status: "submitted" }`

---

## Rate Limits & Fallbacks

### Rate Limiting

All Polymarket API calls go through `bottleneck` rate limiters:

| Endpoint Family | Limit |
|---|---|
| DATA_GENERAL | 200/10s |
| GAMMA_MARKETS | 125/10s |
| CLOB_BOOK | 200/10s |
| NEWS_API | 100/1m |
| TWITTER_API | 50/1m |

On 429/5xx, automatic retry with exponential backoff + jitter (200ms → 6s max).

### WebSocket (RTDS)

Real-time data streams from Polymarket for:
- Order book deltas
- Trades
- Midprices

Falls back to REST polling if WebSocket fails.

---

## Backtesting

### Run Backtest

```bash
curl -X POST http://localhost:4000/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-31T23:59:59Z",
    "minIrs": 75,
    "weightsPreset": "strict"
  }'
```

Returns:
- `totalBets`
- `highRiskBets`
- `precisionAt10` / `precisionAt20` / `precisionAt50`
- `rocAucProxy`
- `avgLeadTimeMinutes`
- `irsDistribution` (histogram bins)
- `irsOverTime` (timeline data)

### Get Last Result

```bash
curl http://localhost:4000/backtest/last
```

---

## Testing

### Run All Tests

```bash
pnpm test
```

### Specific Test Suites

```bash
# Weights system
cd apps/api
pnpm vitest src/scoring/weights.test.ts

# Backtest runner
pnpm vitest src/backtest/runner.test.ts

# Insider score (existing)
pnpm vitest src/scoring/insiderScore.test.ts
```

---

## Deployment

### Docker

```bash
# Build all apps
pnpm build

# Create production Docker image (create Dockerfile as needed)
docker build -t phoenix-api ./apps/api
docker build -t phoenix-worker ./apps/worker
docker build -t phoenix-web ./apps/web
```

### Environment

Set all environment variables in production (see `.env.example`).

Key considerations:
- Set `TRADING_ENABLED=false` unless trading is intentional
- Set `DRY_RUN=true` for trading simulations
- Configure `EXPORT_TOKEN` for secure exports
- Enable `NEWS_ENABLED` and `TWITTER_ENABLED` with API keys
- Set `SLACK_WEBHOOK_URL` for alerts

---

## Monitoring

### Audit Logs

All critical events are logged to `AuditLog` table:

- `scoring_computed` - Every IRS computation
- `threshold_crossing` - When IRS >= 75
- `config_change` - Weight updates
- `export_request` - CSV/PDF exports
- `backtest_run` - Backtest executions

### Evidence Snapshots

When IRS >= 75, an `Evidence` record is created with:
- Full component breakdown
- Chips (boolean flags for UI)
- Timestamp

View evidence:
```bash
curl http://localhost:4000/audit/evidence/bet-001
```

---

## UI Pages

### Dashboard (`/`)

- Filters: date range, min IRS, category
- Cards: High-Risk Bets, Active Markets
- Chart: IRS distribution (histogram)
- Table: Sortable, with chips

### Market Detail (`/market/[id]`)

- Header: question, timers, negrisk flag
- Odds timeline (chart with bet markers)
- News pulse sparkline
- Bets table with IRS scores

### Wallet Profile (`/wallet/[address]`)

- Header: address, age, flags
- Score timeline (line chart)
- Behavior tiles: win rate, volume
- Related wallets (cluster)

### Settings (`/settings`)

- Weight slider form
- Preset buttons (strict, balanced, lenient)
- Reset to default

### Backtest (`/backtest`)

- Date range or CSV upload
- Metrics display
- Charts: IRS distribution, IRS over time
- Export report (CSV/PDF)

### Alerts (`/alerts`)

- Paginated table
- Export buttons
- Click row → Evidence modal

---

## Troubleshooting

### Worker Not Starting

- Check Redis connection: `docker compose ps`
- Check Prisma: `pnpm db:push`
- Check logs for rate limit errors

### Scores Not Computing

- Ensure `FeatureSnapshot` exists for bet
- Check worker logs for errors
- Run `pnpm dev` to restart all services

### Trading Disabled

- Set `TRADING_ENABLED=true` in `.env`
- Restart API: `cd apps/api && pnpm dev`

### News Not Ingesting

- Set `NEWS_API_KEY` or `TWITTER_BEARER`
- Set `NEWS_ENABLED=true` and `TWITTER_ENABLED=true`
- Check worker logs for API errors

---

## Contributing

See `CONTRIBUTING.md` for:
- Coding standards (TypeScript strict mode)
- Commit message format
- Pull request process
- Testing requirements

---

## License

MIT

---

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Built with ❤️ for insider detection on prediction markets.**

