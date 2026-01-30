# Project Phoenix - Implemented Variables Inventory

This document provides a comprehensive checklist of all insider detection variables in the Project Phoenix system, documenting their implementation status, code locations, database storage, and any outstanding work.

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ Implemented | Feature is fully computed with real data |
| ⚠️ Partially | Feature exists but uses placeholder/default values |
| ❌ Not implemented | Feature is defined but not computed |

---

## 1. Timing vs Event/Oracle Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `betTimestamp` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Bet.timestamp` | Computed from bet timestamp |
| `timeToResolutionSec` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Bet.timeToResolutionSec` | `secondsBetween(market.closesAt, betTimestamp)` |
| `isFinalHourBeforeClose` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `timeToResolutionSec <= 3600` |
| `preAnnouncementProximityMin` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 9999**. TODO: Integrate events calendar API |
| `oracleProximitySec` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()`, `apps/worker/src/services/umaClient.ts` | `FeatureSnapshot.features` (JSON) | Works when `UMA_SUBGRAPH_URL` is configured; defaults to 999999 otherwise |
| `oracleMempoolLagSec` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 0**. TODO: Implement mempool monitoring |

---

## 2. Size & Market Impact Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `betUsd` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Bet.betUsd` | `price * size` from trade |
| `liquidityAtBetUsd` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()`, `calculateBookDepth()` | `FeatureSnapshot.features` (JSON) | Calculated from orderbook when available, else estimated |
| `fractionOfPool` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Bet.fractionOfPool`, `FeatureSnapshot.features` | `betUsd / liquidityAtBetUsd` |
| `zScoreBetSize` | ✅ Implemented | `apps/worker/src/jobs/ingestPolymarket.ts` → `processMarket()` | `Bet.zScoreSize` | `(betUsd - avgBetSize) / std` |
| `impliedBefore` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Bet.impliedBefore` | Price before trade execution |
| `impliedAfter` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Bet.impliedAfter` | Price after trade execution |
| `deltaProb` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Bet.deltaProb` | `impliedAfter - impliedBefore` |
| `estimatedFeeBps` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `CTF_BASE_FEE_BPS * min(price, 1-price)` |

---

## 3. Order-Flow Microstructure Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `isMarketableOrder` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | Detects if order crossed the spread |
| `slippageFootprintBps` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `|fill - mid| / mid * 10000` |
| `bookImbalanceAfter` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()`, `calculateBookImbalance()` | `FeatureSnapshot.features` (JSON) | `(bidNotional - askNotional) / sum` |
| `burstRatio1m` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: `fractionOfPool * 0.5`**. TODO: Track real 1-minute volumes |
| `firstMoverFlag` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `betUsd >= FIRST_MOVER_MIN_USD && marketAge < 1h` |
| `lowLiquiditySideFlag` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `sideDepth < LOW_LIQUIDITY_DEPTH_USD` |
| `quoteToTradeRatio` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 0**. TODO: Requires message-level data |
| `cancelReplaceRate` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 0**. TODO: Requires message-level data |
| `selfTradeIncidence` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 0**. TODO: Requires cluster analysis |

---

## 4. Wallet Provenance & Evasion Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `walletAgeDays` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Wallet.firstSeenAt` (computed) | `daysBetween(betTimestamp, wallet.firstSeenAt)` |
| `newWalletFlag` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `Wallet.newWalletFlag` | Set during wallet creation in ingestion |
| `fundingGapSec` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 720**. TODO: Track inbound transactions |
| `fundingSourceType` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 'unknown'**. Types: `'cex' | 'mixer' | 'wallet' | 'bridge' | 'unknown'`. TODO: On-chain analysis |
| `fanInCount24h` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 2**. TODO: Track distinct funders |
| `fanOutPlanFlag` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: false**. TODO: Analyze outflow patterns |
| `gasPriorityFlag` | ✅ Implemented | `apps/worker/src/jobs/ingestPolymarket.ts` → `processMarket()` | `Bet.gasPriorityFlag` | Currently set to `false` (need on-chain gas analysis) |
| `highGasMultiplier` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `gasPriorityFlag ? 1.8 : 1.0` |

