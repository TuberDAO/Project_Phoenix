import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';

export const QUEUE_NAMES = {
  INGEST_POLYMARKET: 'ingest-polymarket',
  INGEST_ONCHAIN: 'ingest-onchain',
  FEATURE_COMPUTE: 'feature-compute',
  SCORING: 'scoring',
  NEWS_INGEST: 'news-ingest',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Queue instances
export const ingestPolymarketQueue = new Queue(QUEUE_NAMES.INGEST_POLYMARKET, {
  connection: createRedisConnection(),
});

export const ingestOnchainQueue = new Queue(QUEUE_NAMES.INGEST_ONCHAIN, {
  connection: createRedisConnection(),
});

export const featureComputeQueue = new Queue(QUEUE_NAMES.FEATURE_COMPUTE, {
  connection: createRedisConnection(),
});

export const scoringQueue = new Queue(QUEUE_NAMES.SCORING, {
  connection: createRedisConnection(),
});

export const newsIngestQueue = new Queue(QUEUE_NAMES.NEWS_INGEST, {
  connection: createRedisConnection(),
});

// Job data types
export interface IngestPolymarketJob {
  marketId?: string;
  fromTimestamp?: number;
}

export interface IngestOnchainJob {
  fromBlock: number;
  toBlock: number;
}

export interface FeatureComputeJob {
  betId: string;
}

export interface ScoringJob {
  betId: string;
}

export interface NewsIngestJob {
  marketId?: string;
  query?: string;
}

