import { config } from 'dotenv';
import { createIngestPolymarketWorker } from './workers/ingestPolymarket.js';
import { createIngestOnchainWorker } from './workers/ingestOnchain.js';
import { createFeatureComputeWorker } from './workers/featureCompute.js';
import { createScoringWorker } from './workers/scoring.js';
import { createNewsIngestWorker } from './workers/newsIngest.js';
import { logLimiterInit } from './rate/limiters.js';
import { logClientInit } from './services/polymarketClient.js';
import { logUmaInit } from './services/umaClient.js';
import { logNewsInit } from './services/newsClient.js';
import { logTwitterInit } from './services/twitterClient.js';
import { initWebSocket } from './services/polymarketWS.js';
import { initChainClient, logChainClientInit } from './services/chainClient.js';
import { ingestPolymarketData } from './jobs/ingestPolymarket.js';
import { ingestNewsForMarkets } from './jobs/newsIngest.js';

// Load environment variables
config();

console.log('🔧 Starting Phoenix workers...');
console.log('');

// Initialize rate limiters and clients
logLimiterInit();
console.log('');
logClientInit();
console.log('');
logUmaInit();
console.log('');
logNewsInit();
console.log('');
logTwitterInit();
console.log('');

// Initialize chain enrichment (for blockNumber + gasPriorityFlag)
initChainClient();
logChainClientInit();
console.log('');

// Create all workers
const workers = [
  createIngestPolymarketWorker(),
  createIngestOnchainWorker(),
  createFeatureComputeWorker(),
  createScoringWorker(),
  createNewsIngestWorker(),
];

console.log(`✅ ${workers.length} workers started and listening for jobs`);
console.log('');

// Initialize WebSocket connection
initWebSocket();
console.log('');

// Start periodic ingestion
const INGEST_INTERVAL = parseInt(process.env.INGEST_INTERVAL_SEC || '15', 10) * 1000;
console.log(`⏰ Starting periodic ingestion (every ${INGEST_INTERVAL/1000}s)`);

let ingestTimer: NodeJS.Timer | null = null;

async function runPeriodicIngestion() {
  try {
    await ingestPolymarketData();
  } catch (error) {
    console.error('[Ingest] Periodic ingestion failed:', error);
  }
  
  // Schedule next run
  ingestTimer = setTimeout(runPeriodicIngestion, INGEST_INTERVAL);
}

// Start first ingestion after 5 seconds
setTimeout(runPeriodicIngestion, 5000);

// Start periodic news ingestion
const NEWS_INGEST_INTERVAL = parseInt(process.env.NEWS_INGEST_INTERVAL_SEC || '60', 10) * 1000;
console.log(`⏰ Starting news ingestion (every ${NEWS_INGEST_INTERVAL/1000}s)`);

let newsTimer: NodeJS.Timer | null = null;

async function runPeriodicNewsIngestion() {
  try {
    await ingestNewsForMarkets();
  } catch (error) {
    console.error('[News] Periodic ingestion failed:', error);
  }
  
  // Schedule next run
  newsTimer = setTimeout(runPeriodicNewsIngestion, NEWS_INGEST_INTERVAL);
}

// Start first news ingestion after 10 seconds
setTimeout(runPeriodicNewsIngestion, 10000);

console.log('✅ All systems initialized');

// Graceful shutdown
const shutdown = async () => {
  console.log('\n👋 Shutting down workers...');
  
  // Stop ingestion timers
  if (ingestTimer) {
    clearTimeout(ingestTimer);
  }
  if (newsTimer) {
    clearTimeout(newsTimer);
  }
  
  // Close WebSocket
  const { disconnect } = await import('./services/polymarketWS.js');
  disconnect();
  
  // Close all workers
  await Promise.all(workers.map((worker) => worker.close()));
  
  console.log('✅ All workers closed');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep process alive
process.stdin.resume();

