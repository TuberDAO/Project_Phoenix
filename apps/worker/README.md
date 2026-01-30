# Phoenix Worker

Background workers for data ingestion, feature computation, and scoring.

## Overview

The worker service orchestrates the Phoenix data pipeline:

1. **Ingest** market data from Polymarket (REST + WebSocket)
2. **Compute** pre-resolution features from market microstructure
3. **Score** bets using the Insider Risk Score algorithm
4. **Alert** on high-risk activity

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  BullMQ Workers                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  INGEST_POLYMARKET  →  FEATURE_COMPUTE  →  SCORING  │
│  INGEST_ONCHAIN     ↗                               │
│  NEWS_INGEST                                         │
│                                                      │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│            Polymarket Integration                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  • Rate Limiters (token bucket per endpoint)        │
│  • REST Clients (CLOB, Gamma, Data)                 │
│  • WebSocket/RTDS (real-time trades)                │
│  • LRU Caches (2-30s TTL)                           │
│  • Retry Logic (exponential backoff + jitter)       │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Workers

### 1. INGEST_POLYMARKET

**Frequency**: Every 15 seconds (configurable via `INGEST_INTERVAL_SEC`)

**Tasks**:
- Fetch open markets from Gamma API
- Upsert markets to database
- Fetch recent trades (last 5 minutes)
- Get order books for context
- Create bet records (dedupe by txHash)
- Enqueue feature computation

**Rate Limits**:
- `RATE_GAMMA_MARKETS` for market list
- `RATE_DATA_TRADES` for trade history
- `RATE_CLOB_BOOKS` for order books

### 2. FEATURE_COMPUTE

**Concurrency**: 5 workers

**Tasks**:
- Load bet + market + wallet from database
- Query UMA for oracle proximity (if configured)
- Compute 30-feature vector using:
  - Order book snapshots
  - Market metadata
  - Wallet history
- Persist FeatureSnapshot to database
- Enqueue scoring

**Real Features**:
- `isMarketableOrder` (crossed spread?)
- `slippageFootprintBps` (effective price vs mid)
- `bookImbalanceAfter` (bid/ask imbalance)
- `lowLiquiditySideFlag` (< $5k depth)
- `firstMoverFlag` (early large bet)

### 3. SCORING

**Concurrency**: 10 workers

**Tasks**:
- Load FeatureSnapshot from database
- Compute Insider Risk Score (IRS)
- Persist Score to database
- Trigger alert if IRS >= 75
- Send Slack notification (if configured)

**Alert Threshold**: `ALERT_IRS_THRESHOLD` (default: 75)

### 4. INGEST_ONCHAIN (Stub)

**Status**: Reserved for future Polygon integration

Will scan on-chain events for:
- Wallet funding sources (CEX, mixer detection)
- Funding gaps (time between transfers)

### Chain Enrichment (NEW)

**Status**: Active (opt-in via environment variables)

Enriches bets with on-chain transaction data:
- `blockNumber` - Actual block number from transaction receipt
- `gasPriorityFlag` - True if effective gas price >= baseFeePerGas * 1.3

**Enable**:
```env
CHAIN_ENRICHMENT_ENABLED="true"
CHAIN_RPC_URL="https://polygon-rpc.com"  # Or your Polygon RPC endpoint
```

**Optional Config**:
```env
CHAIN_GAS_PRIORITY_MULTIPLIER="1.3"   # Gas price multiplier for priority flag (default: 1.3)
CHAIN_ENRICHMENT_CONCURRENCY="3"      # Max concurrent RPC calls (default: 3)
```

**Behavior**:
- If disabled (default): blockNumber=0, gasPriorityFlag=false (legacy behavior)
- If enabled: Fetches transaction receipt via RPC, computes gas priority
- Caches results in-memory to avoid duplicate RPC calls
- On RPC failure: Falls back to defaults, logs warning, continues ingestion

