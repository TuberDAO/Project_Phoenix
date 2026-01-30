# Polymarket Integration Guide

Complete guide to the Polymarket API integration in Project Phoenix.

## Overview

Project Phoenix now connects to live Polymarket data through three API families:

1. **CLOB API**: Order books, prices, midprices
2. **Gamma API**: Markets, events, metadata
3. **Data API**: Historical trades

Plus **WebSocket/RTDS** for real-time updates.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Rate Limiters                            │
│  (Token bucket per endpoint family, configurable via .env)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────┬──────────────────┬──────────────────────┐
│   CLOB Client   │   Gamma Client   │   Data API Client    │
│   (Books,       │   (Markets)      │   (Trades)           │
│    Prices)      │                  │                      │
└─────────────────┴──────────────────┴──────────────────────┘
         │                  │                    │
         └──────────────────┴────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │   LRU Caches     │
                  │   (2-30s TTL)    │
                  └──────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  Feature Engine  │
                  └──────────────────┘
```

## Rate Limiting

### Per-Endpoint Limits

All rate limits are configurable via environment variables in `.env`:

**Data API**:
- `RATE_DATA_GENERAL="200/10s"` - General endpoints
- `RATE_DATA_ALT="1200/1m"` - Alternative endpoints
- `RATE_DATA_TRADES="75/10s"` - Trade history

**Gamma API**:
- `RATE_GAMMA_GENERAL="750/10s"` - General endpoints
- `RATE_GAMMA_MARKETS="125/10s"` - Market list
- `RATE_GAMMA_EVENTS="100/10s"` - Event queries
- `RATE_GAMMA_SEARCH="300/10s"` - Search endpoints

**CLOB API**:
- `RATE_CLOB_BOOK="200/10s"` - Single order book
- `RATE_CLOB_BOOKS="80/10s"` - Batch order books
- `RATE_CLOB_PRICE="200/10s"` - Single price
- `RATE_CLOB_PRICES="80/10s"` - Batch prices
- `RATE_CLOB_MIDPRICE="200/10s"` - Midpoint prices
- `RATE_CLOB_MARKETS="250/10s"` - Market list
- `RATE_CLOB_PRICE_HISTORY="100/10s"` - Historical prices

**UMA Subgraph**:
- `RATE_UMA_SUBGRAPH="80/10s"` - Oracle data queries

### Rate Limiter Implementation

Uses `bottleneck` for token bucket algorithm:

```typescript
// apps/worker/src/rate/limiters.ts

import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({
  reservoir: 200,              // Max tokens
  reservoirRefreshAmount: 200, // Tokens added per interval
  reservoirRefreshInterval: 10000, // 10 seconds
  minTime: 50,                 // Min 50ms between requests
});

// Execute with rate limiting
await rateLimit('CLOB_BOOK', async () => {
  return fetchOrderBook(tokenId);
});
```

### Retry Logic

**Exponential backoff with jitter** on retryable errors (429, 5xx):

- Attempt 1: 200ms + jitter
- Attempt 2: 400ms + jitter
- Attempt 3: 800ms + jitter
- Attempt 4: 1600ms + jitter
- Max delay: 6 seconds

Configurable via:
```env
MAX_RETRIES="4"
RETRY_BASE_DELAY="200"
RETRY_MAX_DELAY="6000"
RETRY_JITTER_FACTOR="0.3"
```

## Polymarket Client API

### Initialization

```typescript
import * as PolyClient from './services/polymarketClient';

// Client initializes automatically with env vars:
// - CLOB_HOST
// - POLYMARKET_GAMMA_BASE
// - POLYMARKET_API_BASE
// - CHAIN_ID
```

### Markets (Gamma API)

```typescript
// List open markets
const markets = await PolyClient.listMarkets({
  status: 'open',
  limit: 50,
  cursor: 'optional-cursor',
});

