import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES, featureComputeQueue, type IngestOnchainJob } from '../queues/definitions.js';

export function createIngestOnchainWorker() {
  const worker = new Worker<IngestOnchainJob>(
    QUEUE_NAMES.INGEST_ONCHAIN,
    async (job) => {
      const { fromBlock, toBlock } = job.data;

      console.log(`[IngestOnchain] Processing blocks ${fromBlock}-${toBlock}`);

      // Mock: In production, this would scan blockchain events
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Simulate finding on-chain bets
      const mockBetIds = ['bet-003'];
      
      for (const betId of mockBetIds) {
        await featureComputeQueue.add('compute-features', { betId });
      }

      console.log(`[IngestOnchain] Found ${mockBetIds.length} on-chain bets`);

      return { processed: mockBetIds.length, blocks: toBlock - fromBlock };
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[IngestOnchain] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[IngestOnchain] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

