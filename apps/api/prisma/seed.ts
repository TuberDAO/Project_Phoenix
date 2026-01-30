import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.score.deleteMany();
  await prisma.featureSnapshot.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.newsEvent.deleteMany();
  await prisma.market.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.cluster.deleteMany();

  // Create wallets
  const wallets = [
    {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      firstSeenAt: new Date('2024-01-01'),
      lastSeenAt: new Date(),
      newWalletFlag: false,
      roi30d: 0.15,
      winRateRolling: 0.65,
    },
    {
      address: '0xabcdef1234567890abcdef1234567890abcdef12',
      firstSeenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
      newWalletFlag: true,
      roi30d: 0.85,
      winRateRolling: 0.95,
    },
    {
      address: '0x9876543210fedcba9876543210fedcba98765432',
      firstSeenAt: new Date('2024-06-15'),
      lastSeenAt: new Date(),
      newWalletFlag: false,
      roi30d: -0.05,
      winRateRolling: 0.48,
    },
  ];

  for (const wallet of wallets) {
    await prisma.wallet.create({ data: wallet });
  }

  // Create markets
  const now = new Date();
  const markets = [
    {
      id: 'market-001',
      question: 'Will Bitcoin reach $100k by end of 2024?',
      category: 'Crypto',
      createdAt: new Date('2024-01-15'),
      closesAt: new Date('2024-12-31'),
      status: 'open',
      metaJson: { liquidity: 500000, volume: 250000 },
    },
    {
      id: 'market-002',
      question: 'Will AI regulation pass in the EU before 2025?',
      category: 'Politics',
      createdAt: new Date('2024-09-01'),
      closesAt: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours from now
      status: 'open',
      metaJson: { liquidity: 150000, volume: 80000 },
    },
    {
      id: 'market-003',
      question: 'Will SpaceX land on Mars in 2025?',
      category: 'Science',
      createdAt: new Date('2024-03-10'),
      closesAt: new Date('2025-12-31'),
      status: 'open',
      metaJson: { liquidity: 300000, volume: 120000 },
    },
  ];

  for (const market of markets) {
    await prisma.market.create({ data: market });
  }

  // Create bets with varying risk profiles
  const bets = [
    // High-risk bet: new wallet, large size, close to resolution
    {
      id: 'bet-001',
      txHash: '0xhighrisk001',
      marketId: 'market-002',
      wallet: '0xabcdef1234567890abcdef1234567890abcdef12',
      outcomeId: 'yes',
      timestamp: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
      blockNumber: 12345678,
      betUsd: 25000,
      impliedBefore: 0.45,
      impliedAfter: 0.58,
      deltaProb: 0.13,
      fractionOfPool: 0.167,
      zScoreSize: 4.2,
      gasPriorityFlag: true,
      timeToResolutionSec: 11 * 3600 + 30 * 60, // 11.5 hours
    },
    // Medium-risk bet
    {
      id: 'bet-002',
      txHash: '0xmedrisk002',
      marketId: 'market-001',
      wallet: '0x1234567890abcdef1234567890abcdef12345678',
      outcomeId: 'yes',
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      blockNumber: 12345600,
      betUsd: 8000,
      impliedBefore: 0.62,
      impliedAfter: 0.68,
      deltaProb: 0.06,
      fractionOfPool: 0.032,
      zScoreSize: 1.8,
      gasPriorityFlag: false,
      timeToResolutionSec: 45 * 24 * 3600, // 45 days
    },
    // Low-risk bet
    {
      id: 'bet-003',
      txHash: '0xlowrisk003',
      marketId: 'market-003',
      wallet: '0x9876543210fedcba9876543210fedcba98765432',
      outcomeId: 'no',
      timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
      blockNumber: 12340000,
      betUsd: 500,
      impliedBefore: 0.25,
      impliedAfter: 0.26,
      deltaProb: 0.01,
      fractionOfPool: 0.0017,
      zScoreSize: 0.3,
      gasPriorityFlag: false,
      timeToResolutionSec: 400 * 24 * 3600, // 400+ days
    },
    // Another high-risk bet
    {
      id: 'bet-004',
      txHash: '0xhighrisk004',
      marketId: 'market-002',
      wallet: '0xabcdef1234567890abcdef1234567890abcdef12',
      outcomeId: 'yes',
      timestamp: new Date(now.getTime() - 45 * 60 * 1000), // 45 min ago
      blockNumber: 12345680,
      betUsd: 18000,
      impliedBefore: 0.58,
      impliedAfter: 0.66,
      deltaProb: 0.08,
      fractionOfPool: 0.12,
      zScoreSize: 3.5,
      gasPriorityFlag: true,
      timeToResolutionSec: 11 * 3600 + 15 * 60, // 11.25 hours
    },
  ];

  for (const bet of bets) {
    await prisma.bet.create({ data: bet });
  }

  // Create some news events
  await prisma.newsEvent.createMany({
    data: [
      {
        marketId: 'market-002',
        source: 'Reuters',
        headline: 'EU Parliament advances AI regulation framework',
        url: 'https://example.com/news/1',
        timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        volumeScore: 0.85,
        matchScore: 0.92,
      },
      {
        marketId: 'market-001',
        source: 'CoinDesk',
        headline: 'Bitcoin institutional adoption accelerates',
        url: 'https://example.com/news/2',
        timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        volumeScore: 0.72,
        matchScore: 0.88,
      },
    ],
  });

  // Create initial scores for high-risk bets
  await prisma.score.createMany({
    data: [
      {
        betId: 'bet-001',
        wallet: '0xabcdef1234567890abcdef1234567890abcdef12',
        marketId: 'market-002',
        irsBet: 87,
        irsWallet: 75,
        irsCluster: 0,
      },
      {
        betId: 'bet-004',
        wallet: '0xabcdef1234567890abcdef1234567890abcdef12',
        marketId: 'market-002',
        irsBet: 82,
        irsWallet: 75,
        irsCluster: 0,
      },
      {
        betId: 'bet-002',
        wallet: '0x1234567890abcdef1234567890abcdef12345678',
        marketId: 'market-001',
        irsBet: 45,
        irsWallet: 35,
        irsCluster: 0,
      },
      {
        betId: 'bet-003',
        wallet: '0x9876543210fedcba9876543210fedcba98765432',
        marketId: 'market-003',
        irsBet: 12,
        irsWallet: 18,
        irsCluster: 0,
      },
    ],
  });

  console.log('✅ Seeding completed!');
  console.log(`   - ${wallets.length} wallets`);
  console.log(`   - ${markets.length} markets`);
  console.log(`   - ${bets.length} bets`);
  console.log('   - 2 news events');
  console.log('   - 4 scores');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

