import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  WeightSetSchema,
  PRESETS,
  type PresetName,
  validateWeights,
  normalizeWeights,
  setCurrentWeights,
  getCurrentWeights,
} from '../scoring/weights.js';

const SetWeightsSchema = z.object({
  weights: WeightSetSchema.optional(),
  preset: z.enum(['default', 'strict', 'balanced', 'lenient']).optional(),
}).refine(data => data.weights || data.preset, {
  message: 'Either weights or preset must be provided',
});

export async function configRoutes(fastify: FastifyInstance) {
  /**
   * GET /config/weights
   * Get current weight configuration
   */
  fastify.get('/config/weights', async () => {
    const current = getCurrentWeights();
    
    return {
      current,
      presets: PRESETS,
      valid: validateWeights(current),
    };
  });

  /**
   * POST /config/weights
   * Update weight configuration
   */
  fastify.post('/config/weights', async (request, reply) => {
    try {
      const body = SetWeightsSchema.parse(request.body);
      
      let newWeights;
      
      if (body.preset) {
        newWeights = PRESETS[body.preset as PresetName];
        fastify.log.info(`Applying preset: ${body.preset}`);
      } else if (body.weights) {
        newWeights = body.weights;
        
        // Normalize if needed
        if (!validateWeights(newWeights)) {
          fastify.log.warn('Weights do not sum to 1.0, normalizing...');
          newWeights = normalizeWeights(newWeights);
        }
      } else {
        return reply.status(400).send({ error: 'Either weights or preset required' });
      }
      
      // Persist to database
      await prisma.config.upsert({
        where: { key: 'weights' },
        update: { value: newWeights },
        create: { key: 'weights', value: newWeights },
      });
      
      // Update in-memory cache
      setCurrentWeights(newWeights);
      
      // Log to audit
      await prisma.auditLog.create({
        data: {
          type: 'config_change',
          refId: 'weights',
          payload: {
            previous: getCurrentWeights(),
            new: newWeights,
            preset: body.preset || null,
          },
        },
      });
      
      fastify.log.info('Weights updated:', newWeights);
      
      return {
        success: true,
        weights: newWeights,
        message: 'Weights updated successfully. New scores will use these weights.',
      };
    } catch (error: any) {
      fastify.log.error('Failed to update weights:', error);
      
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
      }
      
      return reply.status(500).send({ error: error.message || 'Failed to update weights' });
    }
  });
}

