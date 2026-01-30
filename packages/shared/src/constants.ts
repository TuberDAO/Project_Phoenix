export const FRACTION_OF_POOL_ALERT = 0.1;
export const ZSCORE_BETSIZE_ALERT = 3.0;
export const TIME_TO_RESOLUTION_SOON_SEC = 24 * 3600;
export const GAS_PRIORITY_P90_FACTOR = 1.5;
export const BURST_RATIO_ALERT = 0.4;
export const FIRST_MOVER_MIN_USD = 2000;
export const LOW_LIQUIDITY_DEPTH_USD = 5000;

// News & Social
export const NEWS_WINDOW_MINS = 60;
export const NEWS_BASELINE_HOURS = 24;

// Fee estimation
export const CTF_BASE_FEE_BPS = 0; // Current Polymarket fee is 0 bps

// IRS component weights
export const IRS_WEIGHTS = {
  STAKE_IMPACT: 0.3,
  TEMPORAL_EVENT: 0.25,
  WALLET_HISTORY: 0.2,
  EVASION_URGENCY: 0.15,
  MARKET_CONTEXT: 0.1,
} as const;

// IRS thresholds
export const IRS_THRESHOLDS = {
  NEUTRAL: 19,
  WATCH: 49,
  HIGH: 74,
  CRITICAL: 100,
} as const;

// Risk levels
export const RISK_LEVELS = {
  NEUTRAL: 'neutral',
  WATCH: 'watch',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

// Alert threshold
export const ALERT_IRS_THRESHOLD = 75;

// Time constants
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_MINUTE = 60;

// Normalization thresholds
export const NORM_THRESHOLDS = {
  FRACTION_OF_POOL: 0.1,
  ZSCORE_DIVISOR: 3,
  DELTA_PROB: 0.25,
  WALLET_BET_COUNT_24H: 5,
  WALLET_AGG_USD_7D: 50000,
  FAN_IN_COUNT: 5,
  SLIPPAGE_BPS: 50,
} as const;

