import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { healthRoutes } from './routes/health.js';
import { marketsRoutes } from './routes/markets.js';
import { walletsRoutes } from './routes/wallets.js';
import { alertsRoutes } from './routes/alerts.js';
import { scoreRoutes } from './routes/score.js';
import { authRoutes } from './routes/auth.js';
import { tradeRoutes } from './routes/trade.js';
import { configRoutes } from './routes/config.js';
import { backtestRoutes } from './routes/backtest.js';
import { exportRoutes } from './routes/export.js';
import { auditRoutes } from './routes/audit.js';
import { logAuthInit } from './services/polymarketAuth.js';
import { initializeWeights } from './scoring/weights.js';
import { prisma } from './lib/prisma.js';

// Load environment variables
config();

const PORT = process.env.API_PORT ? parseInt(process.env.API_PORT) : 4000;
const HOST = process.env.API_HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register CORS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
});

// Initialize weights system
await initializeWeights(prisma);

// Log auth service init
logAuthInit();

// Register routes
await fastify.register(healthRoutes);
await fastify.register(marketsRoutes);
await fastify.register(walletsRoutes);
await fastify.register(alertsRoutes);
await fastify.register(scoreRoutes);
await fastify.register(authRoutes);
await fastify.register(tradeRoutes);
await fastify.register(configRoutes);
await fastify.register(backtestRoutes);
await fastify.register(exportRoutes);
await fastify.register(auditRoutes);

// Start server
try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`🚀 API server running on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down API server...');
  await fastify.close();
  process.exit(0);
});