---

## 5. Cross-Market Behavior Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `correlatedMarketsEntered5m` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 1**. TODO: Track cross-market entries |
| `basketSynchronizedFlag` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: false**. TODO: Detect basket trading |
| `copyTradeShadowFollowers` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 0**. TODO: Track shadow traders |
| `repeatedLastMinutePatternScore` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: 0**. TODO: Pattern analysis |

---

## 6. Social/News Alignment Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `newsVolumeDeltaZ` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | Computed when `context.newsVolume` is provided. Requires `NEWS_API_KEY` |
| `chatterLullFlag` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `postBetCount < baseline * 0.1`. Requires news ingestion |

**News Ingestion Infrastructure:**
- `apps/worker/src/jobs/newsIngest.ts` → `ingestNewsForMarkets()` - News ingestion worker
- `apps/worker/src/services/newsClient.ts` → `fetchNewsHeadlines()` - News API client
- `apps/worker/src/services/twitterClient.ts` → `fetchTweets()` - Twitter client (if configured)
- `NewsEvent` table stores headlines with `marketId`, `volumeScore`, `matchScore`

---

## 7. Category & Rules Awareness Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `esotericRuleTargetFlag` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: false**. TODO: NLP on market rules |
| `negriskFlag` | ✅ Implemented | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | `market.metaJson?.negrisk === true` |
| `ruleWindowHitFlag` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | **Placeholder: false**. TODO: Timing analysis vs admin milestones |

---

## 8. Wallet Aggregate (Rolling) Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `walletBetCount24h` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | Uses `context.walletStats?.betCount24h` or **Placeholder: 3** |
| `walletAggUsd24h` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | Uses `context.walletStats?.aggUsd24h` or **Placeholder: betUsd * 1.2** |
| `walletAggUsd7d` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | Uses `context.walletStats?.aggUsd7d` or **Placeholder: betUsd * 5** |

**TODO:** Query historical bets to compute actual rolling aggregates.

---

## 9. Cluster/Network Variables

| Variable | Status | File + Function | DB Field | Notes |
|----------|--------|-----------------|----------|-------|
| `clusterRotationScore` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | Uses `context.clusterInfo?.rotationScore` or **Placeholder: 0** |
| `clusterId` | ⚠️ Partially | `apps/api/src/features/computeFeatureVector.ts` → `computeFeatureVector()` | `FeatureSnapshot.features` (JSON) | Uses `context.clusterInfo?.clusterId` |

**Cluster Infrastructure:**
- `Cluster` table exists in schema (`apps/api/prisma/schema.prisma`)
- Fields: `id`, `members` (JSON), `createdAt`
- **TODO:** Implement cluster detection algorithm (graph-based wallet linkage)

---

## 10. Composite Scoring Outputs

| Output | Status | File + Function | DB Field | Notes |
|--------|--------|-----------------|----------|-------|
| `irsBet` | ✅ Implemented | `apps/api/src/scoring/insiderScore.ts` → `computeInsiderScore()` | `Score.irsBet`, `Evidence.irs` | 0-100 score from weighted components |
| `irsWallet` | ⚠️ Partially | `apps/worker/src/workers/scoring.ts` → `createScoringWorker()` | `Score.irsWallet` | **Placeholder: 0**. TODO: Aggregate wallet-level scoring |
| `irsCluster` | ⚠️ Partially | `apps/worker/src/workers/scoring.ts` → `createScoringWorker()` | `Score.irsCluster` | **Placeholder: 0**. TODO: Aggregate cluster-level scoring |