// Get single market
const market = await PolyClient.getMarket('market-id');
```

### Order Books (CLOB API)

```typescript
// Get single order book
const book = await PolyClient.getBook(tokenId);
// Returns: { bids: [...], asks: [...], timestamp, ... }

// Get multiple books (batched with cache)
const books = await PolyClient.getBooks([tokenId1, tokenId2]);
// Returns: { tokenId1: book1, tokenId2: book2 }
```

### Prices (CLOB API)

```typescript
// Get single price
const price = await PolyClient.getPrice(tokenId);

// Get multiple prices
const prices = await PolyClient.getPrices([tokenId1, tokenId2]);

// Get midprices
const midprice = await PolyClient.getMidprice(tokenId);
const midprices = await PolyClient.getMidprices([tokenId1, tokenId2]);
```

### Trades (Data API)

```typescript
// Get recent trades for a market
const trades = await PolyClient.getTrades({
  marketId: 'market-id',
  sinceTs: Date.now() - 5 * 60 * 1000, // Last 5 minutes
  limit: 100,
});
```

### Price History (CLOB API)

```typescript
const history = await PolyClient.getPriceHistory({
  tokenId: 'token-id',
  startTs: Date.now() - 24 * 60 * 60 * 1000,
  endTs: Date.now(),
  interval: '1h',
});
```

### Helper Functions

```typescript
// Calculate order book depth within price range
const depth = PolyClient.calculateBookDepth(
  book,
  'buy', // or 'sell'
  0.45,  // from price
  0.55   // to price
);

// Calculate book imbalance
const imbalance = PolyClient.calculateBookImbalance(book, 3); // top 3 levels
// Returns: -1 to 1 (negative = ask-heavy, positive = bid-heavy)
```

## LRU Caching

Hot data is cached with short TTLs:

- **Order Books**: 2 seconds
- **Prices**: 3 seconds
- **Midprices**: 2 seconds
- **Markets**: 30 seconds

Caches automatically managed by `lru-cache`:
- Max 500-1000 items
- TTL-based expiration
- Automatic eviction on overflow

## WebSocket / RTDS

Real-time data stream for live market updates.

### Configuration

```env
POLYMARKET_WS_URL="wss://ws-subscriptions-clob.polymarket.com/ws/market"
ENABLE_WEBSOCKETS="true"  # Set to "false" to disable
```

### Implementation

```typescript
// apps/worker/src/services/polymarketWS.ts

import { initWebSocket } from './services/polymarketWS';

// Initialize (auto-reconnects on disconnect)
initWebSocket();

// WebSocket automatically:
// 1. Connects to market channel
// 2. Subscribes to all markets
// 3. Normalizes incoming trades
// 4. Deduplicates by transaction hash
// 5. Enqueues feature computation jobs
```

### Message Types

- `trade` / `last_trade_price` → New trade executed
- `book` / `book_delta` → Order book update
- `tick` / `price_change` → Price update

### Trade Processing

```typescript
// Normalized trade format:
{
  txHash: string;
  marketId: string;
  wallet: string;
  outcomeId: string;
  timestamp: Date;
  betUsd: number;
  side: 'buy' | 'sell';
  price: number;
  size: number;
}

// Auto-enqueued to FEATURE_COMPUTE queue
// Deduplicated against DB by txHash
```

## UMA Oracle Integration

Query UMA protocol for oracle timing data.

### Configuration

```env
UMA_SUBGRAPH_URL="https://api.thegraph.com/subgraphs/name/umaprotocol/..."
```

### API

```typescript
import * as UmaClient from './services/umaClient';

