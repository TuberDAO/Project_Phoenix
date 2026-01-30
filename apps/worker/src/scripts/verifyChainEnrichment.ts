/**
 * Verification script for chain enrichment.
 * 
 * Run with: npx tsx apps/worker/src/scripts/verifyChainEnrichment.ts
 * 
 * Checks:
 * - Total bets in database
 * - Bets with blockNumber != 0 (enriched)
 * - Bets with gasPriorityFlag = true (high gas)
 */

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load env vars
config();

const prisma = new PrismaClient();

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Chain Enrichment Verification');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Total bets
  const totalBets = await prisma.bet.count();
  console.log(`Total bets in database:        ${totalBets.toLocaleString()}`);
  console.log('');

  // Block number stats
  const betsWithBlockNumber = await prisma.bet.count({
    where: { NOT: { blockNumber: 0 } },
  });
  const betsWithoutBlockNumber = await prisma.bet.count({
    where: { blockNumber: 0 },
  });
  
  const enrichedPercent = totalBets > 0 
    ? ((betsWithBlockNumber / totalBets) * 100).toFixed(1) 
    : '0.0';
  
  console.log('Block Number:');
  console.log(`  With blockNumber != 0:       ${betsWithBlockNumber.toLocaleString()} (${enrichedPercent}%)`);
  console.log(`  With blockNumber = 0:        ${betsWithoutBlockNumber.toLocaleString()}`);
  console.log('');

  // Gas priority stats
  const betsWithGasPriority = await prisma.bet.count({
    where: { gasPriorityFlag: true },
  });
  const betsWithoutGasPriority = await prisma.bet.count({
    where: { gasPriorityFlag: false },
  });
  
  const gasPriorityPercent = totalBets > 0 
    ? ((betsWithGasPriority / totalBets) * 100).toFixed(1) 
    : '0.0';
  
  console.log('Gas Priority Flag:');
  console.log(`  With gasPriorityFlag = true: ${betsWithGasPriority.toLocaleString()} (${gasPriorityPercent}%)`);
  console.log(`  With gasPriorityFlag = false: ${betsWithoutGasPriority.toLocaleString()}`);
  console.log('');

  // Sample enriched bets
  if (betsWithBlockNumber > 0) {
    console.log('Sample enriched bets (up to 5):');
    const sampleBets = await prisma.bet.findMany({
      where: { NOT: { blockNumber: 0 } },
      select: {
        txHash: true,
        blockNumber: true,
        gasPriorityFlag: true,
        betUsd: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    for (const bet of sampleBets) {
      console.log(`  ${bet.txHash.slice(0, 18)}... block=${bet.blockNumber} gas=${bet.gasPriorityFlag} $${Number(bet.betUsd).toFixed(2)}`);
    }
    console.log('');
  }

  // Sample high-gas bets
  if (betsWithGasPriority > 0) {
    console.log('Sample high-gas bets (up to 5):');
    const highGasBets = await prisma.bet.findMany({
      where: { gasPriorityFlag: true },
      select: {
        txHash: true,
        blockNumber: true,
        betUsd: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    for (const bet of highGasBets) {
      console.log(`  ${bet.txHash.slice(0, 18)}... block=${bet.blockNumber} $${Number(bet.betUsd).toFixed(2)}`);
    }
    console.log('');
  }

  // Block number distribution (if enriched)
  if (betsWithBlockNumber > 0) {
    const blockStats = await prisma.bet.aggregate({
      where: { NOT: { blockNumber: 0 } },
      _min: { blockNumber: true },
      _max: { blockNumber: true },
      _avg: { blockNumber: true },
    });
    
    console.log('Block Number Distribution:');
    console.log(`  Min block: ${blockStats._min.blockNumber?.toLocaleString()}`);
    console.log(`  Max block: ${blockStats._max.blockNumber?.toLocaleString()}`);
    console.log(`  Avg block: ${Math.round(blockStats._avg.blockNumber || 0).toLocaleString()}`);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
