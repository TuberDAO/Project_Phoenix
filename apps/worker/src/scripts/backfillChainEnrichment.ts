/**
 * Backfill script for chain enrichment.
 * 
 * Updates existing Bet rows where blockNumber = 0 with real on-chain data.
 * 
 * Run with:
 *   pnpm -C apps/worker exec tsx src/scripts/backfillChainEnrichment.ts
 * 
 * Environment Variables:
 *   CHAIN_RPC_URL                  - Polygon RPC endpoint (default: https://polygon-rpc.com)
 *   BACKFILL_BATCH_SIZE            - Bets per batch (default: 200)
 *   BACKFILL_MAX_BETS              - Max bets to process (default: 2000)
 *   BACKFILL_CONCURRENCY           - Max concurrent RPC calls (default: 3)
 *   CHAIN_GAS_PRIORITY_MULTIPLIER  - Gas threshold multiplier (default: 1.3)
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { JsonRpcProvider } from 'ethers';

// Load env vars
config();

// ==================== Configuration ====================

const CHAIN_RPC_URL = process.env.CHAIN_RPC_URL || 'https://polygon-rpc.com';
const BACKFILL_BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || '200', 10);
const BACKFILL_MAX_BETS = parseInt(process.env.BACKFILL_MAX_BETS || '2000', 10);
const BACKFILL_CONCURRENCY = parseInt(process.env.BACKFILL_CONCURRENCY || '3', 10);
const CHAIN_GAS_PRIORITY_MULTIPLIER = parseFloat(process.env.CHAIN_GAS_PRIORITY_MULTIPLIER || '1.3');

// Optional date filters (ISO datetime strings)
const BACKFILL_AFTER = process.env.BACKFILL_AFTER ? new Date(process.env.BACKFILL_AFTER) : null;
const BACKFILL_BEFORE = process.env.BACKFILL_BEFORE ? new Date(process.env.BACKFILL_BEFORE) : null;

// ==================== Types ====================

interface BackfillResult {
  txHash: string;
  status: 'updated' | 'not_found' | 'error';
  blockNumber?: number;
  gasPriorityFlag?: boolean;
  error?: string;
}

interface BackfillSummary {
  totalAttempted: number;
  updatedOk: number;
  notFound: number;
  errors: number;
  elapsedSeconds: number;
}

// ==================== Concurrency Limiter ====================

/**
 * Simple p-limit style concurrency limiter.
 */
function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      const run = queue.shift()!;
      run();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          active--;
          next();
        }
      };

      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

// ==================== Main ====================

const prisma = new PrismaClient();
const provider = new JsonRpcProvider(CHAIN_RPC_URL, 137);
const limit = createLimiter(BACKFILL_CONCURRENCY);

/**
 * Fetch and enrich a single bet from chain.
 */
async function enrichBet(txHash: string): Promise<BackfillResult> {
  const hashPrefix = txHash.slice(0, 18);

  try {
    // Fetch transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return {
        txHash,
        status: 'not_found',
        error: 'No receipt found (tx may be pending or invalid)',
      };
    }

    const blockNumber = receipt.blockNumber;
    const effectiveGasPrice = receipt.gasPrice; // ethers v6: gasPrice on receipt is effectiveGasPrice

    // Compute gasPriorityFlag
    let gasPriorityFlag = false;

    if (effectiveGasPrice) {
      try {
        const block = await provider.getBlock(blockNumber);
        if (block?.baseFeePerGas) {
          const threshold = (block.baseFeePerGas * BigInt(Math.floor(CHAIN_GAS_PRIORITY_MULTIPLIER * 100))) / 100n;
          gasPriorityFlag = effectiveGasPrice >= threshold;
        }
      } catch (blockErr: any) {
        // Block fetch failed, leave gasPriorityFlag as false
        console.warn(`  [${hashPrefix}...] Block fetch failed: ${blockErr.message}`);
      }
    }

    // Update the bet in database
    await prisma.bet.update({
      where: { txHash },
      data: {
        blockNumber,
        gasPriorityFlag,
      },
    });

    return {
      txHash,
      status: 'updated',
      blockNumber,
      gasPriorityFlag,
    };
  } catch (err: any) {
    // Check if it's a "not found" type error
    if (err.message?.includes('could not coalesce') || err.message?.includes('null')) {
      return {
        txHash,
        status: 'not_found',
        error: err.message,
      };
    }

    return {
      txHash,
      status: 'error',
      error: err.message,
    };
  }
}

/**
 * Process a batch of bets with concurrency limiting.
 */
