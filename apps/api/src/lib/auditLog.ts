import { prisma } from './prisma.js';

/**
 * Audit logging utilities for compliance and debugging.
 */

export type AuditLogType =
  | 'scoring_computed'
  | 'threshold_crossing'
  | 'config_change'
  | 'export_request'
  | 'backtest_run';

export interface LogScoringParams {
  betId: string;
  irs: number;
  components: Record<string, number>;
}

export interface LogThresholdParams {
  betId: string;
  irs: number;
  threshold: number;
  marketId: string;
  wallet: string;
}

/**
 * Log scoring computation
 */
export async function logScoring(params: LogScoringParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        type: 'scoring_computed',
        refId: params.betId,
        payload: {
          irs: params.irs,
          components: params.components,
        },
      },
    });
  } catch (error) {
    console.error('[AuditLog] Failed to log scoring:', error);
  }
}

/**
 * Log threshold crossing (high-risk alert)
 */
export async function logThresholdCrossing(params: LogThresholdParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        type: 'threshold_crossing',
        refId: params.betId,
        payload: {
          irs: params.irs,
          threshold: params.threshold,
          marketId: params.marketId,
          wallet: params.wallet,
        },
      },
    });
  } catch (error) {
    console.error('[AuditLog] Failed to log threshold crossing:', error);
  }
}

/**
 * Create evidence snapshot for high-risk bet
 */
export async function createEvidence(
  betId: string,
  wallet: string,
  marketId: string,
  irs: number,
  components: Record<string, number>,
  chips: Record<string, boolean>
): Promise<void> {
  try {
    await prisma.evidence.upsert({
      where: { betId },
      update: {
        irs,
        components,
        chips,
      },
      create: {
        betId,
        wallet,
        marketId,
        irs,
        components,
        chips,
      },
    });
  } catch (error) {
    console.error('[Evidence] Failed to create evidence:', error);
  }
}

