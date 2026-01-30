import type { PreResolutionFeatures, InsiderRiskScore } from '@phoenix/shared';
import { clamp, sigmoid } from '@phoenix/shared';
import { NORM_THRESHOLDS, SECONDS_PER_DAY } from '@phoenix/shared';
import { getCurrentWeights, needsRefresh, refreshWeights } from './weights.js';
import { prisma } from '../lib/prisma.js';

/**
 * Compute the Insider Risk Score (IRS) from pre-resolution features.
 * Returns a score from 0-100 with component breakdown.
 * Uses current weight configuration (refreshed every 10s).
 */
export async function computeInsiderScore(features: PreResolutionFeatures): InsiderRiskScore {
  // Refresh weights if needed
  if (needsRefresh()) {
    await refreshWeights(prisma);
  }
  
  const weights = getCurrentWeights();
  // 1. Stake Impact (30%)
  const stakeScore = computeStakeImpactScore(features);

  // 2. Temporal/Event Proximity (25%)
  const temporalScore = computeTemporalScore(features);

  // 3. Wallet/Cluster History (20%)
  const historyScore = computeHistoryScore(features);

  // 4. Evasion/Urgency (15%)
  const evasionScore = computeEvasionScore(features);

  // 5. Market Microstructure Context (10%)
  const contextScore = computeContextScore(features);

  // Weighted sum using current weights
  const weightedScore =
    weights.stakeImpact * stakeScore +
    weights.temporal * temporalScore +
    weights.history * historyScore +
    weights.evasion * evasionScore +
    weights.context * contextScore;

  const irsBet = Math.round(clamp(weightedScore, 0, 1) * 100);

  return {
    irsBet,
    components: {
      stakeImpact: stakeScore,
      temporal: temporalScore,
      history: historyScore,
      evasion: evasionScore,
      context: contextScore,
    },
  };
}

/**
 * Stake Impact: fractionOfPool, zScoreBetSize, deltaProb
 */
function computeStakeImpactScore(features: PreResolutionFeatures): number {
  // Normalize fractionOfPool: min(frac/0.10, 1)
  const fracNorm = Math.min(features.fractionOfPool / NORM_THRESHOLDS.FRACTION_OF_POOL, 1);

  // Normalize zScoreBetSize using sigmoid: sigmoid(z/3)
  const zScoreNorm = sigmoid(features.zScoreBetSize / NORM_THRESHOLDS.ZSCORE_DIVISOR);

  // Normalize deltaProb: min(abs(deltaProb)/0.25, 1)
  const deltaNorm = Math.min(Math.abs(features.deltaProb) / NORM_THRESHOLDS.DELTA_PROB, 1);

  return (fracNorm + zScoreNorm + deltaNorm) / 3;
}

/**
 * Temporal/Event Proximity: timeToResolutionSec, preAnnouncementProximityMin, oracleProximitySec
 */
function computeTemporalScore(features: PreResolutionFeatures): number {
  // timeToResolutionSec: if <= 24h, score = 1 - (time/86400), else 0
  const timeScore =
    features.timeToResolutionSec <= SECONDS_PER_DAY
      ? 1 - features.timeToResolutionSec / SECONDS_PER_DAY
      : 0;

  // preAnnouncementProximityMin: < 60min -> 1, < 720min (12h) -> 0.5, else 0
  let eventScore = 0;
  if (features.preAnnouncementProximityMin < 60) {
    eventScore = 1;
  } else if (features.preAnnouncementProximityMin < 720) {
    eventScore = 0.5;
  }

  // oracleProximitySec: < 3600 (1h) -> 1, else 0
  const oracleScore = features.oracleProximitySec < 3600 ? 1 : 0;

  return (timeScore + eventScore + oracleScore) / 3;
}

/**
 * Wallet/Cluster History: newWalletFlag, walletBetCount24h, walletAggUsd7d
 */
function computeHistoryScore(features: PreResolutionFeatures): number {
  const newWalletScore = features.newWalletFlag ? 1 : 0;

  // walletBetCount24h: min(cnt/5, 1)
  const betCountNorm = Math.min(
    features.walletBetCount24h / NORM_THRESHOLDS.WALLET_BET_COUNT_24H,
    1
  );

  // walletAggUsd7d: min(agg/50000, 1)
  const aggUsdNorm = Math.min(features.walletAggUsd7d / NORM_THRESHOLDS.WALLET_AGG_USD_7D, 1);

  return (newWalletScore + betCountNorm + aggUsdNorm) / 3;
}

/**
 * Evasion/Urgency: gasPriorityFlag, fanInCount24h, fundingGapSec
 */
function computeEvasionScore(features: PreResolutionFeatures): number {
  const gasPriorityScore = features.gasPriorityFlag ? 1 : 0;

  // fanInCount24h: min(fanIn/5, 1)
  const fanInNorm = Math.min(features.fanInCount24h / NORM_THRESHOLDS.FAN_IN_COUNT, 1);

  // fundingGapSec: < 3600 (1h) -> 1, < 86400 (24h) -> 0.5, else 0
  let gapScore = 0;
  if (features.fundingGapSec < 3600) {
    gapScore = 1;
  } else if (features.fundingGapSec < SECONDS_PER_DAY) {
    gapScore = 0.5;
  }

  return (gasPriorityScore + fanInNorm + gapScore) / 3;
}

/**
 * Market Microstructure Context: isMarketableOrder, slippageFootprintBps,
 * bookImbalanceAfter, firstMoverFlag, lowLiquiditySideFlag
 */
function computeContextScore(features: PreResolutionFeatures): number {
  const marketableScore = features.isMarketableOrder ? 1 : 0;

  // slippageFootprintBps: min(slippage/50, 1)
  const slippageNorm = Math.min(
    features.slippageFootprintBps / NORM_THRESHOLDS.SLIPPAGE_BPS,
    1
  );

  // bookImbalanceAfter: normalize from [-1, 1] to [0, 1]
  const imbalanceNorm = clamp((features.bookImbalanceAfter + 1) / 2, 0, 1);

  const firstMoverScore = features.firstMoverFlag ? 1 : 0;
  const lowLiqScore = features.lowLiquiditySideFlag ? 1 : 0;

  return (marketableScore + slippageNorm + imbalanceNorm + firstMoverScore + lowLiqScore) / 5;
}

