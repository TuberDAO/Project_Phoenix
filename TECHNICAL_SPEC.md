# Project Phoenix - Technical Specification

Comprehensive technical documentation for the insider whale detection system.

## System Architecture

### High-Level Flow

```
[Polymarket API] ──┐
[Polygon Chain]  ──┼──> [Ingest Workers] ──> [Feature Compute] ──> [Scoring] ──> [DB + Alerts]
[News APIs]      ──┘                                                                    │
                                                                                        │
[Web Dashboard] <──────────────────────────────────────────────────────────────────────┘
                                        [API Server]
```

### Components

1. **Data Ingestion Layer**
   - Polymarket API poller (worker)
   - On-chain event listener (worker)
   - News aggregator (worker)

2. **Feature Engineering**
   - Pre-resolution feature extraction
   - 30+ features across 6 categories
   - Deterministic computation

3. **Scoring Engine**
   - Weighted component model
   - 0-100 IRS calculation
   - Component attribution

4. **API Layer**
   - REST endpoints (Fastify)
   - Real-time scoring
   - Historical queries

5. **UI Layer**
   - Dashboard (Next.js 14)
   - Wallet profiles
   - Market analytics

## Data Models

### Prisma Schema

Located in `apps/api/prisma/schema.prisma`.

#### Core Entities

**Market**
- Primary key: `id` (cuid)
- Question, category, timestamps
- Status: open | closed | resolved | cancelled
- Metadata JSON (liquidity, volume)

**Bet**
- Primary key: `id` (cuid)
- Unique: `txHash`
- Foreign key: `marketId` → Market
- Wallet address (lowercase)
- Outcome ID, timestamp, block number
- Financial: `betUsd`, `impliedBefore`, `impliedAfter`, `deltaProb`
- Computed: `fractionOfPool`, `zScoreSize`, `timeToResolutionSec`
- Flags: `gasPriorityFlag`

**Wallet**
- Primary key: `address`
- First seen, last seen
- Flags: `newWalletFlag`
- Metrics: `roi30d`, `winRateRolling`

**FeatureSnapshot**
- Primary key: `id` (cuid)
- Foreign key: `betId` (unique)
- JSON: `features` (PreResolutionFeatures)
- Timestamp: `createdAt`

**Score**
- Primary key: `id` (cuid)
- Foreign key: `betId` (unique)
- Scores: `irsBet`, `irsWallet`, `irsCluster`
- Timestamp: `createdAt`

**Cluster**
- Primary key: `id` (cuid)
- JSON: `members` (wallet addresses)
- Timestamp: `createdAt`

**NewsEvent**
- Primary key: `id` (cuid)
- Optional: `marketId`
- Source, headline, URL, timestamp
- Scores: `volumeScore`, `matchScore`

### TypeScript Types

Located in `packages/shared/src/types.ts`.

#### PreResolutionFeatures

```typescript
type PreResolutionFeatures = {
  // Timing (3)
  timeToResolutionSec: number;
  betTimestamp: string;
  isFinalHourBeforeClose: boolean;

  // Size & impact (6)
  betUsd: number;
  fractionOfPool: number;
  zScoreBetSize: number;
  impliedBefore: number;
  impliedAfter: number;
  deltaProb: number;

  // Order-flow microstructure (4)
  isMarketableOrder: boolean;
  slippageFootprintBps: number;
  burstRatio1m: number;
  bookImbalanceAfter: number;

  // Wallet provenance (4)
  walletAgeDays: number;
  newWalletFlag: boolean;
  fundingGapSec: number;
  fundingSourceType: 'cex' | 'mixer' | 'wallet' | 'unknown';

  // Evasion/urgency (3)
  gasPriorityFlag: boolean;
  fanInCount24h: number;
  fanOutPlanFlag: boolean;

  // Cross-market behavior (3)
  correlatedMarketsEntered5m: number;
  firstMoverFlag: boolean;
  lowLiquiditySideFlag: boolean;

  // Social/news & oracle timing (3)
  preAnnouncementProximityMin: number;
  newsVolumeDeltaZ: number;
  oracleProximitySec: number;

  // Category/rules awareness (1)
  esotericRuleTargetFlag: boolean;

  // Aggregates (3)
  walletBetCount24h: number;
  walletAggUsd24h: number;
  walletAggUsd7d: number;
};
```

**Total: 30 features**

#### InsiderRiskScore

```typescript
type InsiderRiskScore = {
  irsBet: number; // 0..100
  components: Record<string, number>; // 0..1 each
};
```

## Scoring Algorithm

### Component Weights

