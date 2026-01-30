/**
 * Rate limit configuration for Polymarket API endpoints.
 * All limits are configurable via environment variables.
 */

export interface RateLimitConfig {
  reservoir: number; // Max tokens
  reservoirRefreshAmount: number; // Tokens to add per interval
  reservoirRefreshInterval: number; // Interval in ms
  minTime: number; // Min time between requests in ms
}

// Helper to parse env rate limit: "200/10s" -> { reservoir: 200, interval: 10000 }
function parseRateLimit(envValue: string, defaultValue: string): RateLimitConfig {
  const value = envValue || defaultValue;
  const match = value.match(/^(\d+)\/(\d+)(s|m)$/);
  
  if (!match) {
    throw new Error(`Invalid rate limit format: ${value}. Expected format: "200/10s" or "1200/1m"`);
  }

  const [, count, time, unit] = match;
  const reservoir = parseInt(count, 10);
  const timeValue = parseInt(time, 10);
  const intervalMs = unit === 's' ? timeValue * 1000 : timeValue * 60 * 1000;

  return {
    reservoir,
    reservoirRefreshAmount: reservoir,
    reservoirRefreshInterval: intervalMs,
    minTime: Math.floor(intervalMs / reservoir), // Spread requests evenly
  };
}

// Data API rate limits
export const DATA_GENERAL = parseRateLimit(
  process.env.RATE_DATA_GENERAL || '',
  '200/10s'
);

export const DATA_ALT = parseRateLimit(
  process.env.RATE_DATA_ALT || '',
  '1200/1m'
);

export const DATA_TRADES = parseRateLimit(
  process.env.RATE_DATA_TRADES || '',
  '75/10s'
);

// Gamma API rate limits
export const GAMMA_GENERAL = parseRateLimit(
  process.env.RATE_GAMMA_GENERAL || '',
  '750/10s'
);

export const GAMMA_MARKETS = parseRateLimit(
  process.env.RATE_GAMMA_MARKETS || '',
  '125/10s'
);

export const GAMMA_EVENTS = parseRateLimit(
  process.env.RATE_GAMMA_EVENTS || '',
  '100/10s'
);

export const GAMMA_SEARCH = parseRateLimit(
  process.env.RATE_GAMMA_SEARCH || '',
  '300/10s'
);

// CLOB API rate limits
export const CLOB_BOOK = parseRateLimit(
  process.env.RATE_CLOB_BOOK || '',
  '200/10s'
);

export const CLOB_BOOKS = parseRateLimit(
  process.env.RATE_CLOB_BOOKS || '',
  '80/10s'
);

export const CLOB_PRICE = parseRateLimit(
  process.env.RATE_CLOB_PRICE || '',
  '200/10s'
);

export const CLOB_PRICES = parseRateLimit(
  process.env.RATE_CLOB_PRICES || '',
  '80/10s'
);

export const CLOB_MIDPRICE = parseRateLimit(
  process.env.RATE_CLOB_MIDPRICE || '',
  '200/10s'
);

export const CLOB_MARKETS = parseRateLimit(
  process.env.RATE_CLOB_MARKETS || '',
  '250/10s'
);

export const CLOB_PRICE_HISTORY = parseRateLimit(
  process.env.RATE_CLOB_PRICE_HISTORY || '',
  '100/10s'
);

// UMA Subgraph rate limit
export const UMA_SUBGRAPH = parseRateLimit(
  process.env.RATE_UMA_SUBGRAPH || '',
  '80/10s'
);

// News API rate limit
export const NEWS_API = parseRateLimit(
  process.env.RATE_NEWS_API || '',
  '100/1m'
);

// Twitter API rate limit
export const TWITTER_API = parseRateLimit(
  process.env.RATE_TWITTER_API || '',
  '50/1m'
);

// Retry configuration
export const RETRY_CONFIG = {
  maxRetries: parseInt(process.env.MAX_RETRIES || '4', 10),
  baseDelay: parseInt(process.env.RETRY_BASE_DELAY || '200', 10), // ms
  maxDelay: parseInt(process.env.RETRY_MAX_DELAY || '6000', 10), // ms
  jitterFactor: parseFloat(process.env.RETRY_JITTER_FACTOR || '0.3'),
};

// Log all configured limits
export function logRateLimitConfig() {
  console.log('📊 Rate Limit Configuration:');
  console.log('  Data API:');
  console.log(`    General: ${DATA_GENERAL.reservoir}/${DATA_GENERAL.reservoirRefreshInterval}ms`);
  console.log(`    Alt: ${DATA_ALT.reservoir}/${DATA_ALT.reservoirRefreshInterval}ms`);
  console.log(`    Trades: ${DATA_TRADES.reservoir}/${DATA_TRADES.reservoirRefreshInterval}ms`);
  console.log('  Gamma API:');
  console.log(`    General: ${GAMMA_GENERAL.reservoir}/${GAMMA_GENERAL.reservoirRefreshInterval}ms`);
  console.log(`    Markets: ${GAMMA_MARKETS.reservoir}/${GAMMA_MARKETS.reservoirRefreshInterval}ms`);
  console.log(`    Events: ${GAMMA_EVENTS.reservoir}/${GAMMA_EVENTS.reservoirRefreshInterval}ms`);
  console.log(`    Search: ${GAMMA_SEARCH.reservoir}/${GAMMA_SEARCH.reservoirRefreshInterval}ms`);
  console.log('  CLOB API:');
  console.log(`    Book: ${CLOB_BOOK.reservoir}/${CLOB_BOOK.reservoirRefreshInterval}ms`);
  console.log(`    Books: ${CLOB_BOOKS.reservoir}/${CLOB_BOOKS.reservoirRefreshInterval}ms`);
  console.log(`    Price: ${CLOB_PRICE.reservoir}/${CLOB_PRICE.reservoirRefreshInterval}ms`);
  console.log(`    Prices: ${CLOB_PRICES.reservoir}/${CLOB_PRICES.reservoirRefreshInterval}ms`);
  console.log(`    Midprice: ${CLOB_MIDPRICE.reservoir}/${CLOB_MIDPRICE.reservoirRefreshInterval}ms`);
  console.log(`    Markets: ${CLOB_MARKETS.reservoir}/${CLOB_MARKETS.reservoirRefreshInterval}ms`);
  console.log(`    Price History: ${CLOB_PRICE_HISTORY.reservoir}/${CLOB_PRICE_HISTORY.reservoirRefreshInterval}ms`);
  console.log('  UMA Subgraph:');
  console.log(`    General: ${UMA_SUBGRAPH.reservoir}/${UMA_SUBGRAPH.reservoirRefreshInterval}ms`);
  console.log('  Retry:');
  console.log(`    Max Retries: ${RETRY_CONFIG.maxRetries}`);
  console.log(`    Base Delay: ${RETRY_CONFIG.baseDelay}ms`);
  console.log(`    Max Delay: ${RETRY_CONFIG.maxDelay}ms`);
}

