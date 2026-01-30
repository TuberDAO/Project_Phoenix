# Project Phoenix - Quick Reference

Fast reference for common tasks and patterns.

## Environment Setup

```bash
# Required variables
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/phoenix"
REDIS_URL="redis://localhost:6379"

# Polymarket (defaults work)
CLOB_HOST="https://clob.polymarket.com"
POLYMARKET_GAMMA_BASE="https://gamma-api.polymarket.com"
POLYMARKET_API_BASE="https://data-api.polymarket.com"

# Optional
UMA_SUBGRAPH_URL=""  # Leave empty if not using
SLACK_WEBHOOK_URL=""  # For alerts
```

## Quick Start

```bash
docker compose up -d
pnpm install
pnpm db:push
pnpm dev
```

## Common Commands

```bash
# Development
pnpm dev                 # Start all services
pnpm build              # Build all packages
pnpm test               # Run tests
pnpm lint               # Lint code

# Database
pnpm db:push            # Sync schema
pnpm db:seed            # Seed data
pnpm db:migrate         # Create migration

# Individual services
cd apps/api && pnpm dev      # API only
cd apps/web && pnpm dev      # Web only
cd apps/worker && pnpm dev   # Worker only
```

## API Patterns

### Rate-Limited API Call

```typescript
import { rateLimit } from './rate/limiters';

const result = await rateLimit(
  'CLOB_BOOK',  // Limiter key
  async () => {
    return fetchOrderBook(tokenId);
  },
  'getBook(token-123)'  // Optional context for logging
);
```

### Get Order Book with Cache

```typescript
import * as PolyClient from './services/polymarketClient';

// Single book
const book = await PolyClient.getBook(tokenId);

// Multiple books (batched)
const books = await PolyClient.getBooks([tokenId1, tokenId2]);
```

### Fetch Recent Trades

```typescript
const trades = await PolyClient.getTrades({
  marketId: 'market-id',
  sinceTs: Math.floor(Date.now() / 1000) - 300,  // Last 5 minutes
  limit: 100,
});
```

## Worker Patterns

### Enqueue Job

```typescript
import { featureComputeQueue } from './queues/definitions';

await featureComputeQueue.add('compute-features', {
  betId: 'bet-123',
  books: bookSnapshots,
});
```

### Create Worker

```typescript
import { Worker } from 'bullmq';
import { createRedisConnection } from './lib/redis';
import { QUEUE_NAMES } from './queues/definitions';

const worker = new Worker(
  QUEUE_NAMES.MY_QUEUE,
  async (job) => {
    // Process job
    return { result: 'success' };
  },
  {
    connection: createRedisConnection(),
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
```

## Feature Computation

### Compute Features with Context

```typescript
import { computeFeatureVector } from './features/computeFeatureVector';

const features = computeFeatureVector(
  bet,
  market,
  wallet,  // optional
  {
    books: bookSnapshots,
    oracleProximity: 999999,
  }
);
```

### Compute IRS

```typescript
import { computeInsiderScore } from './scoring/insiderScore';

const score = computeInsiderScore(features);
// Returns: { irsBet: 85, components: { stakeImpact: 0.82, ... } }
```

## Database Patterns

### Upsert Market

```typescript
await prisma.market.upsert({
  where: { id: marketId },
  update: {
    status: 'closed',
    metaJson: { liquidity, volume },
  },
  create: {
    id: marketId,
    question,
    closesAt: new Date(endDate),
    status: 'open',
  },
});
```

### Query High-Risk Bets

```typescript
const alerts = await prisma.score.findMany({
  where: {
    irsBet: { gte: 75 },
    createdAt: { gte: since24h },
  },
  include: {
    bet: { include: { market: true } },
  },
  orderBy: { irsBet: 'desc' },
  take: 50,
});
```

## Monitoring

### Check Rate Limiter Stats

```typescript
import { getLimiterStats } from './rate/limiters';

const stats = getLimiterStats();
console.log(stats);
// {
//   CLOB_BOOK: { running: 2, queued: 5 },
//   GAMMA_MARKETS: { running: 0, queued: 0 },
//   ...
// }
```

### Check WebSocket Status

```typescript
import { getStatus } from './services/polymarketWS';

const status = getStatus();
console.log(status);
// {
//   enabled: true,
//   connected: true,
//   processedTradesCount: 1247
// }
```

## Configuration Patterns

### Parse Rate Limit from Env

```typescript
// Format: "200/10s" or "1200/1m"
const RATE_CLOB_BOOK = parseRateLimit(
  process.env.RATE_CLOB_BOOK || '',
  '200/10s'  // default
);
// Returns: { reservoir: 200, reservoirRefreshInterval: 10000, ... }
```

### Check Optional Service

```typescript
import { isUmaConfigured } from './services/umaClient';

if (isUmaConfigured()) {
  const proximity = await getOracleProximity(marketId, timestamp);
} else {
  // Use default
  const proximity = 999999;
}
```

