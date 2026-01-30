import { PrismaClient } from '@prisma/client';
import { computeFeatureVector } from '../features/computeFeatureVector.js';
import { computeInsiderScore } from '../scoring/insiderScore.js';
import type { PreResolutionFeatures } from '@phoenix/shared';

const prisma = new PrismaClient();

export interface BacktestParams {
  from: Date;
  to: Date;
  minIrs?: number;
  label?: string;
  weightsPreset?: 'default' | 'strict' | 'balanced' | 'lenient';
}

export interface BacktestMetrics {
  totalBets: number;
  highRiskBets: number;
  precisionAt10: number;
  precisionAt20: number;
  precisionAt50: number;
  rocAucProxy: number;
  avgLeadTimeMinutes: number;
  irsDistribution: { bin: string; count: number }[];
  irsOverTime: { timestamp: string; irs: number }[];
}

/**
 * Run backtest on historical data
 */
export async function runBacktest(params: BacktestParams): Promise<BacktestMetrics> {
  console.log('[Backtest] Starting backtest:', params);
  
  // Load historical bets
  const bets = await prisma.bet.findMany({
    where: {
      timestamp: {
        gte: params.from,
        lte: params.to,
      },
    },
    include: {
      market: true,
    },
    orderBy: {
      timestamp: 'desc',
    },
  });
  
  console.log(`[Backtest] Loaded ${bets.length} bets`);
  
  // Compute features and scores for each bet
  const results: Array<{
    betId: string;
    timestamp: Date;
    irs: number;
    timeToResolution: number;
  }> = [];
  
  for (const bet of bets) {
    try {
      // Load wallet
      const wallet = await prisma.wallet.findUnique({
        where: { address: bet.wallet },
      });
      
      // Compute features (simplified context)
      const features = computeFeatureVector(bet, bet.market, wallet, {});
      
      // Compute score
      const score = await computeInsiderScore(features);
      
      results.push({
        betId: bet.id,
        timestamp: bet.timestamp,
        irs: score.irsBet,
        timeToResolution: features.timeToResolutionSec,
      });
    } catch (error) {
      console.error(`[Backtest] Failed to score bet ${bet.id}:`, error);
    }
  }
  
  // Calculate metrics
  const highRiskBets = results.filter(r => r.irs >= (params.minIrs || 75));
  
  // Precision@k: proportion of top-k bets that are actually high-risk
  const sortedByIrs = [...results].sort((a, b) => b.irs - a.irs);
  const precisionAt10 = calculatePrecision(sortedByIrs.slice(0, 10), params.minIrs || 75);
  const precisionAt20 = calculatePrecision(sortedByIrs.slice(0, 20), params.minIrs || 75);
  const precisionAt50 = calculatePrecision(sortedByIrs.slice(0, 50), params.minIrs || 75);
  
  // ROC AUC proxy (simplified binning)
  const rocAucProxy = calculateRocAucProxy(results, params.minIrs || 75);
  
  // Average lead time (time from high IRS to market close)
  const avgLeadTimeMinutes = calculateAvgLeadTime(results, params.minIrs || 75);
  
  // IRS distribution (histogram bins)
  const irsDistribution = calculateDistribution(results);
  
  // IRS over time
  const irsOverTime = results.map(r => ({
    timestamp: r.timestamp.toISOString(),
    irs: r.irs,
  }));
  
  console.log('[Backtest] Metrics computed:', {
    totalBets: results.length,
    highRiskBets: highRiskBets.length,
    precisionAt10,
    precisionAt20,
    precisionAt50,
  });
  
  return {
    totalBets: results.length,
    highRiskBets: highRiskBets.length,
    precisionAt10,
    precisionAt20,
    precisionAt50,
    rocAucProxy,
    avgLeadTimeMinutes,
    irsDistribution,
    irsOverTime,
  };
}

function calculatePrecision(topK: any[], threshold: number): number {
  if (topK.length === 0) return 0;
  const highRisk = topK.filter(r => r.irs >= threshold).length;
  return highRisk / topK.length;
}

function calculateRocAucProxy(results: any[], threshold: number): number {
  // Simplified: calculate area under curve via trapezoidal rule
  // For now, return a proxy based on separation of high/low risk scores
  const highRisk = results.filter(r => r.irs >= threshold);
  const lowRisk = results.filter(r => r.irs < threshold);
  
  if (highRisk.length === 0 || lowRisk.length === 0) return 0.5;
  
  const highMean = highRisk.reduce((sum, r) => sum + r.irs, 0) / highRisk.length;
  const lowMean = lowRisk.reduce((sum, r) => sum + r.irs, 0) / lowRisk.length;
  
  // Proxy: normalized separation
  const separation = (highMean - lowMean) / 100;
  return Math.min(0.5 + separation / 2, 1.0);
}

function calculateAvgLeadTime(results: any[], threshold: number): number {
  const highRisk = results.filter(r => r.irs >= threshold);
  if (highRisk.length === 0) return 0;
  
  const totalLeadTime = highRisk.reduce((sum, r) => sum + r.timeToResolution, 0);
  return totalLeadTime / highRisk.length / 60; // Convert to minutes
}

function calculateDistribution(results: any[]): { bin: string; count: number }[] {
  const bins = [
    { label: '0-19', min: 0, max: 19, count: 0 },
    { label: '20-39', min: 20, max: 39, count: 0 },
    { label: '40-59', min: 40, max: 59, count: 0 },
    { label: '60-79', min: 60, max: 79, count: 0 },
    { label: '80-100', min: 80, max: 100, count: 0 },
  ];
  
  for (const result of results) {
    for (const bin of bins) {
      if (result.irs >= bin.min && result.irs <= bin.max) {
        bin.count++;
        break;
      }
    }
  }
  
  return bins.map(b => ({ bin: b.label, count: b.count }));
}

