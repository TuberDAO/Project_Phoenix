import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { ALERT_IRS_THRESHOLD } from '@phoenix/shared';

interface AlertsQueryString {
  limit?: string;
  threshold?: string;
  minIrs?: string;
  from?: string;
  to?: string;
  category?: string;
  cursor?: string;
}

export async function alertsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: AlertsQueryString }>('/alerts', async (request) => {
    const {
      limit = '50',
      threshold,
      minIrs,
      from,
      to,
      category,
      cursor,
    } = request.query;
    const take = Math.min(parseInt(limit, 10), 100);
    const irsThreshold = parseInt(minIrs || threshold || String(ALERT_IRS_THRESHOLD), 10);

    const where: any = {
      irsBet: { gte: irsThreshold },
    };

    // Date range (default last 24h)
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    } else {
      where.createdAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
    }

    // Category filter
    if (category) {
      where.market = { category };
    }

    // Cursor pagination
    if (cursor) {
      where.id = { lt: cursor };
    }

    const scores = await prisma.score.findMany({
      where,
      take,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        bet: {
          include: {
            market: true,
          },
        },
        market: true,
      },
    });

    // Load feature snapshots for chips
    const betIds = scores.map(s => s.betId);
    const snapshots = await prisma.featureSnapshot.findMany({
      where: { betId: { in: betIds } },
    });
    const snapshotMap = new Map(snapshots.map(s => [s.betId, s.features as any]));

    const nextCursor = scores.length === take ? scores[scores.length - 1].id : null;

    return {
      data: scores.map((score) => {
        const features = snapshotMap.get(score.betId) || {};
        
        return {
          id: score.id,
          betId: score.betId,
          wallet: score.wallet,
          marketId: score.marketId,
          irsBet: score.irsBet,
          irsWallet: score.irsWallet,
          irsCluster: score.irsCluster,
          createdAt: score.createdAt,
          bet: score.bet,
          market: score.market,
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
        count: scores.length,
        threshold: irsThreshold,
        nextCursor,
        hasMore: scores.length === take,
      },
    };
  });
}

