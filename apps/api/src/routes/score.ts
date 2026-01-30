import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { computeFeatureVector } from '../features/computeFeatureVector.js';
import { computeInsiderScore } from '../scoring/insiderScore.js';
import type { ScoreBetRequest, ScoreBetResponse } from '@phoenix/shared';

export async function scoreRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: ScoreBetRequest }>('/score/bet', async (request, reply) => {
    const { betId, bet: betData } = request.body;

    let bet;
    let market;
    let wallet;

    if (betId) {
      // Load from database
      bet = await prisma.bet.findUnique({
        where: { id: betId },
        include: { market: true },
      });

      if (!bet) {
        return reply.status(404).send({ error: 'Bet not found' });
      }

      market = bet.market;
      wallet = await prisma.wallet.findUnique({
        where: { address: bet.wallet },
      });
    } else if (betData) {
      // Use provided bet data
      bet = {
        ...betData,
        timestamp: typeof betData.timestamp === 'string' ? new Date(betData.timestamp) : betData.timestamp,
      };

      market = await prisma.market.findUnique({
        where: { id: betData.marketId },
      });

      if (!market) {
        return reply.status(404).send({ error: 'Market not found' });
      }

      wallet = await prisma.wallet.findUnique({
        where: { address: betData.wallet },
      });
    } else {
      return reply.status(400).send({ error: 'Either betId or bet must be provided' });
    }

    // Build context for feature computation
    // In production, this would fetch live book snapshots
    const context = {
      books: {}, // Book snapshots would be fetched here
      oracleProximity: 999999, // Would query UMA if configured
    };

    // Compute features
    const features = computeFeatureVector(bet, market, wallet, context);

    // Compute score
    const score = await computeInsiderScore(features);

    // Persist to database if betId was provided (real bet)
    if (betId) {
      // Upsert FeatureSnapshot
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

      // Upsert Score
      await prisma.score.upsert({
        where: { betId },
        update: {
          irsBet: score.irsBet,
          irsWallet: 0, // placeholder
          irsCluster: 0, // placeholder
        },
        create: {
          betId,
          wallet: bet.wallet,
          marketId: bet.marketId,
          irsBet: score.irsBet,
          irsWallet: 0,
          irsCluster: 0,
        },
      });
    }

    const response: ScoreBetResponse = {
      features,
      score,
    };

    return response;
  });
}

