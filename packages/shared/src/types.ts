export type FundingSourceType = 'cex' | 'mixer' | 'wallet' | 'bridge' | 'unknown';

export type PreResolutionFeatures = {
  // ---- Timing vs event/oracle ----
  betTimestamp: string; // ISO
  timeToResolutionSec: number; // closesAt - bet.ts (>=0)
  isFinalHourBeforeClose: boolean; // timeToResolutionSec <= 3600
  preAnnouncementProximityMin: number; // mins to next scheduled public event if known; else 9999
  oracleProximitySec: number; // |bet.ts - nearest{request,proposal,dispute}|
  oracleMempoolLagSec: number; // placeholder (0 if unavailable)

  // ---- Size & impact ----
  betUsd: number;
  liquidityAtBetUsd: number; // estimated depth around mid at execution
  fractionOfPool: number; // betUsd / liquidityAtBetUsd
  zScoreBetSize: number; // (betUsd - mean) / std (market rolling)
  impliedBefore: number; // 0..1
  impliedAfter: number; // 0..1
  deltaProb: number; // impliedAfter - impliedBefore
  estimatedFeeBps: number; // fee estimate per ctf-exchange formula

  // ---- Order-flow microstructure ----
  isMarketableOrder: boolean; // crossed spread
  slippageFootprintBps: number; // |fill-mid|/mid * 1e4
  bookImbalanceAfter: number; // (bidNotional-askNotional)/(sum)
  burstRatio1m: number; // wallet 1m volume / market 1m volume
  firstMoverFlag: boolean; // large bet soon after market (or after long dormancy)
  lowLiquiditySideFlag: boolean; // targeted side depth < threshold
  quoteToTradeRatio: number; // wallet quotes/ trades near fill window
  cancelReplaceRate: number; // wallet cancels/ new quotes near fill window
  selfTradeIncidence: number; // fraction of matched trades with same cluster (0..1)

  // ---- Wallet provenance / evasion ----
  walletAgeDays: number;
  newWalletFlag: boolean;
  fundingGapSec: number; // time from latest inbound to bet
  fundingSourceType: FundingSourceType;
  fanInCount24h: number; // distinct funders in prior 24h
  fanOutPlanFlag: boolean; // immediate planned outflow (0 if unknown)
  gasPriorityFlag: boolean; // priority fee > p90 for block
  highGasMultiplier: number; // actual / median priority fee

  // ---- Cross-market behavior ----
  correlatedMarketsEntered5m: number; // entries in related markets within 5m
  basketSynchronizedFlag: boolean; // multiple unrelated markets within 5m
  copyTradeShadowFollowers: number; // distinct small wallets mirroring within 60s
  repeatedLastMinutePatternScore: number; // past pattern strength 0..1

  // ---- Social/news alignment (pre-public indicators) ----
  newsVolumeDeltaZ: number; // z-score of post-bet 60m news/tweets vs baseline
  chatterLullFlag: boolean; // bet when no chatter despite impending event

  // ---- Category / rules awareness ----
  esotericRuleTargetFlag: boolean; // derived from rules text (edge cases)
  negriskFlag: boolean; // bet involves negrisk market
  ruleWindowHitFlag: boolean; // timed to admin milestone (filing/ certification windows)

  // ---- Aggregates (rolling) ----
  walletBetCount24h: number;
  walletAggUsd24h: number;
  walletAggUsd7d: number;

  // ---- Cluster/network (prelim; 0 if unavailable) ----
  clusterRotationScore: number; // throwaway wallet rotation 0..1
  clusterId?: string;
};

export type InsiderRiskScore = {
  irsBet: number; // 0..100
  components: Record<string, number>; // normalized component contributions 0..1
};

export type MarketStatus = 'open' | 'closed' | 'resolved' | 'cancelled';

export type Market = {
  id: string;
  question: string;
  category?: string | null;
  createdAt: Date;
  closesAt: Date;
  resolvesAt?: Date | null;
  status: MarketStatus;
  oracleRequestAt?: Date | null;
  metaJson?: Record<string, unknown> | null;
};

export type Bet = {
  id: string;
  txHash: string;
  marketId: string;
  wallet: string;
  outcomeId: string;
  timestamp: Date;
  blockNumber: number;
  betUsd: number;
  impliedBefore: number;
  impliedAfter: number;
  deltaProb: number;
  fractionOfPool: number;
  zScoreSize: number;
  gasPriorityFlag: boolean;
  timeToResolutionSec: number;
};

export type Wallet = {
  address: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  newWalletFlag: boolean;
  roi30d: number;
  winRateRolling: number;
};

export type FeatureSnapshot = {
  id: string;
  betId: string;
  wallet: string;
  marketId: string;
  features: PreResolutionFeatures;
  createdAt: Date;
};

export type Score = {
  id: string;
  betId: string;
  wallet: string;
  marketId: string;
  irsBet: number;
  irsWallet: number;
  irsCluster: number;
  createdAt: Date;
};

export type NewsEvent = {
  id: string;
  marketId?: string | null;
  source: string;
  headline: string;
  url: string;
  timestamp: Date;
  volumeScore: number;
  matchScore: number;
};

export type AlertBet = Bet & {
  market: Market;
  score: Score;
};

export type WalletProfile = Wallet & {
  recentBets: Bet[];
  recentScores: Score[];
};

export type ScoreBetRequest = {
  betId?: string;
  bet?: {
    id: string;
    txHash: string;
    marketId: string;
    wallet: string;
    outcomeId: string;
    timestamp: string | Date;
    blockNumber: number;
    betUsd: number;
    impliedBefore: number;
    impliedAfter: number;
    deltaProb: number;
    fractionOfPool: number;
    zScoreSize: number;
    gasPriorityFlag: boolean;
    timeToResolutionSec: number;
  };
};

export type ScoreBetResponse = {
  features: PreResolutionFeatures;
  score: InsiderRiskScore;
};