async function processBatch(
  bets: Array<{ txHash: string }>,
  batchNum: number,
  totalBatches: number
): Promise<BackfillResult[]> {
  console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${bets.length} bets)...`);

  const results = await Promise.all(
    bets.map((bet) => limit(() => enrichBet(bet.txHash)))
  );

  // Log batch summary
  const updated = results.filter((r) => r.status === 'updated').length;
  const notFound = results.filter((r) => r.status === 'not_found').length;
  const errors = results.filter((r) => r.status === 'error').length;

  console.log(`   ✅ Updated: ${updated}  ⚠️ Not found: ${notFound}  ❌ Errors: ${errors}`);

  // Log individual errors/not-founds (first 5 per batch)
  const issues = results.filter((r) => r.status !== 'updated').slice(0, 5);
  for (const issue of issues) {
    const prefix = issue.txHash.slice(0, 18);
    console.log(`   - ${prefix}... [${issue.status}] ${issue.error || ''}`);
  }

  return results;
}

async function main() {
  const startTime = Date.now();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Chain Enrichment Backfill');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Configuration:');
  console.log(`  RPC URL:          ${CHAIN_RPC_URL.substring(0, 40)}...`);
  console.log(`  Batch size:       ${BACKFILL_BATCH_SIZE}`);
  console.log(`  Max bets:         ${BACKFILL_MAX_BETS}`);
  console.log(`  Concurrency:      ${BACKFILL_CONCURRENCY}`);
  console.log(`  Gas multiplier:   ${CHAIN_GAS_PRIORITY_MULTIPLIER}x`);
  console.log('');
  console.log('Date Filters:');
  console.log(`  After (>=):       ${BACKFILL_AFTER ? BACKFILL_AFTER.toISOString() : 'none'}`);
  console.log(`  Before (<):       ${BACKFILL_BEFORE ? BACKFILL_BEFORE.toISOString() : 'none'}`);
  console.log('');

  // Query bets that need backfilling
  console.log('🔍 Querying bets with blockNumber = 0...');

  // Build where clause with optional date filters
  const whereClause: {
    blockNumber: number;
    timestamp?: { gte?: Date; lt?: Date };
  } = { blockNumber: 0 };

  if (BACKFILL_AFTER || BACKFILL_BEFORE) {
    whereClause.timestamp = {};
    if (BACKFILL_AFTER) {
      whereClause.timestamp.gte = BACKFILL_AFTER;
    }
    if (BACKFILL_BEFORE) {
      whereClause.timestamp.lt = BACKFILL_BEFORE;
    }
  }

  const betsToBackfill = await prisma.bet.findMany({
    where: whereClause,
    select: { txHash: true },
    orderBy: { timestamp: 'desc' },
    take: BACKFILL_MAX_BETS,
  });

  console.log(`   Found ${betsToBackfill.length} bets to backfill`);

  if (betsToBackfill.length === 0) {
    console.log('\n✅ No bets need backfilling. Done!');
    await prisma.$disconnect();
    return;
  }

  // Split into batches
  const batches: Array<Array<{ txHash: string }>> = [];
  for (let i = 0; i < betsToBackfill.length; i += BACKFILL_BATCH_SIZE) {
    batches.push(betsToBackfill.slice(i, i + BACKFILL_BATCH_SIZE));
  }

  console.log(`   Split into ${batches.length} batches`);

  // Process all batches
  const allResults: BackfillResult[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batchResults = await processBatch(batches[i], i + 1, batches.length);
    allResults.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i < batches.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Calculate summary
  const summary: BackfillSummary = {
    totalAttempted: allResults.length,
    updatedOk: allResults.filter((r) => r.status === 'updated').length,
    notFound: allResults.filter((r) => r.status === 'not_found').length,
    errors: allResults.filter((r) => r.status === 'error').length,
    elapsedSeconds: (Date.now() - startTime) / 1000,
  };

  // Print summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  BACKFILL COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Total attempted:   ${summary.totalAttempted.toLocaleString()}`);
  console.log(`  Updated OK:        ${summary.updatedOk.toLocaleString()}`);
  console.log(`  Not found:         ${summary.notFound.toLocaleString()}`);
  console.log(`  Errors:            ${summary.errors.toLocaleString()}`);
  console.log(`  Elapsed time:      ${summary.elapsedSeconds.toFixed(1)}s`);
  console.log('');

  // Gas priority stats from updated bets
  const withGasPriority = allResults.filter(
    (r) => r.status === 'updated' && r.gasPriorityFlag === true
  ).length;
  const gasPriorityPercent = summary.updatedOk > 0
    ? ((withGasPriority / summary.updatedOk) * 100).toFixed(1)
    : '0.0';

  console.log(`  High-gas bets:     ${withGasPriority.toLocaleString()} (${gasPriorityPercent}% of updated)`);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
