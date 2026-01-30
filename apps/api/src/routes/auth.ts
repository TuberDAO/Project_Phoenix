import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { deriveApiKey, getApiKeys, deleteApiKey, validateTradingEnabled } from '../services/polymarketAuth.js';

const DeriveApiKeySchema = z.object({
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid private key format'),
  signatureType: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().default(0),
  funder: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Guard: Check trading enabled
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      validateTradingEnabled();
    } catch (error: any) {
      return reply.status(403).send({ error: error.message });
    }
  });

  /**
   * POST /auth/derive
   * Derive API key from private key
   */
  fastify.post('/auth/derive', async (request, reply) => {
    try {
      const body = DeriveApiKeySchema.parse(request.body);
      
      const credentials = await deriveApiKey({
        privateKey: body.privateKey,
        signatureType: body.signatureType,
        funder: body.funder,
      });
      
      // IMPORTANT: Never log secrets
      fastify.log.info(`API key derived for signature type ${body.signatureType}`);
      
      return {
        apiKey: credentials.apiKey,
        passphrase: credentials.passphrase,
        message: 'Store these credentials securely. They will not be shown again.',
      };
    } catch (error: any) {
      fastify.log.error('Failed to derive API key:', error);
      return reply.status(400).send({ error: error.message || 'Failed to derive API key' });
    }
  });

  /**
   * GET /auth/api-keys
   * Get API keys for an address (placeholder)
   */
  fastify.get<{ Querystring: { address?: string } }>('/auth/api-keys', async (request, reply) => {
    const { address } = request.query;
    
    if (!address) {
      return reply.status(400).send({ error: 'Address query parameter required' });
    }
    
    try {
      const keys = await getApiKeys(address);
      return { keys };
    } catch (error: any) {
      fastify.log.error('Failed to get API keys:', error);
      return reply.status(500).send({ error: error.message || 'Failed to get API keys' });
    }
  });

  /**
   * DELETE /auth/api-key/:keyId
   * Delete an API key (placeholder)
   */
  fastify.delete<{ Params: { keyId: string } }>('/auth/api-key/:keyId', async (request, reply) => {
    const { keyId } = request.params;
    
    try {
      await deleteApiKey(keyId);
      return { success: true, message: 'API key deleted' };
    } catch (error: any) {
      fastify.log.error('Failed to delete API key:', error);
      return reply.status(500).send({ error: error.message || 'Failed to delete API key' });
    }
  });
}