```typescript
const WEIGHTS = {
  STAKE_IMPACT: 0.30,      // 30%
  TEMPORAL_EVENT: 0.25,    // 25%
  WALLET_HISTORY: 0.20,    // 20%
  EVASION_URGENCY: 0.15,   // 15%
  MARKET_CONTEXT: 0.10,    // 10%
};
```

### Component Calculations

#### 1. Stake Impact (30%)

Measures bet size and market impact.

```typescript
function computeStakeImpact(features: PreResolutionFeatures): number {
  const fracNorm = min(features.fractionOfPool / 0.10, 1);
  const zScoreNorm = sigmoid(features.zScoreBetSize / 3);
  const deltaNorm = min(abs(features.deltaProb) / 0.25, 1);
  
  return (fracNorm + zScoreNorm + deltaNorm) / 3;
}
```

**Thresholds**:
- `fractionOfPool` > 10% → max score
- `zScoreBetSize` > 3σ → high score
- `deltaProb` > 25% → max score

#### 2. Temporal/Event Proximity (25%)

Measures timing relative to resolution and events.

```typescript
function computeTemporalScore(features: PreResolutionFeatures): number {
  // Time to resolution
  const timeScore = features.timeToResolutionSec <= 86400
    ? 1 - (features.timeToResolutionSec / 86400)
    : 0;

  // Pre-announcement proximity
  const eventScore = 
    features.preAnnouncementProximityMin < 60 ? 1 :
    features.preAnnouncementProximityMin < 720 ? 0.5 : 0;

  // Oracle proximity
  const oracleScore = features.oracleProximitySec < 3600 ? 1 : 0;

  return (timeScore + eventScore + oracleScore) / 3;
}
```

**Thresholds**:
- < 24h to resolution → increasing score
- < 1h to announcement → max score
- < 1h to oracle request → max score

#### 3. Wallet/Cluster History (20%)

Measures wallet provenance and betting patterns.

```typescript
function computeHistoryScore(features: PreResolutionFeatures): number {
  const newWalletScore = features.newWalletFlag ? 1 : 0;
  const betCountNorm = min(features.walletBetCount24h / 5, 1);
  const aggUsdNorm = min(features.walletAggUsd7d / 50000, 1);

  return (newWalletScore + betCountNorm + aggUsdNorm) / 3;
}
```

**Thresholds**:
- New wallet (< 7 days) → max score
- > 5 bets in 24h → max score
- > $50k in 7d → max score

#### 4. Evasion/Urgency (15%)

Measures suspicious urgency and obfuscation.

```typescript
function computeEvasionScore(features: PreResolutionFeatures): number {
  const gasPriorityScore = features.gasPriorityFlag ? 1 : 0;
  const fanInNorm = min(features.fanInCount24h / 5, 1);
  
  const gapScore =
    features.fundingGapSec < 3600 ? 1 :
    features.fundingGapSec < 86400 ? 0.5 : 0;

  return (gasPriorityScore + fanInNorm + gapScore) / 3;
}
```

**Thresholds**:
- High gas priority → max score
- > 5 funders in 24h → max score
- < 1h funding gap → max score

#### 5. Market Microstructure Context (10%)

Measures order-flow sophistication.

```typescript
function computeContextScore(features: PreResolutionFeatures): number {
  const marketableScore = features.isMarketableOrder ? 1 : 0;
  const slippageNorm = min(features.slippageFootprintBps / 50, 1);
  const imbalanceNorm = clamp((features.bookImbalanceAfter + 1) / 2, 0, 1);
  const firstMoverScore = features.firstMoverFlag ? 1 : 0;
  const lowLiqScore = features.lowLiquiditySideFlag ? 1 : 0;

  return (marketableScore + slippageNorm + imbalanceNorm + 
          firstMoverScore + lowLiqScore) / 5;
}
```

**Thresholds**:
- Marketable order → max score
- > 50 bps slippage → max score
- First mover (> $2k) → max score
- Low liquidity side (< $5k depth) → max score

### Final IRS Calculation

```typescript
const weightedScore = 
  0.30 * stakeScore +
  0.25 * temporalScore +
  0.20 * historyScore +
  0.15 * evasionScore +
  0.10 * contextScore;

const irsBet = round(clamp(weightedScore, 0, 1) * 100);
```

## Feature Computation

Located in `apps/api/src/features/computeFeatureVector.ts`.

### Data Sources

1. **Database (Prisma)**
   - Bet record (amount, timestamps, outcomes)
   - Market record (resolution date, metadata)
   - Wallet record (age, flags)

