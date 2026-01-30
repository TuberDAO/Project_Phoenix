import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES, scoringQueue, type FeatureComputeJob } from '../queues/definitions.js';
import { computeFeatureVector } from '../../../api/src/features/computeFeatureVector.js';
import * as UmaClient from '../services/umaClient.js';

const prisma = new PrismaClient();

export function createFeatureComputeWorker() {
  const worker = new Worker<FeatureComputeJob>(
    QUEUE_NAMES.FEATURE_COMPUTE,
    async (job) => {
      const { betId, books } = job.data as any;

      console.log(`[FeatureCompute] Computing features for bet ${betId}`);

      try {
        // Load bet from database
        const bet = await prisma.bet.findUnique({
          where: { id: betId },
          include: { market: true },
        });

        if (!bet) {
          console.warn(`[FeatureCompute] Bet ${betId} not found in database`);
          return { betId, skipped: true };
        }

        // Load wallet
        const wallet = await prisma.wallet.findUnique({
          where: { address: bet.wallet },
        });

        // Get oracle proximity if UMA is configured
        let oracleProximity = 999999;
        if (UmaClient.isUmaConfigured()) {
          try {
            oracleProximity = await UmaClient.getOracleProximity(
              bet.marketId,
              Math.floor(bet.timestamp.getTime() / 1000)
            );
          } catch (error) {
            console.warn(`[FeatureCompute] Failed to get oracle proximity:`, error);
          }
        }

        // Compute features with context
        const features = computeFeatureVector(
          bet,
          bet.market,
          wallet,
          {
            books: books || {},
            oracleProximity,
          }
        );

        // Persist FeatureSnapshot
        await prisma.featureSnapshot.upsert({
          where: { betId },
          update: {
            features: features as any,
          },
          create: {
            betId,
            wallet: bet.wallet,
            marketId: bet.marketId,
            features: features as any,
          },
        });

        console.log(
          `[FeatureCompute] Features computed for bet ${betId}: ` +
          `betUsd=$${features.betUsd.toFixed(2)}, ` +
          `fracPool=${(features.fractionOfPool * 100).toFixed(1)}%, ` +
          `zscore=${features.zScoreBetSize.toFixed(1)}`
        );

        // Enqueue scoring
        await scoringQueue.add('score-bet', { betId });

        return { betId, features };
      } catch (error: any) {
        console.error(`[FeatureCompute] Error processing bet ${betId}:`, error.message);
        throw error;
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[FeatureCompute] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[FeatureCompute] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
