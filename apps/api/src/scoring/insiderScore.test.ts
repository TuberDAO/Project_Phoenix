import { describe, it, expect } from 'vitest';
import { computeInsiderScore } from './insiderScore.js';
import type { PreResolutionFeatures } from '@phoenix/shared';

describe('computeInsiderScore', () => {
  it('should return low IRS for low-risk bet', () => {
    const lowRiskFeatures: PreResolutionFeatures = {
      // Timing - far from resolution
      timeToResolutionSec: 30 * 24 * 3600, // 30 days
      betTimestamp: new Date().toISOString(),
      isFinalHourBeforeClose: false,

      // Size & impact - small bet
      betUsd: 500,
      fractionOfPool: 0.01, // 1% of pool
      zScoreBetSize: 0.5,
      impliedBefore: 0.45,
      impliedAfter: 0.46,
      deltaProb: 0.01,

      // Order-flow
      isMarketableOrder: false,
      slippageFootprintBps: 5,
      burstRatio1m: 0.1,
      bookImbalanceAfter: 0.0,

      // Wallet provenance - established wallet
      walletAgeDays: 180,
      newWalletFlag: false,
      fundingGapSec: 48 * 3600, // 2 days
      fundingSourceType: 'wallet',

      // Evasion/urgency - normal behavior
      gasPriorityFlag: false,
      fanInCount24h: 1,
      fanOutPlanFlag: false,

      // Cross-market
      correlatedMarketsEntered5m: 0,
      firstMoverFlag: false,
      lowLiquiditySideFlag: false,

      // News/oracle
      preAnnouncementProximityMin: 9999,
      newsVolumeDeltaZ: 0,
      oracleProximitySec: 999999,

      // Rules
      esotericRuleTargetFlag: false,

      // Aggregates
      walletBetCount24h: 2,
      walletAggUsd24h: 1000,
      walletAggUsd7d: 3000,
    };

    const score = computeInsiderScore(lowRiskFeatures);

    expect(score.irsBet).toBeGreaterThanOrEqual(0);
    expect(score.irsBet).toBeLessThan(30); // Should be in neutral/low range
    expect(score.components).toHaveProperty('stakeImpact');
    expect(score.components).toHaveProperty('temporal');
    expect(score.components).toHaveProperty('history');
    expect(score.components).toHaveProperty('evasion');
    expect(score.components).toHaveProperty('context');
  });

  it('should return medium IRS for moderately suspicious bet', () => {
    const mediumRiskFeatures: PreResolutionFeatures = {
      // Timing - moderate proximity
      timeToResolutionSec: 12 * 3600, // 12 hours
      betTimestamp: new Date().toISOString(),
      isFinalHourBeforeClose: false,

      // Size & impact - medium bet
      betUsd: 8000,
      fractionOfPool: 0.05, // 5% of pool
      zScoreBetSize: 2.0,
      impliedBefore: 0.45,
      impliedAfter: 0.52,
      deltaProb: 0.07,

      // Order-flow
      isMarketableOrder: true,
      slippageFootprintBps: 20,
      burstRatio1m: 0.3,
      bookImbalanceAfter: 0.15,

      // Wallet provenance
      walletAgeDays: 60,
      newWalletFlag: false,
      fundingGapSec: 12 * 3600, // 12 hours
      fundingSourceType: 'wallet',

      // Evasion/urgency
      gasPriorityFlag: true,
      fanInCount24h: 3,
      fanOutPlanFlag: false,

      // Cross-market
      correlatedMarketsEntered5m: 2,
      firstMoverFlag: false,
      lowLiquiditySideFlag: true,

      // News/oracle
      preAnnouncementProximityMin: 9999,
      newsVolumeDeltaZ: 0,
      oracleProximitySec: 999999,

      // Rules
      esotericRuleTargetFlag: false,

      // Aggregates
      walletBetCount24h: 4,
      walletAggUsd24h: 15000,
      walletAggUsd7d: 35000,
    };

    const score = computeInsiderScore(mediumRiskFeatures);

    expect(score.irsBet).toBeGreaterThanOrEqual(40);
    expect(score.irsBet).toBeLessThan(70); // Should be in watch/moderate range
  });

  it('should return high IRS for highly suspicious bet', () => {
    const highRiskFeatures: PreResolutionFeatures = {
      // Timing - very close to resolution
      timeToResolutionSec: 2 * 3600, // 2 hours
      betTimestamp: new Date().toISOString(),
      isFinalHourBeforeClose: false,

      // Size & impact - large bet with big impact
      betUsd: 25000,
      fractionOfPool: 0.15, // 15% of pool
      zScoreBetSize: 4.5,
      impliedBefore: 0.42,
      impliedAfter: 0.58,
      deltaProb: 0.16,

      // Order-flow
      isMarketableOrder: true,
      slippageFootprintBps: 45,
      burstRatio1m: 0.6,
      bookImbalanceAfter: 0.35,

      // Wallet provenance - new wallet, suspicious funding
      walletAgeDays: 2,
      newWalletFlag: true,
      fundingGapSec: 1800, // 30 minutes
      fundingSourceType: 'mixer',

      // Evasion/urgency - high priority gas, multiple funders
      gasPriorityFlag: true,
      fanInCount24h: 6,
      fanOutPlanFlag: true,

      // Cross-market - first mover, targeting illiquid side
      correlatedMarketsEntered5m: 4,
      firstMoverFlag: true,
      lowLiquiditySideFlag: true,

      // News/oracle - close to announcement
      preAnnouncementProximityMin: 30, // 30 minutes
      newsVolumeDeltaZ: 2.5,
      oracleProximitySec: 1800, // 30 minutes

      // Rules
      esotericRuleTargetFlag: true,

      // Aggregates - high activity
      walletBetCount24h: 8,
      walletAggUsd24h: 50000,
      walletAggUsd7d: 120000,
    };

    const score = computeInsiderScore(highRiskFeatures);

    expect(score.irsBet).toBeGreaterThanOrEqual(70); // Should be in high/critical range
    expect(score.irsBet).toBeLessThanOrEqual(100);

    // Verify all components are present and normalized (0-1)
    Object.values(score.components).forEach((componentScore) => {
      expect(componentScore).toBeGreaterThanOrEqual(0);
      expect(componentScore).toBeLessThanOrEqual(1);
    });
  });

  it('should have components that sum appropriately with weights', () => {
    const features: PreResolutionFeatures = {
      timeToResolutionSec: 3600,
      betTimestamp: new Date().toISOString(),
      isFinalHourBeforeClose: true,
      betUsd: 10000,
      fractionOfPool: 0.08,
      zScoreBetSize: 3.0,
      impliedBefore: 0.5,
      impliedAfter: 0.6,
      deltaProb: 0.1,
      isMarketableOrder: true,
      slippageFootprintBps: 30,
      burstRatio1m: 0.4,
      bookImbalanceAfter: 0.2,
      walletAgeDays: 30,
      newWalletFlag: false,
      fundingGapSec: 7200,
      fundingSourceType: 'wallet',
      gasPriorityFlag: true,
      fanInCount24h: 3,
      fanOutPlanFlag: false,
      correlatedMarketsEntered5m: 2,
      firstMoverFlag: true,
      lowLiquiditySideFlag: true,
      preAnnouncementProximityMin: 9999,
      newsVolumeDeltaZ: 0,
      oracleProximitySec: 999999,
      esotericRuleTargetFlag: false,
      walletBetCount24h: 5,
      walletAggUsd24h: 20000,
      walletAggUsd7d: 50000,
    };

    const score = computeInsiderScore(features);

    // Verify the weighted combination makes sense
    const { stakeImpact, temporal, history, evasion, context } = score.components;
    const manual = Math.round(
      100 * (0.3 * stakeImpact + 0.25 * temporal + 0.2 * history + 0.15 * evasion + 0.1 * context)
    );

    expect(score.irsBet).toBe(manual);
  });
});

