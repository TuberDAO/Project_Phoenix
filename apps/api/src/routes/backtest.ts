import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runBacktest, type BacktestParams } from '../backtest/runner.js';
import { parseCsv } from '../backtest/csv.js';

const BacktestRequestSchema = z.object({
  from: z.string().transform(s => new Date(s)),
  to: z.string().transform(s => new Date(s)),
  minIrs: z.number().optional(),
  label: z.string().optional(),
  weightsPreset: z.enum(['default', 'strict', 'balanced', 'lenient']).optional(),
});

let lastBacktestResult: any = null;

export async function backtestRoutes(fastify: FastifyInstance) {
  /**
   * POST /backtest/run
   * Run backtest on date range or CSV upload
   */
  fastify.post('/backtest/run', async (request, reply) => {
    try {
      // Check if multipart (CSV upload)
      const contentType = request.headers['content-type'] || '';
      
      if (contentType.includes('multipart/form-data')) {
        // TODO: Handle CSV upload with @fastify/multipart
        // For now, return not implemented
        return reply.status(501).send({ error: 'CSV upload not yet implemented' });
      }
      
      // Parse date range backtest
      const params = BacktestRequestSchema.parse(request.body);
      
      fastify.log.info('Starting backtest:', params);
      
      // Run backtest
      const result = await runBacktest(params as BacktestParams);
      
      // Store for /backtest/last
      lastBacktestResult = {
        ...result,
        params,
        ranAt: new Date().toISOString(),
      };
      
      return {
        success: true,
        metrics: result,
        params,
      };
    } catch (error: any) {
      fastify.log.error('Backtest failed:', error);
      
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid request', details: error.errors });
      }
      
      return reply.status(500).send({ error: error.message || 'Backtest failed' });
    }
  });

  /**
   * GET /backtest/last
   * Get last backtest result
   */
  fastify.get('/backtest/last', async (request, reply) => {
    if (!lastBacktestResult) {
      return reply.status(404).send({ error: 'No backtest has been run yet' });
    }
    
    return lastBacktestResult;
  });
}