## Testing Patterns

### Test Rate Limiter

```typescript
import { describe, it, expect } from 'vitest';
import { rateLimit } from './rate/limiters';

describe('Rate Limiter', () => {
  it('should queue requests', async () => {
    const promises = [];
    for (let i = 0; i < 300; i++) {
      promises.push(rateLimit('CLOB_BOOK', async () => i));
    }
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(300);
  });
});
```

### Test Scoring

```typescript
import { computeInsiderScore } from './scoring/insiderScore';

const highRiskFeatures: PreResolutionFeatures = {
  betUsd: 25000,
  fractionOfPool: 0.15,
  zScoreBetSize: 4.5,
  timeToResolutionSec: 3600,
  newWalletFlag: true,
  gasPriorityFlag: true,
  // ... (see insiderScore.test.ts for full example)
};

const score = computeInsiderScore(highRiskFeatures);
expect(score.irsBet).toBeGreaterThanOrEqual(70);
```

## Useful Utilities

```typescript
import {
  clamp,
  sigmoid,
  safeDiv,
  daysBetween,
  formatUSD,
  formatProbability,
  getRiskLevel,
  truncateAddress,
} from '@phoenix/shared';

// Math
clamp(1.5, 0, 1);  // 1
sigmoid(3);         // 0.953
safeDiv(10, 0);     // 0 (no division by zero)

// Time
daysBetween(date1, date2);  // 42.5

// Formatting
formatUSD(1234.56);              // "$1,235"
formatProbability(0.6543);       // "65.4%"
truncateAddress('0xabcd...');    // "0xabcd...1234"

// Risk
getRiskLevel(85);  // 'critical'
```

## Common Issues

### Rate Limit Errors (429)

```bash
# Reduce ingestion frequency
INGEST_INTERVAL_SEC="30"  # Instead of 15

# Or disable WebSocket temporarily
ENABLE_WEBSOCKETS="false"
```

### WebSocket Disconnects

```bash
# Check URL
POLYMARKET_WS_URL="wss://ws-subscriptions-clob.polymarket.com/ws/market"

# Or disable
ENABLE_WEBSOCKETS="false"
```

### Memory Growth

```bash
# Restart workers periodically
# Or reduce cache sizes in polymarketClient.ts
const bookCache = new LRUCache({ max: 100 });  # Instead of 500
```

## File Locations

```
apps/
├── api/
│   ├── prisma/schema.prisma          # Database schema
│   ├── src/
│   │   ├── features/                 # Feature computation
│   │   ├── scoring/                  # IRS algorithm
│   │   └── routes/                   # API endpoints
│   └── package.json
├── web/
│   └── src/
│       ├── app/                      # Next.js pages
│       ├── components/               # UI components
│       └── lib/                      # Client utils
└── worker/
    └── src/
        ├── config/                   # Rate limit config
        ├── rate/                     # Rate limiters
        ├── services/                 # API clients
        ├── jobs/                     # Ingestion logic
        └── workers/                  # BullMQ workers

packages/
└── shared/
    └── src/
        ├── types.ts                  # Shared types
        ├── constants.ts              # Thresholds
        └── utils.ts                  # Utilities
```

## Key URLs

- Dashboard: http://localhost:3000
- API: http://localhost:4000
- API Health: http://localhost:4000/health
- Alerts: http://localhost:4000/alerts
- Prisma Studio: `pnpm --filter api db:studio`

## Documentation

- `README.md` - Project overview
- `SETUP.md` - Detailed setup guide
- `TECHNICAL_SPEC.md` - Architecture & algorithms
- `POLYMARKET_INTEGRATION.md` - API integration guide
- `POLYMARKET_EXTENSION_SUMMARY.md` - Extension summary
- `apps/worker/README.md` - Worker documentation

## Support

```bash
# Clean install
pnpm clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install

# Reset database
cd apps/api
npx prisma db push --force-reset
pnpm db:seed

# Check logs
# Worker logs show rate limiter activity
# API logs show request handling
# Browser console shows frontend errors
```

## Handy Snippets

### Trigger Manual Ingestion

```typescript
// In apps/worker/src/index.ts, add:
import express from 'express';
const app = express();

app.post('/admin/trigger-ingest', async (req, res) => {
  try {
    await ingestPolymarketData();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(4002, () => console.log('Admin API on :4002'));
```

### Log Feature Vector

```typescript
const features = computeFeatureVector(...);
console.log(JSON.stringify(features, null, 2));
```

### Monitor Queue Depths

```bash
# In Redis CLI
docker compose exec redis redis-cli

# Check queue lengths
LLEN bull:feature-compute:wait
LLEN bull:scoring:wait
```

---

**Last Updated**: After Polymarket integration (Prompt 2)

