import Bottleneck from 'bottleneck';
import * as RateLimits from '../config/rateLimits.js';

/**
 * Rate limiters using token bucket algorithm via Bottleneck.
 * Each endpoint family has its own limiter with configured quotas.
 */

// Create limiter instances
export const limiters = {
  DATA_GENERAL: new Bottleneck(RateLimits.DATA_GENERAL),
  DATA_ALT: new Bottleneck(RateLimits.DATA_ALT),
  DATA_TRADES: new Bottleneck(RateLimits.DATA_TRADES),
  
  GAMMA_GENERAL: new Bottleneck(RateLimits.GAMMA_GENERAL),
  GAMMA_MARKETS: new Bottleneck(RateLimits.GAMMA_MARKETS),
  GAMMA_EVENTS: new Bottleneck(RateLimits.GAMMA_EVENTS),
  GAMMA_SEARCH: new Bottleneck(RateLimits.GAMMA_SEARCH),
  
  CLOB_BOOK: new Bottleneck(RateLimits.CLOB_BOOK),
  CLOB_BOOKS: new Bottleneck(RateLimits.CLOB_BOOKS),
  CLOB_PRICE: new Bottleneck(RateLimits.CLOB_PRICE),
  CLOB_PRICES: new Bottleneck(RateLimits.CLOB_PRICES),
  CLOB_MIDPRICE: new Bottleneck(RateLimits.CLOB_MIDPRICE),
  CLOB_MARKETS: new Bottleneck(RateLimits.CLOB_MARKETS),
  CLOB_PRICE_HISTORY: new Bottleneck(RateLimits.CLOB_PRICE_HISTORY),
  
  UMA_SUBGRAPH: new Bottleneck(RateLimits.UMA_SUBGRAPH),
  NEWS_API: new Bottleneck(RateLimits.NEWS_API),
  TWITTER_API: new Bottleneck(RateLimits.TWITTER_API),
} as const;

export type LimiterKey = keyof typeof limiters;

/**
 * Calculate exponential backoff with jitter
 */
function calculateBackoff(attempt: number): number {
  const { baseDelay, maxDelay, jitterFactor } = RateLimits.RETRY_CONFIG;
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = exponentialDelay * jitterFactor * Math.random();
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Retry on rate limits (429) and server errors (5xx)
  if (error?.response?.status) {
    const status = error.response.status;
    return status === 429 || (status >= 500 && status < 600);
  }
  
  // Retry on network errors
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
    return true;
  }
  
  return false;
}

/**
 * Execute a function with rate limiting and retry logic
 * 
 * @param endpointKey - The rate limiter to use
 * @param fn - The function to execute
 * @param context - Optional context for logging
 * @returns Result of the function
 */
export async function rateLimit<T>(
  endpointKey: LimiterKey,
  fn: () => Promise<T>,
  context?: string
): Promise<T> {
  const limiter = limiters[endpointKey];
  const { maxRetries } = RateLimits.RETRY_CONFIG;
  
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Execute through rate limiter
      const result = await limiter.schedule(() => fn());
      
      // Success - reset any previous errors
      if (attempt > 0) {
        console.log(`[RateLimit] ${context || endpointKey}: Retry succeeded on attempt ${attempt + 1}`);
      }
      
      return result;
    } catch (error: any) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < maxRetries && isRetryableError(error)) {
        const backoff = calculateBackoff(attempt);
        
        console.warn(
          `[RateLimit] ${context || endpointKey}: Retryable error (${error?.response?.status || error?.code || 'unknown'}). ` +
          `Retry ${attempt + 1}/${maxRetries} after ${backoff}ms`
        );
        
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      
      // Not retryable or max retries exceeded
      if (attempt === maxRetries) {
        console.error(
          `[RateLimit] ${context || endpointKey}: Max retries (${maxRetries}) exceeded`,
          error.message
        );
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Wrap an async function with rate limiting
 */
export function withRateLimit<TArgs extends any[], TReturn>(
  endpointKey: LimiterKey,
  fn: (...args: TArgs) => Promise<TReturn>,
  getContext?: (...args: TArgs) => string
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => {
    const context = getContext ? getContext(...args) : undefined;
    return rateLimit(endpointKey, () => fn(...args), context);
  };
}

/**
 * Get current limiter stats (for monitoring)
 */
export function getLimiterStats() {
  const stats: Record<string, any> = {};
  
  for (const [key, limiter] of Object.entries(limiters)) {
    stats[key] = {
      running: limiter.counts().RUNNING,
      queued: limiter.counts().QUEUED,
    };
  }
  
  return stats;
}

/**
 * Log limiter initialization
 */
export function logLimiterInit() {
  console.log('✅ Rate limiters initialized for all endpoint families');
  RateLimits.logRateLimitConfig();
}