// Check if configured
if (UmaClient.isUmaConfigured()) {
  // Get resolution events (requests, proposals, disputes)
  const events = await UmaClient.getResolutionEvents({
    marketId: 'market-id',
    sinceTs: Date.now() / 1000,
  });
  
  // Get proximity to next oracle event
  const proximity = await UmaClient.getOracleProximity(
    'market-id',
    Date.now() / 1000
  );
  // Returns: seconds to next event (or 999999 if none)
}
```

## Ingestion Pipeline

### Periodic Ingestion

Runs every 15 seconds (configurable):

```env
INGEST_INTERVAL_SEC="15"
```

### Flow

```
┌──────────────────┐
│  Timer (15s)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ List Markets     │ (Gamma API)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Upsert Markets   │ (Database)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Fetch Trades     │ (Data API, last 5min)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Get Books        │ (CLOB API, for context)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Upsert Bets      │ (Database, dedupe by txHash)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Enqueue Feature  │ (BullMQ → FEATURE_COMPUTE)
│ Computation      │
└──────────────────┘
```

### Implementation

```typescript
// apps/worker/src/jobs/ingestPolymarket.ts

export async function ingestPolymarketData() {
  // 1. Fetch open markets
  const markets = await PolyClient.listMarkets({ status: 'open', limit: 50 });
  
  // 2. Upsert to DB
  for (const market of markets) {
    await prisma.market.upsert({ ... });
  }
  
  // 3. Fetch recent trades for each market
  const recentWindow = Date.now() - 5 * 60 * 1000;
  for (const market of markets.slice(0, 20)) {
    const trades = await PolyClient.getTrades({
      marketId: market.id,
      sinceTs: Math.floor(recentWindow / 1000),
    });
    
    // 4. Get books for context
    const books = await PolyClient.getBooks(market.tokenIds);
    
    // 5. Process trades
    for (const trade of trades) {
      // Deduplicate
      const exists = await prisma.bet.findUnique({ where: { txHash } });
      if (exists) continue;
      
      // Create bet record
      await prisma.bet.create({ ... });
      
      // Enqueue feature computation
      await featureComputeQueue.add('compute-features', {
        betId: txHash,
        books, // Pass books for microstructure features
      });
    }
  }
}
```

## Feature Computation (Real Data)

### Enhanced Feature Vector

Now computes **real microstructure features** from order books:

```typescript
// apps/api/src/features/computeFeatureVector.ts

export function computeFeatureVector(
  bet: Bet,
  market: Market,
  wallet?: Wallet,
  context?: {
    books?: Record<string, BookSnapshot>;
    oracleProximity?: number;
  }
): PreResolutionFeatures {
  // ... (see implementation for full details)
}
```

### Real Features Computed

**From Order Books**:

1. **isMarketableOrder**:
   - Compare trade price to best bid/ask
   - True if crossed the spread (market order)

2. **slippageFootprintBps**:
   - Effective price vs midpoint
   - Measured in basis points (0.01% = 1bp)

3. **bookImbalanceAfter**:
   - `(bidNotional - askNotional) / (bidNotional + askNotional)`
   - Calculated from top 3 levels post-trade

4. **lowLiquiditySideFlag**:
   - True if target side depth < $5,000 (configurable)
   - Indicates liquidity targeting

**From Market Data**:

5. **fractionOfPool**:
   - `betUsd / marketLiquidity`
   - Market liquidity from Gamma metadata

6. **firstMoverFlag**:
   - True if bet >= $2,000 and within 1h of market creation

**From UMA (if configured)**:

7. **oracleProximitySec**:
   - Seconds to next UMA oracle request/proposal
   - 999999 if no known event

**Placeholders (until on-chain integration)**:

- `fundingGapSec`, `fundingSourceType` (need Polygon traces)
- `fanInCount24h`, `fanOutPlanFlag` (need wallet graph analysis)
- `walletBetCount24h`, `walletAggUsd24h/7d` (need historical queries)
- `preAnnouncementProximityMin`, `newsVolumeDeltaZ` (need news integration)

## Monitoring & Debugging

### Rate Limiter Stats

Check current limiter state:

```typescript
import { getLimiterStats } from './rate/limiters';

