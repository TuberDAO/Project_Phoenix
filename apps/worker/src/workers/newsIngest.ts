import { Worker } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type NewsIngestJob } from '../queues/definitions.js';
import { ingestNewsForMarkets } from '../jobs/newsIngest.js';

export function createNewsIngestWorker() {
  const worker = new Worker<NewsIngestJob>(
    QUEUE_NAMES.NEWS_INGEST,
    async (job) => {
      console.log(`[NewsIngestWorker] Processing job ${job.id}`);

      try {
        await ingestNewsForMarkets();
        return { success: true };
      } catch (error: any) {
        console.error('[NewsIngestWorker] Job failed:', error.message);
        throw error;
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 1, // Only one ingestion at a time
    }
  );

  worker.on('completed', (job) => {
    console.log(`[NewsIngestWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[NewsIngestWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
