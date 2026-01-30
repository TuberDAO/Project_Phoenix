import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

interface MarketsQueryString {
  status?: string;
  limit?: string;
  cursor?: string;
}

export async function marketsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: MarketsQueryString }>('/markets', async (request) => {
    const { status = 'open', limit = '20', cursor } = request.query;
    const take = Math.min(parseInt(limit, 10), 100);

    const where = status ? { status } : {};

    const markets = await prisma.market.findMany({
      where,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            bets: true,
            newsEvents: true,
          },
        },
      },
    });

    return {
      data: markets,
      meta: {
        count: markets.length,
        nextCursor: markets.length === take ? markets[markets.length - 1].id : null,
      },
    };
  });

  fastify.get<{ Params: { id: string } }>('/markets/:id', async (request, reply) => {
    const { id } = request.params;

    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        bets: {
          take: 10,
          orderBy: { timestamp: 'desc' },
          include: {
            score: true,
          },
        },
        newsEvents: {
          take: 5,
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!market) {
      return reply.status(404).send({ error: 'Market not found' });
    }

    return market;
  });

  /**
   * GET /markets/:id/bets
   * Get bets for a market with filters
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; limit?: string };
  }>('/markets/:id/bets', async (request) => {
    const { id } = request.params;
    const { from, to, limit = '50' } = request.query;
    const take = Math.min(parseInt(limit, 10), 100);

    const where: any = { marketId: id };

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const bets = await prisma.bet.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take,
      include: {
        score: true,
      },
    });

    // Load feature snapshots for chips
    const betIds = bets.map(b => b.id);
    const snapshots = await prisma.featureSnapshot.findMany({
      where: { betId: { in: betIds } },
    });
    const snapshotMap = new Map(snapshots.map(s => [s.betId, s.features as any]));

    return {
      marketId: id,
      data: bets.map(bet => {
        const features = snapshotMap.get(bet.id) || {};

        return {
          id: bet.id,
          wallet: bet.wallet,
          timestamp: bet.timestamp,
          betUsd: Number(bet.betUsd),
          impliedBefore: bet.impliedBefore,
          impliedAfter: bet.impliedAfter,
          deltaProb: bet.deltaProb,
          fractionOfPool: bet.fractionOfPool,
          irs: bet.score?.irsBet,
          chips: {
            marketable: features.isMarketableOrder || false,
            lowLiquidity: features.lowLiquiditySideFlag || false,
            oracleNear: (features.oracleProximitySec || 999999) < 3600,
            finalHour: features.isFinalHourBeforeClose || false,
            chatterLull: features.chatterLullFlag || false,
            burst: (features.burstRatio1m || 0) > 0.4,
          },
        };
      }),
      meta: {
        count: bets.length,
      },
    };
  });
}