### 5. NEWS_INGEST (Stub)

**Status**: Reserved for future news integration

Will fetch from:
- NewsAPI
- Twitter/X API
- RSS feeds

Match to markets via NLP and compute:
- `preAnnouncementProximityMin`
- `newsVolumeDeltaZ`

## WebSocket / RTDS

Real-time trade stream from Polymarket.

**Enable/Disable**:
```env
ENABLE_WEBSOCKETS="true"
```

**URL**:
```env
POLYMARKET_WS_URL="wss://ws-subscriptions-clob.polymarket.com/ws/market"
```

**Behavior**:
- Connects to market channel
- Subscribes to all markets (or specific list)
- Normalizes incoming trades
- Deduplicates by transaction hash
- Auto-enqueues to FEATURE_COMPUTE

**Auto-Reconnect**:
- Reconnects on disconnect (5s delay)
- Survives transient network issues

## Rate Limiting

All API calls routed through per-endpoint rate limiters.

### Configuration

See `.env.example` for all rate limit variables.

Example:
```env
RATE_CLOB_BOOK="200/10s"    # 200 requests per 10 seconds
RATE_GAMMA_MARKETS="125/10s"
RATE_DATA_TRADES="75/10s"
```

### Retry Logic

**Retryable Errors**: 429 (rate limit), 5xx (server error)

**Backoff**: Exponential with jitter
- Attempt 1: ~200ms
- Attempt 2: ~400ms
- Attempt 3: ~800ms
- Attempt 4: ~1600ms

**Max Retries**: `MAX_RETRIES` (default: 4)

### Monitoring

Check limiter stats:
```typescript
import { getLimiterStats } from './rate/limiters';
const stats = getLimiterStats();
// { CLOB_BOOK: { running: 2, queued: 5 }, ... }
```

## Caching

LRU caches with short TTLs for hot data.

| Data Type     | TTL    | Max Items |
|---------------|--------|-----------|
| Order Books   | 2s     | 500       |
| Prices        | 3s     | 500       |
| Midprices     | 2s     | 500       |
| Markets       | 30s    | 1000      |

## Configuration

### Required Environment Variables

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
```

### Polymarket APIs

```env
POLYMARKET_API_BASE="https://data-api.polymarket.com"
POLYMARKET_GAMMA_BASE="https://gamma-api.polymarket.com"
CLOB_HOST="https://clob.polymarket.com"
POLYMARKET_WS_URL="wss://..."
CHAIN_ID="137"
```

### Worker Config

```env
INGEST_INTERVAL_SEC="15"     # Periodic ingestion interval
ENABLE_WEBSOCKETS="true"     # Enable real-time stream
ALERT_IRS_THRESHOLD="75"     # Alert threshold (0-100)
SLACK_WEBHOOK_URL=""         # Slack alerts (optional)
```

### Chain Enrichment (On-Chain Data)

```env
CHAIN_ENRICHMENT_ENABLED="false"      # Set to "true" to enable
CHAIN_RPC_URL=""                       # Polygon RPC (required if enabled)
CHAIN_GAS_PRIORITY_MULTIPLIER="1.3"   # Gas threshold multiplier (default: 1.3)
CHAIN_ENRICHMENT_CONCURRENCY="3"      # Max concurrent RPC calls (default: 3)
```

**Note**: If `CHAIN_ENRICHMENT_ENABLED=true` and `CHAIN_RPC_URL` is missing, the worker will fail to start with a clear error message.

### Rate Limits

See `.env.example` for complete list.

### Retry Config

```env
MAX_RETRIES="4"
RETRY_BASE_DELAY="200"
RETRY_MAX_DELAY="6000"
RETRY_JITTER_FACTOR="0.3"
```

## Running

### Development

```bash
# From root
pnpm dev

# Or just worker
cd apps/worker
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

### Docker

```bash
docker build -t phoenix-worker -f Dockerfile .
docker run --env-file .env phoenix-worker
```

