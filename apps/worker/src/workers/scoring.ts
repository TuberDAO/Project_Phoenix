import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { createRedisConnection } from '../lib/redis.js';
import { QUEUE_NAMES, type ScoringJob } from '../queues/definitions.js';
import { computeInsiderScore } from '../../../api/src/scoring/insiderScore.js';
import type { PreResolutionFeatures } from '@phoenix/shared';

const prisma = new PrismaClient();

const ALERT_THRESHOLD = parseInt(process.env.ALERT_IRS_THRESHOLD || '75', 10);
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL || '';

export function createScoringWorker() {
  const worker = new Worker<ScoringJob>(
    QUEUE_NAMES.SCORING,
    async (job) => {
      const { betId } = job.data;

      console.log(`[Scoring] Computing IRS for bet ${betId}`);

      try {
        // Load feature snapshot
        const snapshot = await prisma.featureSnapshot.findUnique({
          where: { betId },
          include: {
            bet: {
              include: { market: true },
            },
          },
        });

        if (!snapshot) {
          console.warn(`[Scoring] No feature snapshot for bet ${betId}`);
          return { betId, skipped: true };
        }

        // Compute IRS
        const features = snapshot.features as PreResolutionFeatures;
        const score = await computeInsiderScore(features);

        // Persist Score
        await prisma.score.upsert({
          where: { betId },
          update: {
            irsBet: score.irsBet,
            irsWallet: 0, // placeholder
            irsCluster: 0, // placeholder
          },
          create: {
            betId,
            wallet: snapshot.wallet,
            marketId: snapshot.marketId,
            irsBet: score.irsBet,
            irsWallet: 0,
            irsCluster: 0,
          },
        });

        console.log(
          `[Scoring] IRS computed for bet ${betId}: ${score.irsBet} ` +
          `(stake=${score.components.stakeImpact.toFixed(2)}, ` +
          `temporal=${score.components.temporal.toFixed(2)}, ` +
          `history=${score.components.history.toFixed(2)})`
        );

        // Log scoring to audit
        await prisma.auditLog.create({
          data: {
            type: 'scoring_computed',
            refId: betId,
            payload: {
              irs: score.irsBet,
              components: score.components,
            },
          },
        });
        
        // Trigger alert if high risk
        if (score.irsBet >= ALERT_THRESHOLD) {
          console.log(`🚨 [Scoring] HIGH RISK ALERT: bet ${betId} (IRS: ${score.irsBet})`);
          
          // Log threshold crossing
          await prisma.auditLog.create({
            data: {
              type: 'threshold_crossing',
              refId: betId,
              payload: {
                irs: score.irsBet,
                threshold: ALERT_THRESHOLD,
                marketId: snapshot.marketId,
                wallet: snapshot.wallet,
              },
            },
          });
          
          // Create evidence snapshot
          const chips = {
            marketable: features.isMarketableOrder,
            lowLiquidity: features.lowLiquiditySideFlag,
            oracleNear: features.oracleProximitySec < 3600,
            finalHour: features.isFinalHourBeforeClose,
            chatterLull: features.chatterLullFlag,
            burst: features.burstRatio1m > 0.4,
          };
          
          await prisma.evidence.upsert({
            where: { betId },
            update: {
              irs: score.irsBet,
              components: score.components as any,
              chips: chips as any,
            },
            create: {
              betId,
              wallet: snapshot.wallet,
              marketId: snapshot.marketId,
              irs: score.irsBet,
              components: score.components as any,
              chips: chips as any,
            },
          });
          
          if (SLACK_WEBHOOK) {
            try {
              await sendSlackAlert(snapshot.bet, score.irsBet);
            } catch (slackError) {
              console.error('[Scoring] Failed to send Slack alert:', slackError);
            }
          }
        }

        return { betId, irs: score.irsBet };
      } catch (error: any) {
        console.error(`[Scoring] Error processing bet ${betId}:`, error.message);
        throw error;
      }
    },
    {
      connection: createRedisConnection(),
      concurrency: 10,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Scoring] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Scoring] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

/**
 * Send Slack alert for high-risk bet
 */
async function sendSlackAlert(bet: any, irs: number) {
  const message = {
    text: `🚨 *High-Risk Bet Detected* (IRS: ${irs})`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *High-Risk Bet Detected*\n*IRS:* ${irs}\n*Market:* ${bet.market.question}\n*Amount:* $${Number(bet.betUsd).toFixed(2)}\n*Wallet:* \`${bet.wallet}\``,
        },
      },
    ],
  };

  const response = await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status}`);
  }
}
