import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type IngestPolymarketJob } from '../queues/definitions.js';
import { ingestPolymarketData } from '../jobs/ingestPolymarket.js';

export function createIngestPolymarketWorker() {
  const worker = new Worker<IngestPolymarketJob>(
    QUEUE_NAMES.INGEST_POLYMARKET,
    async (job) => {
      console.log(`[IngestPolymarket] Processing job ${job.id}`);
      
      try {
        await ingestPolymarketData();
        return { success: true };
      } catch (error: any) {
        console.error('[IngestPolymarket] Job failed:', error.message);
        throw error;
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 1, // Only one ingestion at a time
    }
  );

  worker.on('completed', (job) => {
    console.log(`[IngestPolymarket] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[IngestPolymarket] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
