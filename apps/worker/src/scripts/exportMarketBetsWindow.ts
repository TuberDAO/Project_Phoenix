/**
 * Export bets for a specific market within a time window.
 * 
 * Environment Variables:
 *   MARKET_ID  - Required: The market ID to query
 *   AFTER      - Optional: ISO timestamp, include bets >= this time
 *   BEFORE     - Optional: ISO timestamp, include bets < this time
 *   LIMIT      - Optional: Max bets to fetch (default: 5000)
 * 
 * Run with:
 *   $env:MARKET_ID="xxx"
 *   $env:AFTER="2025-01-19T00:00:00Z"
 *   $env:BEFORE="2025-01-22T00:00:00Z"
 *   pnpm -C apps/worker exec tsx src/scripts/exportMarketBetsWindow.ts
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load env vars
config();

const prisma = new PrismaClient();

// Configuration
const MARKET_ID = process.env.MARKET_ID;
const AFTER = process.env.AFTER ? new Date(process.env.AFTER) : null;
const BEFORE = process.env.BEFORE ? new Date(process.env.BEFORE) : null;
const LIMIT = parseInt(process.env.LIMIT || '5000', 10);

interface HourlyBucket {
  hour: string;
  totalUsd: number;
  numBets: number;
  numNewWallet: number;
  numHighGas: number;
  numEnriched: number;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Export Market Bets Window');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Validate MARKET_ID
  if (!MARKET_ID) {
    console.error('❌ MARKET_ID environment variable is required.');
    console.log('');
    console.log('Usage:');
    console.log('  $env:MARKET_ID="your-market-id"');
    console.log('  $env:AFTER="2025-01-19T00:00:00Z"');
    console.log('  $env:BEFORE="2025-01-22T00:00:00Z"');
    console.log('  pnpm -C apps/worker exec tsx src/scripts/exportMarketBetsWindow.ts');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Market ID: ${MARKET_ID}`);
  console.log(`  After:     ${AFTER ? AFTER.toISOString() : 'none'}`);
  console.log(`  Before:    ${BEFORE ? BEFORE.toISOString() : 'none'}`);
  console.log(`  Limit:     ${LIMIT}`);
  console.log('');

  // Fetch the market details
  const market = await prisma.market.findUnique({
    where: { id: MARKET_ID },
    select: {
      id: true,
      question: true,
      category: true,
      status: true,
      closesAt: true,
      createdAt: true,
    },
  });

  if (!market) {
    console.error(`❌ Market not found: ${MARKET_ID}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('Market Details:');
  console.log(`  Question:   ${market.question}`);
  console.log(`  Category:   ${market.category || 'N/A'}`);
  console.log(`  Status:     ${market.status}`);
  console.log(`  Closes At:  ${market.closesAt.toISOString()}`);
  console.log(`  Created At: ${market.createdAt.toISOString()}`);
  console.log('');

  // Build where clause
  const whereClause: {
    marketId: string;
    timestamp?: { gte?: Date; lt?: Date };
  } = { marketId: MARKET_ID };

  if (AFTER || BEFORE) {
    whereClause.timestamp = {};
    if (AFTER) whereClause.timestamp.gte = AFTER;
    if (BEFORE) whereClause.timestamp.lt = BEFORE;
  }

  // Fetch bets with wallet info
  console.log('🔍 Querying bets...');
  
  const bets = await prisma.bet.findMany({
    where: whereClause,
    select: {
      id: true,
      txHash: true,
      wallet: true,
      timestamp: true,
      blockNumber: true,
      betUsd: true,
      gasPriorityFlag: true,
      deltaProb: true,
      impliedBefore: true,
      impliedAfter: true,
    },
    orderBy: { timestamp: 'asc' },
    take: LIMIT,
  });

  console.log(`   Found ${bets.length.toLocaleString()} bets`);
  console.log('');

  if (bets.length === 0) {
    console.log('❌ No bets found for this market/window.');
    await prisma.$disconnect();
    return;
  }

  // Get unique wallets to check newWalletFlag
  const uniqueWallets = [...new Set(bets.map((b) => b.wallet))];
  
  // Fetch wallet info
  const wallets = await prisma.wallet.findMany({
    where: { address: { in: uniqueWallets } },
    select: {
      address: true,
      newWalletFlag: true,
    },
  });

  const walletFlagMap = new Map(wallets.map((w) => [w.address, w.newWalletFlag]));

  // Calculate summary stats
  let totalUsd = 0;
  let numNewWallet = 0;
  let numHighGas = 0;
  let numEnriched = 0;

  for (const bet of bets) {
    totalUsd += Number(bet.betUsd);
    if (walletFlagMap.get(bet.wallet)) numNewWallet++;
    if (bet.gasPriorityFlag) numHighGas++;
    if (bet.blockNumber !== 0) numEnriched++;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY STATISTICS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Total Bets:            ${bets.length.toLocaleString()}`);
  console.log(`  Total USD:             $${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Unique Wallets:        ${uniqueWallets.length.toLocaleString()}`);
  console.log(`  New Wallet Flag:       ${numNewWallet.toLocaleString()} (${((numNewWallet / bets.length) * 100).toFixed(1)}%)`);
  console.log(`  High Gas Priority:     ${numHighGas.toLocaleString()} (${((numHighGas / bets.length) * 100).toFixed(1)}%)`);
  console.log(`  Chain Enriched:        ${numEnriched.toLocaleString()} (${((numEnriched / bets.length) * 100).toFixed(1)}%)`);
  console.log('');

  // Time range
  const firstBet = bets[0];
  const lastBet = bets[bets.length - 1];
  console.log(`  Time Range:            ${firstBet.timestamp.toISOString()} to ${lastBet.timestamp.toISOString()}`);
  console.log('');

  // Top 30 bets by size
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TOP 30 BETS BY SIZE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Timestamp                 | USD        | Wallet       | TxHash       | Gas | Block');
  console.log('  --------------------------|------------|--------------|--------------|-----|----------');

  const topBets = [...bets]
    .sort((a, b) => Number(b.betUsd) - Number(a.betUsd))
    .slice(0, 30);

  for (const bet of topBets) {
    const ts = bet.timestamp.toISOString().slice(0, 19).replace('T', ' ');
    const usd = Number(bet.betUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(10);
    const wallet = bet.wallet.slice(0, 12);
    const txHash = bet.txHash.slice(0, 12);
    const gas = bet.gasPriorityFlag ? '✓' : ' ';
    const block = bet.blockNumber !== 0 ? bet.blockNumber.toString() : 'N/A';
    
    console.log(`  ${ts} | $${usd} | ${wallet} | ${txHash} | ${gas}   | ${block}`);
  }

  console.log('');

  // Hourly buckets
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  HOURLY AGGREGATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Hour (UTC)         | Bets   | Total USD     | NewWallet | HighGas | Enriched');
  console.log('  -------------------|--------|---------------|-----------|---------|----------');

  const hourlyBuckets = new Map<string, HourlyBucket>();

  for (const bet of bets) {
    // Create hour key (YYYY-MM-DD HH:00)
    const hourKey = bet.timestamp.toISOString().slice(0, 13) + ':00';
    
    let bucket = hourlyBuckets.get(hourKey);
    if (!bucket) {
      bucket = {
        hour: hourKey,
        totalUsd: 0,
        numBets: 0,
        numNewWallet: 0,
        numHighGas: 0,
        numEnriched: 0,
      };
      hourlyBuckets.set(hourKey, bucket);
    }

    bucket.numBets++;
    bucket.totalUsd += Number(bet.betUsd);
    if (walletFlagMap.get(bet.wallet)) bucket.numNewWallet++;
    if (bet.gasPriorityFlag) bucket.numHighGas++;
    if (bet.blockNumber !== 0) bucket.numEnriched++;
  }

  // Sort by hour and print
  const sortedHours = [...hourlyBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  for (const [hourKey, bucket] of sortedHours) {
    const hour = hourKey.replace('T', ' ');
    const numBets = bucket.numBets.toString().padStart(6);
    const totalUsd = ('$' + bucket.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })).padStart(13);
    const newWallet = bucket.numNewWallet.toString().padStart(9);
    const highGas = bucket.numHighGas.toString().padStart(7);
    const enriched = bucket.numEnriched.toString().padStart(8);

    console.log(`  ${hour} | ${numBets} | ${totalUsd} | ${newWallet} | ${highGas} | ${enriched}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  // Export summary for easy copy-paste
  console.log('');
  console.log('Quick stats for analysis:');
  console.log(`  Market: ${market.question.slice(0, 60)}...`);
  console.log(`  Window: ${AFTER?.toISOString() || 'start'} to ${BEFORE?.toISOString() || 'end'}`);
  console.log(`  Bets: ${bets.length} | USD: $${totalUsd.toFixed(0)} | NewWallet: ${numNewWallet} | HighGas: ${numHighGas}`);
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
