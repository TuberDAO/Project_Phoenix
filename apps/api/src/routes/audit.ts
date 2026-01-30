import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';

export async function auditRoutes(fastify: FastifyInstance) {
  /**
   * GET /audit
   * Get audit logs with filters
   */
  fastify.get<{
    Querystring: {
      type?: string;
      refId?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
    };
  }>('/audit', async (request) => {
    const { type, refId, from, to, cursor, limit = '50' } = request.query;
    
    const where: any = {};
    
    if (type) where.type = type;
    if (refId) where.refId = refId;
    
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    
    if (cursor) {
      where.id = { lt: cursor };
    }
    
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    });
    
    const nextCursor = logs.length > 0 ? logs[logs.length - 1].id : null;
    
    return {
      logs,
      nextCursor,
      hasMore: logs.length === parseInt(limit, 10),
    };
  });

  /**
   * GET /audit/evidence/:betId
   * Get evidence snapshot for a bet
   */
  fastify.get<{
    Params: { betId: string };
  }>('/audit/evidence/:betId', async (request, reply) => {
    const { betId } = request.params;
    
    const evidence = await prisma.evidence.findUnique({
      where: { betId },
    });
    
    if (!evidence) {
      return reply.status(404).send({ error: 'Evidence not found' });
    }
    
    return evidence;
  });
}

