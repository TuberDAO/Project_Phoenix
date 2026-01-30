/**
 * Find the CZ/Binance pardon market in the database.
 * 
 * Searches Market.question for keyword matches.
 * 
 * Run with:
 *   pnpm -C apps/worker exec tsx src/scripts/findCzPardonMarket.ts
 */

import { config } from 'dotenv';
import { PrismaClient, Prisma } from '@prisma/client';

// Load env vars
config();

const prisma = new PrismaClient();

// Keywords to search for (case-insensitive)
const KEYWORDS = [
  'cz',
  'changpeng',
  'zhao',
  'binance',
  'pardon',
  'pardoned',
  'clemency',
  'commutation',
  'sentence',
  'prison',
  'doj',
];

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Find CZ Pardon Market');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Sanity check: count total markets
  const totalMarkets = await prisma.market.count();
  console.log(`Total markets in database: ${totalMarkets.toLocaleString()}`);
  console.log('');

  if (totalMarkets === 0) {
    console.log('❌ No markets found. Database may be empty.');
    await prisma.$disconnect();
    return;
  }

  console.log('Searching for keywords:', KEYWORDS.join(', '));
  console.log('');

  // Build OR conditions for question field (case-insensitive)
  const questionConditions = KEYWORDS.map((keyword) => ({
    question: {
      contains: keyword,
      mode: Prisma.QueryMode.insensitive,
    },
  }));

  // Search markets matching any keyword in question (without _count)
  const candidateMarkets = await prisma.market.findMany({
    where: {
      OR: questionConditions,
    },
    select: {
      id: true,
      conditionId: true,
      question: true,
      category: true,
      status: true,
      closesAt: true,
      createdAt: true,
      metaJson: true,
    },
    take: 100, // Fetch more, we'll sort by bet count and take top 25
  });

  console.log(`Found ${candidateMarkets.length} candidate markets`);
  console.log('');

  if (candidateMarkets.length === 0) {
    console.log('❌ No markets matched any keywords.');
    console.log('');
    console.log('Showing 10 random markets for reference:');
    
    const sampleMarkets = await prisma.market.findMany({
      select: {
        id: true,
        question: true,
        category: true,
      },
      take: 10,
    });

    for (const m of sampleMarkets) {
      console.log(`  [${m.id}] ${m.question.slice(0, 80)}...`);
    }

    await prisma.$disconnect();
    return;
  }

  // Get bet counts for candidate markets using groupBy
  const candidateIds = candidateMarkets.map((m) => m.id);
  let betCountMap = new Map<string, number>();

  try {
    const betCounts = await prisma.bet.groupBy({
      by: ['marketId'],
      where: { marketId: { in: candidateIds } },
      _count: { _all: true },
    });

    for (const row of betCounts) {
      betCountMap.set(row.marketId, row._count._all);
    }
    console.log(`Retrieved bet counts for ${betCounts.length} markets`);
  } catch (err: any) {
    console.warn(`⚠️ Could not retrieve bet counts: ${err.message}`);
    console.warn('   Continuing without bet counts...');
  }

  // Attach bet counts and sort by count descending
  const marketsWithCounts = candidateMarkets.map((m) => ({
    ...m,
    betCount: betCountMap.get(m.id) || 0,
  }));

  marketsWithCounts.sort((a, b) => b.betCount - a.betCount);

  // Take top 25
  const topMarkets = marketsWithCounts.slice(0, 25);

  console.log('');
  console.log('Top 25 candidate markets (sorted by bet count):');
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('  #  | Bets    | ID                        | Question');
  console.log('───────────────────────────────────────────────────────────────');

  for (let i = 0; i < topMarkets.length; i++) {
    const m = topMarkets[i];
    const num = (i + 1).toString().padStart(3);
    const bets = m.betCount.toLocaleString().padStart(7);
    const id = m.id.padEnd(25);
    const question = m.question.slice(0, 50);
    
    console.log(`  ${num} | ${bets} | ${id} | ${question}...`);
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log('');

  // Print detailed info for top 5
  console.log('Detailed info for top 5:');
  console.log('');

  for (let i = 0; i < Math.min(5, topMarkets.length); i++) {
    const m = topMarkets[i];
    const meta = m.metaJson as Record<string, any> | null;
    const slug = meta?.slug || '';

    console.log(`#${i + 1}`);
    console.log(`  ID:         ${m.id}`);
    console.log(`  ConditionID: ${m.conditionId || 'N/A'}`);
    console.log(`  Question:   ${m.question}`);
    console.log(`  Category:   ${m.category || 'N/A'}`);
    console.log(`  Status:     ${m.status}`);
    console.log(`  Closes At:  ${m.closesAt.toISOString()}`);
    console.log(`  Created At: ${m.createdAt.toISOString()}`);
    console.log(`  Bet Count:  ${m.betCount.toLocaleString()}`);
    if (slug) {
      console.log(`  Slug:       ${slug}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Next step: Pick a MARKET_ID from above and run:');
  console.log('');
  console.log('  $env:MARKET_ID="<id>"');
  console.log('  $env:AFTER="2025-01-19T00:00:00Z"');
  console.log('  $env:BEFORE="2025-01-22T00:00:00Z"');
  console.log('  pnpm -C apps/worker exec tsx src/scripts/exportMarketBetsWindow.ts');
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