const stats = getLimiterStats();
// Returns:
// {
//   CLOB_BOOK: { running: 2, queued: 5 },
//   GAMMA_MARKETS: { running: 0, queued: 0 },
//   ...
// }
```

### Logs

Watch for rate limit activity:

```bash
# Worker logs show:
[RateLimit] CLOB_BOOK: Retryable error (429). Retry 1/4 after 237ms
[RateLimit] GAMMA_MARKETS(market-001): Retry succeeded on attempt 2
```

### WebSocket Status

```typescript
import { getStatus } from './services/polymarketWS';

const status = getStatus();
// Returns:
// {
//   enabled: true,
//   connected: true,
//   processedTradesCount: 1247
// }
```

## Production Best Practices

### 1. Respect Rate Limits

- Use provided limiters for **all** API calls
- Don't bypass rate limiting
- Monitor queue depths

### 2. Handle Errors Gracefully

- Retry logic is built-in
- Log failed requests for investigation
- Use circuit breakers for persistent failures

### 3. Cache Effectively

- Hot data (books, prices) cached automatically
- Invalidate on stale data detection
- Balance TTL vs freshness needs

### 4. WebSocket Resilience

- Auto-reconnects on disconnect
- Deduplicates incoming trades
- Handles backpressure via BullMQ

### 5. Monitor Performance

- Track limiter queue depths
- Alert on retry rate spikes
- Monitor ingestion lag

## Testing

### Rate Limiting

```typescript
// Test that rate limiter queues requests
for (let i = 0; i < 300; i++) {
  promises.push(PolyClient.getBook(tokenId));
}
await Promise.all(promises);
// Should complete without 429 errors
```

### Retry Logic

```typescript
// Simulate 429 response
mock.onGet('/book').replyOnce(429).onGet('/book').reply(200, book);

const result = await PolyClient.getBook(tokenId);
// Should succeed after retry
```

### WebSocket

```bash
# Enable WebSocket in .env
ENABLE_WEBSOCKETS="true"

# Run worker
pnpm dev

# Watch logs for incoming trades:
[PolyWS] New trade: market-002 | 0xabcdef... | $12500.00 | buy @ 0.58
```

## Troubleshooting

### Rate Limit Errors

**Symptom**: `429 Too Many Requests` in logs

**Solution**:
1. Check limiter config in `.env`
2. Reduce `INGEST_INTERVAL_SEC`
3. Decrease market batch size in ingestion

### WebSocket Disconnects

**Symptom**: `[PolyWS] Disconnected` messages

**Solution**:
1. Check network stability
2. Verify `POLYMARKET_WS_URL` is correct
3. Auto-reconnect should handle transient issues

### Cache Misses

**Symptom**: High API call volume despite caching

**Solution**:
1. Increase cache TTL if data freshness allows
2. Increase cache max size
3. Check if cache keys are correct

### Slow Ingestion

**Symptom**: Long delays between ingestion cycles

**Solution**:
1. Reduce markets per cycle (currently 20)
2. Increase rate limits if possible
3. Use WebSocket for real-time data instead

## Future Enhancements

1. **On-Chain Data**:
   - Polygon RPC integration
   - Wallet funding analysis
   - Gas priority detection

2. **Advanced Caching**:
   - Redis-backed shared cache
   - Pub/sub for cache invalidation

3. **Adaptive Rate Limiting**:
   - Dynamic limit adjustment based on 429 responses
   - Per-market rate allocation

4. **Enhanced WebSocket**:
   - Selective market subscriptions
   - Order book reconstruction
   - Trade aggregation

5. **Monitoring Dashboard**:
   - Real-time limiter metrics
   - Ingestion health
   - API latency tracking

## References

- [Polymarket CLOB API Docs](https://docs.polymarket.com/)
- [Bottleneck Rate Limiter](https://github.com/SGrondin/bottleneck)
- [LRU Cache](https://github.com/isaacs/node-lru-cache)
- [WebSocket Protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

