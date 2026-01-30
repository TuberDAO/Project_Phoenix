import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function walletsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { address: string } }>('/wallets/:address', async (request, reply) => {
    const { address } = request.params;

    const wallet = await prisma.wallet.findUnique({
      where: { address: address.toLowerCase() },
    });

    if (!wallet) {
      return reply.status(404).send({ error: 'Wallet not found' });
    }

    // Get recent bets
    const recentBets = await prisma.bet.findMany({
      where: { wallet: address.toLowerCase() },
      take: 20,
      orderBy: { timestamp: 'desc' },
      include: {
        market: true,
      },
    });

    // Get recent scores
    const recentScores = await prisma.score.findMany({
      where: { wallet: address.toLowerCase() },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        market: true,
      },
    });

    return {
      wallet,
      recentBets,
      recentScores,
    };
  });

  /**
   * GET /wallets/:address/scores
   * Get score timeline for a wallet
   */
  fastify.get<{
    Params: { address: string };
    Querystring: { from?: string; to?: string; limit?: string };
  }>('/wallets/:address/scores', async (request, reply) => {
    const { address } = request.params;
    const { from, to, limit = '100' } = request.query;

    const where: any = { wallet: address.toLowerCase() };

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const scores = await prisma.score.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit, 10),
    });

    return {
      wallet: address,
      scores: scores.map(s => ({
        timestamp: s.createdAt.toISOString(),
        irsBet: s.irsBet,
        irsWallet: s.irsWallet,
        irsCluster: s.irsCluster,
      })),
    };
  });
}