## Logs

### Startup

```
🔧 Starting Phoenix workers...

📊 Rate Limit Configuration:
  Data API:
    General: 200/10000ms
    Trades: 75/10000ms
  ...

✅ Rate limiters initialized
✅ Polymarket client initialized
   CLOB: https://clob.polymarket.com
   Gamma: https://gamma-api.polymarket.com
✅ 5 workers started and listening for jobs
✅ WebSocket connected to Polymarket
⏰ Starting periodic ingestion (every 15s)
✅ All systems initialized
```

### Ingestion

```
[IngestPoly] Starting ingestion cycle...
[IngestPoly] Fetched 47 open markets
[IngestPoly] Market market-002: 12 recent trades
[IngestPoly] Ingestion complete: 8 new bets enqueued
```

### Feature Computation

```
[FeatureCompute] Computing features for bet bet-abc123
[FeatureCompute] Features computed: betUsd=$12500.00, fracPool=8.3%, zscore=3.5
```

### Scoring

```
[Scoring] IRS computed for bet bet-abc123: 87 (stake=0.82, temporal=0.95, history=0.73)
🚨 [Scoring] HIGH RISK ALERT: bet bet-abc123 (IRS: 87)
```

### WebSocket

```
[PolyWS] ✅ Connected to Polymarket WebSocket
[PolyWS] New trade: market-002 | 0xabcdef... | $12500.00 | buy @ 0.58
```

### Rate Limiting

```
[RateLimit] CLOB_BOOK(token-123): Retryable error (429). Retry 1/4 after 237ms
[RateLimit] CLOB_BOOK: Retry succeeded on attempt 2
```

## Troubleshooting

### High Rate Limit Errors

**Symptoms**: Many 429 errors, retries exhausted

**Solutions**:
1. Reduce `INGEST_INTERVAL_SEC` (e.g., 30s instead of 15s)
2. Decrease market batch size in `ingestPolymarket.ts` (line 30)
3. Increase rate limits if you have higher quota

### WebSocket Disconnects

**Symptoms**: Frequent `[PolyWS] Disconnected` messages

**Solutions**:
1. Check network stability
2. Verify `POLYMARKET_WS_URL` is correct
3. Auto-reconnect should handle transient issues
4. Disable WebSocket if persistent: `ENABLE_WEBSOCKETS="false"`

### Slow Ingestion

**Symptoms**: Ingestion cycles take > 30s

**Solutions**:
1. Check rate limiter queue depths: `getLimiterStats()`
2. Reduce markets processed per cycle
3. Increase rate limits if possible
4. Use WebSocket for real-time data instead of polling

### Memory Leaks

**Symptoms**: Memory usage grows over time

**Solutions**:
1. Check cache sizes (should be capped)
2. Verify worker job cleanup
3. Monitor Redis memory usage
4. Restart workers periodically

## Metrics

### Key Metrics to Monitor

1. **Ingestion Rate**: Bets/minute ingested
2. **Processing Latency**: Time from trade to score
3. **Queue Depths**: BullMQ queue sizes
4. **Rate Limiter Stats**: Running/queued per endpoint
5. **Alert Rate**: High-risk bets per hour
6. **WebSocket Uptime**: Connection stability

### Future: Prometheus Metrics

Export metrics for monitoring dashboards:
- `phoenix_bets_ingested_total`
- `phoenix_irs_scores_computed_total`
- `phoenix_api_requests_total{endpoint}`
- `phoenix_rate_limiter_queue_depth{limiter}`
- `phoenix_websocket_trades_total`

## Development

### Add New Worker

1. Create `apps/worker/src/workers/myWorker.ts`
2. Export `createMyWorker()` function
3. Add to `src/index.ts`
4. Add queue name to `src/queues/definitions.ts`

### Add New API Endpoint