2. **Computed**
   - `timeToResolutionSec`: `closesAt - betTimestamp`
   - `walletAgeDays`: `betTimestamp - wallet.firstSeenAt`
   - `firstMoverFlag`: `betUsd >= FIRST_MOVER_MIN_USD`

3. **Mocked (for now)**
   - Order-flow: `isMarketableOrder`, `slippageFootprintBps`, etc.
   - Funding: `fundingGapSec`, `fundingSourceType`
   - News: `preAnnouncementProximityMin`, `newsVolumeDeltaZ`
   - Oracle: `oracleProximitySec`

### Extension Points

To integrate real data:

1. **Order-Flow**:
   - Parse order book snapshots
   - Compare bet to best bid/ask
   - Calculate slippage from depth curve

2. **Funding**:
   - Scan wallet's inbound transfers
   - Classify sources (CEX addresses, mixers)
   - Compute time deltas

3. **News/Social**:
   - Query NewsAPI, Twitter with market keywords
   - Compute volume z-scores
   - Match timestamps

4. **Oracle**:
   - Query UMA subgraph for oracle requests
   - Match to market resolution
   - Compute proximity

## API Endpoints

### GET /health

Returns API status.

**Response**:
```json
{
  "ok": true,
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

### GET /markets

List markets with pagination.

**Query Params**:
- `status` (optional): "open" | "closed" | "resolved"
- `limit` (optional): Number, max 100
- `cursor` (optional): Market ID for pagination

**Response**:
```json
{
  "data": [
    {
      "id": "market-001",
      "question": "Will Bitcoin reach $100k by end of 2024?",
      "category": "Crypto",
      "status": "open",
      "closesAt": "2024-12-31T23:59:59Z",
      "_count": { "bets": 42, "newsEvents": 3 }
    }
  ],
  "meta": {
    "count": 1,
    "nextCursor": null
  }
}
```

### GET /wallets/:address

Get wallet profile with bets and scores.

**Response**:
```json
{
  "wallet": {
    "address": "0x1234...",
    "firstSeenAt": "2024-01-01T00:00:00Z",
    "newWalletFlag": false,
    "roi30d": 0.15,
    "winRateRolling": 0.65
  },
  "recentBets": [...],
  "recentScores": [...]
}
```

### GET /alerts

Get high-risk bets from last 24h.

**Query Params**:
- `limit` (optional): Number, max 100
- `threshold` (optional): Min IRS, default 75

**Response**:
```json
{
  "data": [
    {
      "id": "score-001",
      "irsBet": 87,
      "irsWallet": 75,
      "createdAt": "2024-01-15T11:30:00Z",
      "bet": { ... },
      "market": { ... }
    }
  ],
  "meta": {
    "count": 2,
    "threshold": 75
  }
}
```

### POST /score/bet

Compute IRS for a bet.

**Request Body** (option 1 - existing bet):
```json
{
  "betId": "bet-001"
}
```

**Request Body** (option 2 - ad-hoc bet):
```json
{
  "bet": {
    "id": "bet-new",
    "txHash": "0xabc...",
    "marketId": "market-001",
    "wallet": "0x1234...",
    "outcomeId": "yes",
    "timestamp": "2024-01-15T12:00:00Z",
    "blockNumber": 12345678,
    "betUsd": 10000,
    "impliedBefore": 0.45,
    "impliedAfter": 0.55,
    "deltaProb": 0.10,
    "fractionOfPool": 0.08,
    "zScoreSize": 3.2,
    "gasPriorityFlag": true,
    "timeToResolutionSec": 86400
  }
}
```

**Response**:
```json
{
  "features": {
    "timeToResolutionSec": 86400,
    "betUsd": 10000,
    // ... all 30 features
  },
  "score": {
    "irsBet": 68,
    "components": {
      "stakeImpact": 0.72,
      "temporal": 0.45,
      "history": 0.33,
      "evasion": 0.67,
      "context": 0.58
    }
  }
}
```

## Worker Queues

Located in `apps/worker/src/`.

### Queue Flow

```
INGEST_POLYMARKET ──┐
                    ├──> FEATURE_COMPUTE ──> SCORING ──> DB
INGEST_ONCHAIN ────┘

