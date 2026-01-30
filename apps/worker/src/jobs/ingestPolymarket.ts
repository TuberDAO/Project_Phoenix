import { PrismaClient } from '@prisma/client';
import * as PolyClient from '../services/polymarketClient.js';
import { featureComputeQueue } from '../queues/definitions.js';
import { processBatches, type BatchResult } from '../lib/batchProcessor.js';
import { enrichBetFromChain, isChainEnrichmentEnabled } from '../services/chainClient.js';

const prisma = new PrismaClient();

// Configuration (can be overridden via environment)
const CONFIG = {
  /** Batch size for processing markets */
  MARKET_BATCH_SIZE: parseInt(process.env.INGEST_MARKET_BATCH_SIZE || '20', 10),
  /** Delay between market batches in ms */
  BATCH_DELAY_MS: parseInt(process.env.INGEST_BATCH_DELAY_MS || '1500', 10),
  /** Max concurrent market processing */
  CONCURRENCY: parseInt(process.env.INGEST_CONCURRENCY || '3', 10),
  /** Max retries per market */
  MAX_RETRIES: parseInt(process.env.INGEST_MAX_RETRIES || '3', 10),
  /** Trade window in minutes (how far back to look for trades) - default 60 mins for better coverage */
  TRADE_WINDOW_MINS: parseInt(process.env.INGEST_TRADE_WINDOW_MINS || '60', 10),
  /** Max trades to fetch per market */
  TRADES_PER_MARKET: parseInt(process.env.INGEST_TRADES_PER_MARKET || '100', 10),
  /** Enable debug logging */
  DEBUG: process.env.INGEST_DEBUG === 'true',
};

/**
 * Metrics for an ingestion cycle
 */
export interface IngestionMetrics {
  cycleId: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  totalOpenMarketsFetched: number;
  totalMarketsProcessed: number;
  totalMarketsSkipped: number;
  totalMarketsFailed: number;
  totalNewBetsEnqueued: number;
  totalTradesProcessed: number;
  totalDuplicatesSkipped: number;
  errors: string[];
}

/**
 * Result from processing a single market
 */
interface MarketProcessResult {
  marketId: string;
  tradesProcessed: number;
  newBetsEnqueued: number;
  duplicatesSkipped: number;
  error?: string;
}

/**
 * Generate a unique cycle ID for tracking
 */