1. Add to `src/services/polymarketClient.ts`
2. Add rate limiter key to `src/rate/limiters.ts`
3. Add rate limit config to `src/config/rateLimits.ts`
4. Update `.env.example`

## Testing

### Manual Testing

```bash
# Terminal 1: Start worker
pnpm dev

# Terminal 2: Trigger ingestion manually
# (Add manual trigger endpoint to API)
curl -X POST http://localhost:4000/admin/trigger-ingest
```

### Verify Chain Enrichment

After running ingestion with chain enrichment enabled:

```bash
# From repo root
npx tsx apps/worker/src/scripts/verifyChainEnrichment.ts
```

Expected output:
```
═══════════════════════════════════════════════════════════════
  Chain Enrichment Verification
═══════════════════════════════════════════════════════════════

Total bets in database:        10,372

Block Number:
  With blockNumber != 0:       1,234 (11.9%)
  With blockNumber = 0:        9,138

Gas Priority Flag:
  With gasPriorityFlag = true: 89 (0.9%)
  With gasPriorityFlag = false: 10,283

Sample enriched bets (up to 5):
  0x1234567890abcdef... block=54321000 gas=false $125.50
  ...

═══════════════════════════════════════════════════════════════
```

### Backfill Chain Enrichment (One-Time)

For existing bets with `blockNumber = 0`, run the backfill script:

```bash
# From repo root (PowerShell)
pnpm -C apps/worker exec tsx src/scripts/backfillChainEnrichment.ts
```

**Environment Variables** (all optional):

```env
CHAIN_RPC_URL=https://polygon-rpc.com       # Polygon RPC endpoint
BACKFILL_BATCH_SIZE=200                      # Bets per batch
BACKFILL_MAX_BETS=2000                       # Max bets to process
BACKFILL_CONCURRENCY=3                       # Concurrent RPC calls
CHAIN_GAS_PRIORITY_MULTIPLIER=1.3            # Gas threshold multiplier
BACKFILL_AFTER=2026-01-01T00:00:00Z          # Filter: timestamp >= (ISO datetime)
BACKFILL_BEFORE=2026-01-08T00:00:00Z         # Filter: timestamp < (ISO datetime)
```

**Example with custom settings:**

```powershell
$env:CHAIN_RPC_URL="https://your-rpc-endpoint.com"
$env:BACKFILL_MAX_BETS="5000"
pnpm -C apps/worker exec tsx src/scripts/backfillChainEnrichment.ts
```

**Expected output:**

```
═══════════════════════════════════════════════════════════════
  Chain Enrichment Backfill
═══════════════════════════════════════════════════════════════

Configuration:
  RPC URL:          https://polygon-rpc.com...
  Batch size:       200
  Max bets:         2000
  Concurrency:      3
  Gas multiplier:   1.3x

🔍 Querying bets with blockNumber = 0...
   Found 1500 bets to backfill
   Split into 8 batches

📦 Processing batch 1/8 (200 bets)...
   ✅ Updated: 195  ⚠️ Not found: 3  ❌ Errors: 2
...

═══════════════════════════════════════════════════════════════
  BACKFILL COMPLETE
═══════════════════════════════════════════════════════════════

  Total attempted:   1,500
  Updated OK:        1,420
  Not found:         65
  Errors:            15
  Elapsed time:      45.2s

  High-gas bets:     89 (6.3% of updated)

═══════════════════════════════════════════════════════════════
```

### Rate Limit Testing

```bash
# Spam requests to test rate limiter
for i in {1..300}; do
  curl http://localhost:4000/score/bet -d '{"betId":"bet-001"}' &
done

# Should complete without errors, queued by rate limiter
```

## References

- [POLYMARKET_INTEGRATION.md](../../POLYMARKET_INTEGRATION.md) - Complete integration guide
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Bottleneck Rate Limiter](https://github.com/SGrondin/bottleneck)
- [Polymarket API Docs](https://docs.polymarket.com/)