**Scoring Components (all implemented):**
- `stakeImpact` (30%) → `computeStakeImpactScore()` - fractionOfPool, zScoreBetSize, deltaProb
- `temporal` (25%) → `computeTemporalScore()` - timeToResolutionSec, preAnnouncementProximityMin, oracleProximitySec
- `history` (20%) → `computeHistoryScore()` - newWalletFlag, walletBetCount24h, walletAggUsd7d
- `evasion` (15%) → `computeEvasionScore()` - gasPriorityFlag, fanInCount24h, fundingGapSec
- `context` (10%) → `computeContextScore()` - isMarketableOrder, slippageFootprintBps, bookImbalanceAfter, firstMoverFlag, lowLiquiditySideFlag

**Weights are configurable** via `apps/api/src/scoring/weights.ts` and stored in `Config` table.

---

## 11. Benign Filters / Exclusion Criteria

| Filter | Status | File + Function | DB Field | Notes |
|--------|--------|-----------------|----------|-------|
| ROI-based filtering | ⚠️ Partially | N/A | `Wallet.roi30d` | Schema has field but not used in scoring |
| Win rate filtering | ⚠️ Partially | N/A | `Wallet.winRateRolling` | Schema has field but not used in scoring |
| Market maker detection | ❌ Not implemented | N/A | N/A | TODO: Identify & exclude known market makers |
| Arbitrage bot detection | ❌ Not implemented | N/A | N/A | TODO: Identify & exclude arbitrage bots |

---

## Summary Statistics

| Category | Implemented | Partial | Not Implemented | Total |
|----------|-------------|---------|-----------------|-------|
| Timing/Oracle | 3 | 3 | 0 | 6 |
| Size/Impact | 8 | 0 | 0 | 8 |
| Order-flow | 5 | 4 | 0 | 9 |
| Wallet/Evasion | 4 | 4 | 0 | 8 |
| Cross-market | 0 | 4 | 0 | 4 |
| Social/News | 0 | 2 | 0 | 2 |
| Category/Rules | 1 | 2 | 0 | 3 |
| Aggregates | 0 | 3 | 0 | 3 |
| Cluster/Network | 0 | 2 | 0 | 2 |
| Composite Scoring | 1 | 2 | 0 | 3 |
| Benign Filters | 0 | 2 | 2 | 4 |
| **TOTAL** | **22** | **28** | **2** | **52** |

---

## Priority TODOs

### High Priority (Core Detection)
1. **Funding source analysis** - Detect CEX withdrawals, mixers, bridges
2. **Cluster detection** - Graph-based wallet linkage algorithm
3. **Wallet rolling stats** - Query historical bets for accurate 24h/7d aggregates
4. **Gas priority analysis** - Check actual on-chain gas prices vs block median

### Medium Priority (Enhanced Detection)
5. **Cross-market tracking** - Detect correlated market entries
6. **News volume integration** - Pass news context to feature computation
7. **Oracle timing (full)** - Ensure UMA subgraph is configured in production
8. **Burst ratio (real)** - Track actual 1-minute market volumes

### Lower Priority (Advanced Features)
9. **Copy-trade detection** - Track shadow followers
10. **Rule window timing** - Integrate admin milestone calendars
11. **Esoteric rule targeting** - NLP analysis of market rules
12. **Market maker/bot exclusion** - Known address filtering

---

## Database Schema Reference

### Core Tables
- `Market` - Market metadata, condition IDs, close times
- `Bet` - Individual trade records with basic metrics
- `Wallet` - Wallet metadata and flags
- `FeatureSnapshot` - Full feature vector as JSON
- `Score` - Computed IRS scores (bet, wallet, cluster levels)
- `Evidence` - High-risk alert evidence for dashboard

### Supporting Tables
- `Cluster` - Wallet cluster definitions (not yet populated)
- `NewsEvent` - News/social mentions for markets
- `AuditLog` - System event logging
- `Config` - Runtime configuration (weights, thresholds)

---

*Last updated: 2026-01-20*