function generateCycleId(): string {
  return `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Log ingestion metrics to AuditLog table for tracking
 */
async function logIngestionMetrics(metrics: IngestionMetrics): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        type: 'ingestion_cycle',
        refId: metrics.cycleId,
        payload: {
          ...metrics,
          startedAt: metrics.startedAt.toISOString(),
          completedAt: metrics.completedAt?.toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('[IngestPoly] Failed to log metrics:', error.message);
  }
}

/**
 * Upsert a market to the database.
 * 
 * IMPORTANT ID MAPPING:
 * - Market.id = Gamma ID (e.g., "517310") - used for FK references
 * - Market.conditionId = Polymarket condition ID (e.g., "0xaf9d...") - used for trade lookups
 */
async function upsertMarket(market: any): Promise<{ gammaId: string; conditionId: string | null }> {
  // Gamma ID is the primary key (what we use for FK references)
  const gammaId = String(market.id);
  // Condition ID is used for trade API lookups
  const conditionId = market.conditionId || market.condition_id || null;
  const clobTokenIds = parseClobTokenIds(market);
  
  // Parse outcomes if it's a string
  let outcomes = market.outcomes;
  if (typeof outcomes === 'string') {
    try {
      outcomes = JSON.parse(outcomes);
    } catch {
      outcomes = ['Yes', 'No'];
    }
  }
  
  await prisma.market.upsert({
    where: { id: gammaId },
    update: {
      conditionId, // Store condition ID for trade lookups
      question: market.question,
      category: market.events?.[0]?.slug || market.eventSlug || null,
      status: market.closed ? 'closed' : 'open',
      closesAt: new Date(market.endDate || market.end_date_iso || Date.now() + 86400000),
      resolvesAt: market.resolvedAt ? new Date(market.resolvedAt) : null,
      metaJson: {
        liquidity: market.liquidity || market.liquidityNum,
        volume: market.volume || market.volumeNum,
        outcomes,
        clobTokenIds,
        slug: market.slug,
        negRisk: market.negRisk,
      },
    },
    create: {
      id: gammaId,
      conditionId, // Store condition ID for trade lookups
      question: market.question,
      category: market.events?.[0]?.slug || market.eventSlug || null,
      createdAt: new Date(market.createdAt || market.created_at || Date.now()),
      closesAt: new Date(market.endDate || market.end_date_iso || Date.now() + 86400000),
      status: market.closed ? 'closed' : 'open',
      metaJson: {
        liquidity: market.liquidity || market.liquidityNum,
        volume: market.volume || market.volumeNum,
        outcomes,
        clobTokenIds,
        slug: market.slug,
        negRisk: market.negRisk,
      },
    },
  });
  
  return { gammaId, conditionId };
}

/**
 * Parse clobTokenIds which can be a JSON string or an array
 */
function parseClobTokenIds(market: any): string[] {
  // Try clobTokenIds first (Gamma API format - it's a JSON string!)
  const rawClobTokenIds = market.clobTokenIds || market.clob_token_ids;
  
  if (rawClobTokenIds) {
    // If it's a string, parse it
    if (typeof rawClobTokenIds === 'string') {
      try {
        return JSON.parse(rawClobTokenIds);
      } catch {
        return [];
      }
    }
    // If it's already an array, use it
    if (Array.isArray(rawClobTokenIds)) {
      return rawClobTokenIds;
    }
  }
  
  // Fall back to tokens array (old format)
  if (market.tokens && Array.isArray(market.tokens)) {
    return market.tokens.map((t: any) => t.token_id).filter(Boolean);
  }
  
  return [];
}

/**
 * Process a single market: fetch trades, create bets, enqueue for scoring
 * 
 * ID MAPPING:
 * - gammaId (market.id): Used as Market.id (FK reference for Bet.marketId)
 * - conditionId: Used for Polymarket trade API lookups
 */
async function processMarket(
  market: any,
  recentWindow: number,
  debug: boolean = false
): Promise<MarketProcessResult> {
  // IMPORTANT: gammaId is what we use for FK references (Market.id)
  const gammaId = String(market.id);
  // conditionId is what we use for trade API lookups
  const conditionId = market.conditionId || market.condition_id || null;
  const clobTokenIds = parseClobTokenIds(market);
  
  const result: MarketProcessResult = {
    marketId: gammaId, // Use gammaId for result tracking
    tradesProcessed: 0,
    newBetsEnqueued: 0,
    duplicatesSkipped: 0,
  };
  
  // Debug log once per market (first 5 markets)
  if (debug) {
    console.log(`[IngestPoly] DEBUG: Processing market`);
    console.log(`  - gammaId: ${gammaId}`);
    console.log(`  - conditionId: ${conditionId}`);
    console.log(`  - clobTokenIds count: ${clobTokenIds.length}`);
  }
  
  // Skip markets without conditionId (can't fetch trades)
  if (!conditionId) {
    if (debug) {
      console.log(`  - SKIP: No conditionId for trade lookup`);
    }
    return result;
  }
  
  // Skip markets without tokens
  if (clobTokenIds.length === 0) {
    if (debug) {
      console.log(`  - SKIP: No clobTokenIds`);
    }
    return result;
  }
  
  // SANITY CHECK: Verify market exists in DB before processing trades
  const dbMarket = await prisma.market.findUnique({
    where: { id: gammaId },
    select: { id: true, conditionId: true },
  });
  
  if (!dbMarket) {
    console.warn(`[IngestPoly] SKIP: Market ${gammaId} not found in DB (should have been upserted)`);
    result.error = 'Market not found in DB';
    return result;
  }
  
  // Fetch recent trades using conditionId
  let trades: any[] = [];
  let tradesResponse: any;
  
  try {
    tradesResponse = await PolyClient.getTrades({
      marketId: conditionId, // Use conditionId for API lookup
      sinceTs: Math.floor(recentWindow / 1000),
      limit: CONFIG.TRADES_PER_MARKET,
    });
    
    // Handle both array response and {data: [...]} response
    trades = Array.isArray(tradesResponse) 
      ? tradesResponse 
      : (tradesResponse?.data || tradesResponse || []);
    
    if (debug) {
      console.log(`  - Trades found: ${Array.isArray(trades) ? trades.length : 'not array'}`);
    }
  } catch (tradeErr: any) {
    if (debug) {
      console.log(`  - Trades API error: ${tradeErr.message}`);
    }
    result.error = tradeErr.message;
    return result;
  }
  
  if (!Array.isArray(trades) || trades.length === 0) {
    return result;
  }
  
  // Fetch current book for context (best effort)
  let books: Record<string, any> = {};
  try {
    books = await PolyClient.getBooks(clobTokenIds.slice(0, 2));
  } catch (bookError) {
    // Non-fatal: continue without book data
  }
  
  // Process each trade
  for (const trade of trades) {
    result.tradesProcessed++;
    
    try {
      // Handle different API response formats
      // Data API uses: transactionHash, proxyWallet, size, price
      // Old format used: transaction_hash, maker_address
      const txHash = trade.transactionHash || trade.transaction_hash || trade.id || `${gammaId}-${trade.timestamp}`;
      
      // Check if bet already exists (efficient duplicate check)
      const existing = await prisma.bet.findUnique({
        where: { txHash },
        select: { id: true },
      });
      
      if (existing) {
        result.duplicatesSkipped++;
        continue;
      }
      
      // Ensure wallet exists - Data API uses proxyWallet
      const wallet = (trade.proxyWallet || trade.maker_address || 'unknown').toLowerCase();
      await prisma.wallet.upsert({
        where: { address: wallet },
        update: {
          lastSeenAt: new Date(trade.timestamp * 1000),
        },
        create: {
          address: wallet,
          firstSeenAt: new Date(trade.timestamp * 1000),
          lastSeenAt: new Date(trade.timestamp * 1000),
          newWalletFlag: true,
        },
      });
      
      // Calculate bet metrics - Data API returns numbers directly
      const tradePrice = typeof trade.price === 'number' ? trade.price : parseFloat(trade.price || 0);
      const tradeSize = typeof trade.size === 'number' ? trade.size : parseFloat(trade.size || 0);
      const betUsd = tradePrice * tradeSize;
      
      // Data API doesn't have price_before, use current price
      const impliedAfter = tradePrice;
      const impliedBefore = tradePrice; // Best estimate without historical data
      const deltaProb = 0; // Would need price history to calculate
      
      // Estimate fraction of pool
      const marketLiquidity = parseFloat(market.liquidity || market.liquidityNum || 100000);
      const fractionOfPool = marketLiquidity > 0 ? betUsd / marketLiquidity : 0;
      
      // Estimate z-score
      const avgBetSize = marketLiquidity / 100;
      const zScoreSize = avgBetSize > 0 ? (betUsd - avgBetSize) / Math.max(avgBetSize * 0.5, 100) : 0;
      
      // Time to resolution
      const closesAt = new Date(market.endDate || market.end_date_iso || Date.now() + 86400000);
      const betTime = new Date(trade.timestamp * 1000);
      const timeToResolutionSec = Math.max(0, Math.floor((closesAt.getTime() - betTime.getTime()) / 1000));
      
      // Enrich with on-chain data (blockNumber, gasPriorityFlag)
      // Only fetches if CHAIN_ENRICHMENT_ENABLED=true, otherwise returns defaults
      const chainData = await enrichBetFromChain(txHash);
      
      // Create bet record - USE gammaId FOR FK REFERENCE!
      await prisma.bet.create({
        data: {
          id: txHash,
          txHash,
          marketId: gammaId, // IMPORTANT: Use gammaId (Market.id), NOT conditionId!
          wallet,
          outcomeId: trade.outcome || trade.asset || 'unknown',
          timestamp: betTime,
          blockNumber: chainData.blockNumber,
          betUsd,
          impliedBefore,
          impliedAfter,
          deltaProb,
          fractionOfPool,
          zScoreSize,
          gasPriorityFlag: chainData.gasPriorityFlag,
          timeToResolutionSec,
        },
      });
      
      result.newBetsEnqueued++;
      
      if (debug) {
        console.log(`  - Created bet: ${txHash.slice(0, 16)}... wallet=${wallet.slice(0, 10)}... $${betUsd.toFixed(2)}`);
      }
      
      // Enqueue for feature computation
      await featureComputeQueue.add('compute-features', {
        betId: txHash,
        books,
      });
      
    } catch (tradeError: any) {
      // Log but continue processing other trades
      if (!tradeError.message?.includes('Unique constraint')) {
        console.error(`[IngestPoly] Trade error in market ${gammaId}:`, tradeError.message);
      } else {
        result.duplicatesSkipped++;
      }
    }
  }
  
  return result;
}

/**
 * Ingest markets and trades from Polymarket APIs.
 * 
 * Features:
 * - Fetches ALL open markets via pagination
 * - Processes markets in batches with rate limiting
 * - Retry with exponential backoff on failures
 * - Comprehensive metrics and audit logging
 * 
 * Called periodically (default: every 15 seconds)
 */
export async function ingestPolymarketData(): Promise<IngestionMetrics> {
  const cycleId = generateCycleId();
  const startTime = Date.now();
  
  const metrics: IngestionMetrics = {
    cycleId,
    startedAt: new Date(),
    totalOpenMarketsFetched: 0,
    totalMarketsProcessed: 0,
    totalMarketsSkipped: 0,
    totalMarketsFailed: 0,
    totalNewBetsEnqueued: 0,
    totalTradesProcessed: 0,
    totalDuplicatesSkipped: 0,
    errors: [],
  };
  
  console.log(`[IngestPoly] ⏱️  Starting ingestion cycle ${cycleId}...`);
  
  try {
    // ==================== PHASE 1: Fetch ALL Open Markets ====================
    console.log('[IngestPoly] Phase 1: Fetching all open markets...');
    
    const allMarkets = await PolyClient.listAllMarkets(
      { status: 'open' },
      (pageNum, marketsInPage, totalSoFar) => {
        console.log(`[IngestPoly]   Page ${pageNum}: +${marketsInPage} markets (total: ${totalSoFar})`);
      }
    );
    
    metrics.totalOpenMarketsFetched = allMarkets.length;
    console.log(`[IngestPoly] ✅ Fetched ${allMarkets.length} open markets`);
    
    if (allMarkets.length === 0) {
      console.log('[IngestPoly] No open markets found, skipping ingestion');
      metrics.completedAt = new Date();
      metrics.durationMs = Date.now() - startTime;
      await logIngestionMetrics(metrics);
      return metrics;
    }
    
    // ==================== PHASE 2: Upsert All Markets to DB ====================
    console.log('[IngestPoly] Phase 2: Upserting markets to database...');
    
    const upsertResults = await processBatches(
      allMarkets,
      async (market) => {
        await upsertMarket(market);
        return true;
      },
      {
        batchSize: 50, // Larger batches for DB operations
        batchDelayMs: 100,
        concurrency: 10,
        maxRetries: 2,
      }
    );
    
    const upsertFailed = upsertResults.results.filter(r => r.error).length;
    if (upsertFailed > 0) {
      console.warn(`[IngestPoly]   ⚠️  ${upsertFailed} market upserts failed`);
    }
    console.log(`[IngestPoly] ✅ Upserted ${upsertResults.succeeded} markets to DB`);
    
    // Log sample ID mappings for debugging
    const sampleMarkets = allMarkets.slice(0, 3);
    console.log('[IngestPoly]   Sample ID mappings (gammaId -> conditionId):');
    for (const m of sampleMarkets) {
      console.log(`    - ${m.id} -> ${m.conditionId || 'null'}`);
    }
    
    // ==================== PHASE 3: Process Markets for Trades ====================
    console.log('[IngestPoly] Phase 3: Processing markets for trades...');
    console.log(`[IngestPoly]   Config: batch=${CONFIG.MARKET_BATCH_SIZE}, delay=${CONFIG.BATCH_DELAY_MS}ms, concurrency=${CONFIG.CONCURRENCY}`);
    console.log(`[IngestPoly]   Trade window: last ${CONFIG.TRADE_WINDOW_MINS} minutes`);
    
    const recentWindow = Date.now() - CONFIG.TRADE_WINDOW_MINS * 60 * 1000;
    console.log(`[IngestPoly]   Looking for trades since: ${new Date(recentWindow).toISOString()}`);
    
    // Debug first 3 markets to understand data structure
    let debugCount = 0;
    const DEBUG_LIMIT = 3;
    
    const tradeResults = await processBatches<any, MarketProcessResult>(
      allMarkets,
      async (market) => {
        const enableDebug = debugCount < DEBUG_LIMIT;
        if (enableDebug) debugCount++;
        return processMarket(market, recentWindow, enableDebug);
      },
      {
        batchSize: CONFIG.MARKET_BATCH_SIZE,
        batchDelayMs: CONFIG.BATCH_DELAY_MS,
        concurrency: CONFIG.CONCURRENCY,
        maxRetries: CONFIG.MAX_RETRIES,
        retryBaseDelayMs: 500,
        retryMaxDelayMs: 10000,
      },
      (batchNum, totalBatches, batchResults) => {
        const batchBets = batchResults.reduce((sum, r) => sum + (r.result?.newBetsEnqueued || 0), 0);
        const batchFailed = batchResults.filter(r => r.error).length;
        console.log(
          `[IngestPoly]   Batch ${batchNum}/${totalBatches}: ` +
          `+${batchBets} bets, ${batchFailed} errors`
        );
      }
    );
    
    // Aggregate results
    for (const result of tradeResults.results) {
      if (result.result) {
        metrics.totalMarketsProcessed++;
        metrics.totalTradesProcessed += result.result.tradesProcessed;
        metrics.totalNewBetsEnqueued += result.result.newBetsEnqueued;
        metrics.totalDuplicatesSkipped += result.result.duplicatesSkipped;
      } else if (result.error) {
        metrics.totalMarketsFailed++;
        if (metrics.errors.length < 10) {
          metrics.errors.push(`${result.item?.id || 'unknown'}: ${result.error.message}`);
        }
      } else {
        metrics.totalMarketsSkipped++;
      }
    }
    
    // ==================== PHASE 4: Final Summary ====================
    metrics.completedAt = new Date();
    metrics.durationMs = Date.now() - startTime;
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`[IngestPoly] 📊 INGESTION CYCLE COMPLETE: ${cycleId}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Duration:           ${(metrics.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Markets Fetched:    ${metrics.totalOpenMarketsFetched}`);
    console.log(`  Markets Processed:  ${metrics.totalMarketsProcessed}`);
    console.log(`  Markets Skipped:    ${metrics.totalMarketsSkipped} (no tokens/trades)`);
    console.log(`  Markets Failed:     ${metrics.totalMarketsFailed}`);
    console.log(`  Trades Processed:   ${metrics.totalTradesProcessed}`);
    console.log(`  New Bets Enqueued:  ${metrics.totalNewBetsEnqueued}`);
    console.log(`  Duplicates Skipped: ${metrics.totalDuplicatesSkipped}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    // Log to AuditLog for historical tracking
    await logIngestionMetrics(metrics);
    
    return metrics;
    
  } catch (error: any) {
    console.error('[IngestPoly] ❌ Ingestion cycle failed:', error.message);
    
    metrics.completedAt = new Date();
    metrics.durationMs = Date.now() - startTime;
    metrics.errors.push(`Fatal: ${error.message}`);
    
    await logIngestionMetrics(metrics);
    
    throw error;
  }
}

/**
 * Get ingestion configuration (for monitoring/debugging)
 */
export function getIngestionConfig() {
  return { ...CONFIG };
}
