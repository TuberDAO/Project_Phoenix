#!/usr/bin/env tsx
/**
 * Small seed script for demo mode
 * Creates 10 markets and 50 bets with varied characteristics
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_MARKETS = [
  {
    id: 'demo-001',
    question: 'Will Bitcoin reach $100,000 by end of 2025?',
    category: 'Crypto',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-002',
    question: 'Will AI surpass human performance on coding benchmarks in 2025?',
    category: 'AI',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-003',
    question: 'Will there be a US recession in 2025?',
    category: 'Economics',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-004',
    question: 'Will SpaceX launch Starship to orbit successfully?',
    category: 'Space',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-005',
    question: 'Will OpenAI release GPT-5 before June 2025?',
    category: 'AI',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-006',
    question: 'Will Ethereum transition to proof-of-stake 2.0?',
    category: 'Crypto',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-007',
    question: 'Will unemployment rate exceed 5% in Q1 2025?',
    category: 'Economics',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-008',
    question: 'Will Tesla deliver 2M vehicles in 2025?',
    category: 'Business',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-009',
    question: 'Will quantum computing break RSA-2048 by end of 2025?',
    category: 'Technology',
    status: 'OPEN' as const,
  },
  {
    id: 'demo-010',
    question: 'Will a major social media platform adopt decentralized protocols?',
    category: 'Technology',
    status: 'OPEN' as const,
  },
];

async function main() {
  console.log('🌱 Seeding database with demo data...');

  // Create markets
  console.log('Creating 10 demo markets...');
  for (const marketData of DEMO_MARKETS) {
    await prisma.market.upsert({
      where: { id: marketData.id },
      update: marketData,
      create: {
        ...marketData,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Last 30 days
        closesAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        resolvesAt: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000), // 95 days from now
        metaJson: {
          negrisk: Math.random() < 0.2, // 20% are negrisk
        },
      },
    });
  }

  // Create wallets
  console.log('Creating demo wallets...');
  const wallets = [];
  for (let i = 0; i < 10; i++) {
    const address = `0x${i.toString().padStart(40, '0')}`;
    const wallet = await prisma.wallet.upsert({
      where: { address },
      update: {},
      create: {
        address,
        firstSeenAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000),
        lastSeenAt: new Date(),
        newWalletFlag: i < 3, // First 3 are new wallets
        roi30d: (Math.random() - 0.3) * 0.5, // -30% to +20%
        winRateRolling: 0.3 + Math.random() * 0.4, // 30% to 70%
      },
    });
    wallets.push(wallet);
  }

  // Create 50 bets with varied characteristics
  console.log('Creating 50 demo bets...');
  for (let i = 0; i < 50; i++) {
    const market = DEMO_MARKETS[Math.floor(Math.random() * DEMO_MARKETS.length)];
    const wallet = wallets[Math.floor(Math.random() * wallets.length)];
    const timestamp = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Last 7 days

    const betUsd = Math.random() < 0.2
      ? 5000 + Math.random() * 15000 // 20% large bets ($5k-$20k)
      : 100 + Math.random() * 2000;  // 80% normal bets ($100-$2k)

    const impliedBefore = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
    const deltaProb = (Math.random() - 0.5) * 0.3; // -0.15 to +0.15
    const impliedAfter = Math.max(0.05, Math.min(0.95, impliedBefore + deltaProb));

    await prisma.bet.create({
      data: {
        id: `demo-bet-${i.toString().padStart(3, '0')}`,
        txHash: `0x${i.toString().padStart(64, '0')}`,
        marketId: market.id,
        wallet: wallet.address,
        outcomeId: `token-${market.id}-yes`,
        timestamp,
        blockNumber: 10000000 + i,
        betUsd,
        impliedBefore,
        impliedAfter,
        deltaProb,
        fractionOfPool: betUsd / (50000 + Math.random() * 150000),
        zScoreSize: (betUsd - 5000) / 3000, // Rough z-score
        gasPriorityFlag: Math.random() < 0.3, // 30% high priority
        timeToResolutionSec: Math.floor((Date.now() + 90 * 24 * 60 * 60 * 1000 - timestamp.getTime()) / 1000),
      },
    });
  }

  console.log('✅ Demo seed complete!');
  console.log('   10 markets');
  console.log('   10 wallets');
  console.log('   50 bets');
  console.log('');
  console.log('Run `pnpm dev` to start the application');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