NEWS_INGEST ──> DB (NewsEvent)
```

### Queue Definitions

**INGEST_POLYMARKET**
- Job: `{ marketId?, fromTimestamp? }`
- Fetches markets/bets from Polymarket API
- Enqueues feature compute for new bets

**INGEST_ONCHAIN**
- Job: `{ fromBlock, toBlock }`
- Scans Polygon for CTF events
- Enqueues feature compute for new bets

**FEATURE_COMPUTE**
- Job: `{ betId }`
- Calls API `/score/bet` or computes directly
- Enqueues scoring

**SCORING**
- Job: `{ betId }`
- Computes IRS
- Persists FeatureSnapshot + Score
- Triggers alerts if IRS >= 75

**NEWS_INGEST**
- Job: `{ marketId?, query? }`
- Fetches news from APIs
- Persists NewsEvent records

### Concurrency

Configured in worker constructors:
- INGEST_POLYMARKET: 2
- INGEST_ONCHAIN: 1
- FEATURE_COMPUTE: 5
- SCORING: 10
- NEWS_INGEST: 3

## Testing

### Unit Tests

Located in `apps/api/src/scoring/insiderScore.test.ts`.

**Test Cases**:
1. Low-risk bet → IRS < 30
2. Medium-risk bet → IRS 40-70
3. High-risk bet → IRS >= 70
4. Component sum verification

**Run**:
```bash
cd apps/api
pnpm test
```

### Integration Tests

To add:
1. API endpoint tests (Fastify inject)
2. Database tests (Prisma test client)
3. Worker tests (BullMQ test queues)

### E2E Tests

To add:
1. Playwright tests for UI flows
2. Full pipeline tests (ingest → score → alert)

## Performance Considerations

### Database Indexes

Already indexed:
- `Bet.marketId`
- `Bet.wallet`
- `Bet.timestamp`
- `Score.irsBet`
- `Score.createdAt`

### Caching

Redis is available for:
- API response caching
- Feature vector caching
- Rate limiting

### Scalability

- **Horizontal**: Run multiple worker instances
- **Vertical**: Increase concurrency per queue
- **Database**: Add read replicas for queries
- **API**: Deploy behind load balancer

## Security

### Current State

- No authentication (demo/internal use)
- CORS enabled for all origins
- Database credentials in .env

### Production Recommendations

1. Add API authentication (JWT, API keys)
2. Restrict CORS to known origins
3. Use secret management (Vault, AWS Secrets)
4. Enable Prisma query logging
5. Rate limit API endpoints
6. Sanitize user inputs
7. Use prepared statements (Prisma does this)

## Monitoring & Observability

### Logging

- API: Pino pretty logging
- Worker: Console logs with prefixes
- Level: Configurable via `LOG_LEVEL` env

### Metrics

To add:
- API request counts, latencies (Prometheus)
- Queue depths, processing times (BullMQ metrics)
- IRS distribution histogram
- Alert rate over time

### Alerting

Configured via `SLACK_WEBHOOK_URL`:
- High-risk bets (IRS >= 75)
- System errors
- Queue backlogs

## Deployment

### Docker

Build images:
```bash
docker build -t phoenix-api -f apps/api/Dockerfile .
docker build -t phoenix-worker -f apps/worker/Dockerfile .
docker build -t phoenix-web -f apps/web/Dockerfile .
```

Run:
```bash
docker run -p 4000:4000 --env-file .env phoenix-api
docker run --env-file .env phoenix-worker
docker run -p 3000:3000 phoenix-web
```

### Kubernetes

To add:
- Deployment manifests
- Service definitions
- ConfigMaps for env vars
- Secrets for sensitive data
- HPA for auto-scaling

### Serverless

- **API**: Deploy to AWS Lambda (Fastify supports)
- **Worker**: Use AWS SQS + Lambda
- **Web**: Deploy to Vercel/Netlify

## Roadmap

### Phase 1: MVP (Current)

- [x] Basic data models
- [x] Scoring algorithm
- [x] API endpoints
- [x] Dashboard UI
- [x] Mock data ingestion

### Phase 2: Real Data

- [ ] Polymarket API integration
- [ ] On-chain event monitoring
- [ ] News/Twitter ingestion
- [ ] Oracle timing integration

### Phase 3: Advanced Features

- [ ] Wallet clustering (graph analysis)
- [ ] Pattern matching (historical)
- [ ] ML-based scoring (XGBoost, LSTM)
- [ ] Automated alerts (Slack, email)

### Phase 4: Production

- [ ] Authentication & authorization
- [ ] Multi-tenancy
- [ ] Advanced analytics
- [ ] Compliance reporting

## References

- **Polymarket API**: https://docs.polymarket.com/
- **UMA Protocol**: https://docs.uma.xyz/
- **Prisma ORM**: https://www.prisma.io/docs
- **BullMQ**: https://docs.bullmq.io/
- **Next.js 14**: https://nextjs.org/docs
- **shadcn/ui**: https://ui.shadcn.com/

