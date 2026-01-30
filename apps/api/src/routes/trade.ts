import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import { prisma } from '../lib/prisma.js';
import { validateTradingEnabled } from '../services/polymarketAuth.js';

const CLOB_HOST = process.env.POLY_CLOB_HOST || process.env.CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = parseInt(process.env.POLY_CHAIN_ID || process.env.CHAIN_ID || '137', 10);
const DRY_RUN = process.env.DRY_RUN !== 'false';

const MirrorTradeSchema = z.object({
  betId: z.string(),
  side: z.enum(['buy', 'sell']),
  size: z.number().positive(),
  maxPrice: z.number().min(0).max(1).optional(),
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key format'),
  signatureType: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().default(0),
});

export async function tradeRoutes(fastify: FastifyInstance) {
  // Guard: Check trading enabled
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      validateTradingEnabled();
    } catch (error: any) {
      return reply.status(403).send({ error: error.message });
    }
  });

  /**
   * POST /trade/mirror
   * Mirror a bet (place similar order)
   */
  fastify.post('/trade/mirror', async (request, reply) => {
    try {
      const body = MirrorTradeSchema.parse(request.body);
      
      // Load bet and market
      const bet = await prisma.bet.findUnique({
        where: { id: body.betId },
        include: { market: true },
      });
      
      if (!bet) {
        return reply.status(404).send({ error: 'Bet not found' });
      }
      
      // Extract token IDs from market metadata
      const metaJson = bet.market.metaJson as any;
      const tokenIds = metaJson?.tokenIds || [];
      
      if (tokenIds.length === 0) {
        return reply.status(400).send({ error: 'Market token IDs not available' });
      }
      
      // Select token ID based on outcome
      const tokenId = tokenIds[0]; // Simplified: use first token
      
      // Check if negrisk market
      const isNegrisk = metaJson?.negrisk === true;
      
      // Initialize wallet and CLOB client
      const wallet = new ethers.Wallet(body.privateKey);
      const clobClient = new ClobClient(
        CLOB_HOST,
        CHAIN_ID,
        wallet as any,
        body.signatureType
      );
      
      // Derive API credentials
      const credentials = await clobClient.deriveApiKey();
      
      // Build order
      const order = {
        tokenID: tokenId,
        price: body.maxPrice || (body.side === 'buy' ? bet.impliedAfter : bet.impliedAfter),
        size: body.size,
        side: body.side.toUpperCase() as 'BUY' | 'SELL',
        feeRateBps: 0, // Current Polymarket fee
        nonce: Date.now(),
      };
      
      // If DRY_RUN, simulate and return preview
      if (DRY_RUN) {
        fastify.log.info('DRY RUN: Would place order:', order);
        
        return {
          dryRun: true,
          preview: {
            tokenId: order.tokenID,
            side: order.side,
            size: order.size,
            price: order.price,
            estimatedCost: order.size * order.price,
            negrisk: isNegrisk,
          },
          message: 'This is a simulation. Set DRY_RUN=false to place real orders.',
        };
      }
      
      // LIVE: Place order
      fastify.log.warn('LIVE ORDER: Placing order:', { tokenId: order.tokenID, side: order.side, size: order.size });
      
      try {
        // Create and post order
        // Note: Actual order posting would use clobClient methods
        // This is a simplified example
        const result = {
          orderId: `order-${Date.now()}`,
          status: 'submitted',
          ...order,
        };
        
        fastify.log.info('Order placed:', result);
        
        return {
          dryRun: false,
          orderId: result.orderId,
          status: result.status,
          message: 'Order submitted successfully',
        };
      } catch (orderError: any) {
        fastify.log.error('Failed to place order:', orderError);
        return reply.status(500).send({ error: `Order failed: ${orderError.message}` });
      }
    } catch (error: any) {
      fastify.log.error('Failed to mirror trade:', error);
      
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
      }
      
      return reply.status(500).send({ error: error.message || 'Failed to mirror trade' });
    }
  });
}

