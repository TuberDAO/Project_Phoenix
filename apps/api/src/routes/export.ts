import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { toCsv } from '../backtest/csv.js';

const EXPORT_TOKEN = process.env.EXPORT_TOKEN;

/**
 * Check export authorization
 */
function checkAuth(request: any, reply: any): boolean {
  if (!EXPORT_TOKEN) return true; // No auth required
  
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Authorization required' });
    return false;
  }
  
  const token = authHeader.substring(7);
  if (token !== EXPORT_TOKEN) {
    reply.status(403).send({ error: 'Invalid token' });
    return false;
  }
  
  return true;
}

export async function exportRoutes(fastify: FastifyInstance) {
  /**
   * GET /export/alerts.csv
   * Export alerts as CSV
   */
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      minIrs?: string;
    };
  }>('/export/alerts.csv', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    
    const { from, to, minIrs } = request.query;
    
    try {
      const where: any = {};
      
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }
      
      if (minIrs) {
        where.irsBet = { gte: parseInt(minIrs, 10) };
      } else {
        where.irsBet = { gte: 75 }; // Default threshold
      }
      
      const scores = await prisma.score.findMany({
        where,
        include: {
          bet: {
            include: {
              market: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000, // Limit for performance
      });
      
      // Transform to flat structure
      const rows = scores.map(score => ({
        timestamp: score.createdAt.toISOString(),
        betId: score.betId,
        wallet: score.wallet,
        marketId: score.marketId,
        marketQuestion: score.bet?.market?.question || '',
        betUsd: score.bet?.betUsd || 0,
        irsBet: score.irsBet,
        irsWallet: score.irsWallet,
        irsCluster: score.irsCluster,
      }));
      
      const csv = toCsv(rows);
      
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="alerts-${Date.now()}.csv"`);
      return csv;
    } catch (error: any) {
      fastify.log.error('Export alerts failed:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * GET /export/bets.csv
   * Export bets for a market
   */
  fastify.get<{
    Querystring: {
      marketId?: string;
      from?: string;
      to?: string;
    };
  }>('/export/bets.csv', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    
    const { marketId, from, to } = request.query;
    
    try {
      const where: any = {};
      
      if (marketId) where.marketId = marketId;
      
      if (from || to) {
        where.timestamp = {};
        if (from) where.timestamp.gte = new Date(from);
        if (to) where.timestamp.lte = new Date(to);
      }
      
      const bets = await prisma.bet.findMany({
        where,
        include: {
          market: true,
        },
        orderBy: { timestamp: 'desc' },
        take: 1000,
      });
      
      const rows = bets.map(bet => ({
        betId: bet.id,
        txHash: bet.txHash,
        marketId: bet.marketId,
        marketQuestion: bet.market?.question || '',
        wallet: bet.wallet,
        timestamp: bet.timestamp.toISOString(),
        betUsd: Number(bet.betUsd),
        impliedBefore: bet.impliedBefore,
        impliedAfter: bet.impliedAfter,
        deltaProb: bet.deltaProb,
        fractionOfPool: bet.fractionOfPool,
      }));
      
      const csv = toCsv(rows);
      
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="bets-${Date.now()}.csv"`);
      return csv;
    } catch (error: any) {
      fastify.log.error('Export bets failed:', error);
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /export/report.pdf
   * Generate PDF report (returns HTML for print-to-PDF)
   */
  fastify.post<{
    Body: {
      from?: string;
      to?: string;
      minIrs?: number;
    };
  }>('/export/report.pdf', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    
    const { from, to, minIrs = 75 } = request.body;
    
    try {
      // Gather summary data
      const where: any = { irsBet: { gte: minIrs } };
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
      }
      
      const scores = await prisma.score.findMany({
        where,
        include: {
          bet: {
            include: {
              market: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      
      // Generate simple HTML report
      const html = generateReportHtml({
        from: from || 'N/A',
        to: to || 'N/A',
        minIrs,
        totalAlerts: scores.length,
        scores,
      });
      
      reply.header('Content-Type', 'text/html');
      return html;
    } catch (error: any) {
      fastify.log.error('Export report failed:', error);
      return reply.status(500).send({ error: error.message });
    }
  });
}

function generateReportHtml(data: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Project Phoenix - Alert Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .high-risk { background-color: #fee; }
    .critical { background-color: #fcc; }
  </style>
</head>
<body>
  <h1>🔥 Project Phoenix - Alert Report</h1>
  <p><strong>Date Range:</strong> ${data.from} to ${data.to}</p>
  <p><strong>Min IRS:</strong> ${data.minIrs}</p>
  <p><strong>Total Alerts:</strong> ${data.totalAlerts}</p>
  
  <h2>High-Risk Bets</h2>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Market</th>
        <th>Wallet</th>
        <th>Bet USD</th>
        <th>IRS</th>
      </tr>
    </thead>
    <tbody>
      ${data.scores.map((s: any) => `
        <tr class="${s.irsBet >= 80 ? 'critical' : 'high-risk'}">
          <td>${new Date(s.createdAt).toLocaleString()}</td>
          <td>${s.bet?.market?.question || 'N/A'}</td>
          <td>${s.wallet.substring(0, 10)}...</td>
          <td>$${s.bet?.betUsd || 0}</td>
          <td><strong>${s.irsBet}</strong></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <p style="margin-top: 40px; color: #666; font-size: 12px;">
    Generated by Project Phoenix on ${new Date().toISOString()}
  </p>
</body>
</html>
  `.trim();
}

