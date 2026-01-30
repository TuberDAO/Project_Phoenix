import { ClobClient } from '@polymarket/clob-client';
import { LRUCache } from 'lru-cache';
import { rateLimit } from '../rate/limiters.js';

/**
 * Polymarket API client with rate limiting and caching.
 * Integrates CLOB, Gamma, and Data APIs.
 */

const CLOB_HOST = process.env.CLOB_HOST || 'https://clob.polymarket.com';
const GAMMA_BASE = process.env.POLYMARKET_GAMMA_BASE || 'https://gamma-api.polymarket.com';
const DATA_BASE = process.env.POLYMARKET_API_BASE || 'https://data-api.polymarket.com';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '137', 10); // Polygon

// Initialize CLOB client (read-only)
const clobClient = new ClobClient(CLOB_HOST, CHAIN_ID);

// LRU Caches with TTL
const bookCache = new LRUCache<string, any>({
  max: 500,
  ttl: 2000, // 2 seconds
});

const priceCache = new LRUCache<string, any>({
  max: 500,
  ttl: 3000, // 3 seconds
});

const midpriceCache = new LRUCache<string, any>({
  max: 500,
  ttl: 2000, // 2 seconds
});

const marketCache = new LRUCache<string, any>({
  max: 1000,
  ttl: 30000, // 30 seconds
});

// Helper for fetch requests
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ==================== Gamma API (Markets) ====================

export interface ListMarketsParams {
  cursor?: string;
  limit?: number;
  status?: 'open' | 'closed' | 'resolved';
}

export interface ListMarketsResponse {
  data?: any[];
  next_cursor?: string;
  [key: string]: any;
}

export async function listMarkets(params: ListMarketsParams = {}): Promise<ListMarketsResponse> {
  const { cursor, limit = 100, status } = params;
  const url = new URL(`${GAMMA_BASE}/markets`);
  
  if (cursor) url.searchParams.set('next_cursor', cursor);
  url.searchParams.set('limit', limit.toString());
  if (status) url.searchParams.set('closed', status === 'closed' ? 'true' : 'false');
  
  const result = await rateLimit(
    'GAMMA_MARKETS',
    () => fetchWithTimeout(url.toString()),
    `listMarkets(${status}, limit=${limit}, cursor=${cursor?.slice(0, 8) || 'none'})`
  );
  
  return result as ListMarketsResponse;
}

/**
 * Fetch ALL markets with pagination.
 * Handles cursor-based pagination automatically until all markets are fetched.
 * 
 * @param params - Filter parameters
 * @param onPage - Optional callback for each page (for progress reporting)
 * @returns Array of all markets
 */
export async function listAllMarkets(
  params: Omit<ListMarketsParams, 'cursor'> = {},
  onPage?: (pageNum: number, marketsInPage: number, totalSoFar: number) => void
): Promise<any[]> {
  const allMarkets: any[] = [];
  let cursor: string | undefined;
  let pageNum = 0;
  const pageSize = 100; // Max allowed by Gamma API
  
  do {
    const response = await listMarkets({
      ...params,
      limit: pageSize,
      cursor,
    });
    
    // Handle both array response and {data: [...], next_cursor: ...} response
    const markets = Array.isArray(response) ? response : (response?.data || response || []);
    const nextCursor = Array.isArray(response) ? undefined : response?.next_cursor;
    
    if (!Array.isArray(markets)) {
      console.warn('[PolyClient] Unexpected response format from listMarkets:', typeof markets);
      break;
    }
    
    // Log first market structure on first page for debugging
    if (pageNum === 0 && markets.length > 0) {
      const sample = markets[0];
      console.log('[PolyClient] Sample market structure:');
      console.log(`  - id: ${sample.id}`);
      console.log(`  - condition_id: ${sample.condition_id}`);
      console.log(`  - question: ${sample.question?.substring(0, 50)}...`);
      console.log(`  - tokens: ${JSON.stringify(sample.tokens?.slice(0, 2))}`);
      console.log(`  - clobTokenIds: ${JSON.stringify(sample.clobTokenIds || sample.clob_token_ids)}`);
      console.log(`  - All keys: ${Object.keys(sample).join(', ')}`);
    }
    
    allMarkets.push(...markets);
    pageNum++;
    
    if (onPage) {
      onPage(pageNum, markets.length, allMarkets.length);
    }
    
    // Update cursor for next page
    cursor = nextCursor;
    
    // Safety check: if we got fewer markets than requested, we're done
    if (markets.length < pageSize) {
      break;
    }
    
    // Safety check: prevent infinite loops (max 50 pages = 5000 markets)
    if (pageNum >= 50) {
      console.warn('[PolyClient] Hit pagination safety limit (50 pages)');
      break;
    }
    
  } while (cursor);
  
  // Log summary of token availability
  const marketsWithTokens = allMarkets.filter(m => m.tokens?.length > 0 || m.clobTokenIds?.length > 0);
  console.log(`[PolyClient] Markets with tokens: ${marketsWithTokens.length}/${allMarkets.length}`);
  
  return allMarkets;
}

export async function getMarket(marketId: string) {
  // Check cache
  const cached = marketCache.get(marketId);
  if (cached) return cached;
  
  const url = `${GAMMA_BASE}/markets/${marketId}`;
  const result = await rateLimit(
    'GAMMA_GENERAL',
    () => fetchWithTimeout(url),
    `getMarket(${marketId})`
  );
  
  marketCache.set(marketId, result);
  return result;
}

// ==================== CLOB API (Order Books & Prices) ====================

export async function getBook(tokenId: string) {
  // Check cache
  const cached = bookCache.get(tokenId);
  if (cached) return cached;
  
  const result = await rateLimit(
    'CLOB_BOOK',
    async () => clobClient.getOrderBook(tokenId),
    `getBook(${tokenId})`
  );
  
  bookCache.set(tokenId, result);
  return result;
}

export async function getBooks(tokenIds: string[]) {
  // For batch requests, use CLOB_BOOKS limiter
  return rateLimit(
    'CLOB_BOOKS',
    async () => {
      // Fetch individually and return as map
      const results: Record<string, any> = {};
      for (const tokenId of tokenIds) {
        const cached = bookCache.get(tokenId);
        if (cached) {
          results[tokenId] = cached;
        } else {
          const book = await clobClient.getOrderBook(tokenId);
          bookCache.set(tokenId, book);
          results[tokenId] = book;
        }
      }
      return results;
    },
    `getBooks(${tokenIds.length} tokens)`
  );
}

export async function getPrice(tokenId: string) {
  // Check cache
  const cached = priceCache.get(tokenId);
  if (cached) return cached;
  
  const result = await rateLimit(
    'CLOB_PRICE',
    async () => {
      const url = `${CLOB_HOST}/price?token_id=${tokenId}`;
      return fetchWithTimeout(url);
    },
    `getPrice(${tokenId})`
  );
  
  priceCache.set(tokenId, result);
  return result;
}

export async function getPrices(tokenIds: string[]) {
  return rateLimit(
    'CLOB_PRICES',
    async () => {
      const results: Record<string, any> = {};
      for (const tokenId of tokenIds) {
        const cached = priceCache.get(tokenId);
        if (cached) {
          results[tokenId] = cached;
        } else {
          const url = `${CLOB_HOST}/price?token_id=${tokenId}`;
          const price = await fetchWithTimeout(url);
          priceCache.set(tokenId, price);
          results[tokenId] = price;
        }
      }
      return results;
    },
    `getPrices(${tokenIds.length} tokens)`
  );
}

export async function getMidprice(tokenId: string) {
  // Check cache
  const cached = midpriceCache.get(tokenId);
  if (cached) return cached;
  
  const result = await rateLimit(
    'CLOB_MIDPRICE',
    async () => {
      const url = `${CLOB_HOST}/midpoint?token_id=${tokenId}`;
      return fetchWithTimeout(url);
    },
    `getMidprice(${tokenId})`
  );
  
  midpriceCache.set(tokenId, result);
  return result;
}

export async function getMidprices(tokenIds: string[]) {
  return rateLimit(
    'CLOB_MIDPRICE',
    async () => {
      const results: Record<string, any> = {};
      for (const tokenId of tokenIds) {
        const cached = midpriceCache.get(tokenId);
        if (cached) {
          results[tokenId] = cached;
        } else {
          const url = `${CLOB_HOST}/midpoint?token_id=${tokenId}`;
          const midprice = await fetchWithTimeout(url);
          midpriceCache.set(tokenId, midprice);
          results[tokenId] = midprice;
        }
      }
      return results;
    },
    `getMidprices(${tokenIds.length} tokens)`
  );
}

// ==================== Data API (Trades) ====================

export interface GetTradesParams {
  marketId?: string;
  assetId?: string;
  sinceTs?: number;
  limit?: number;
}

export interface GetTradesResponse {
  data?: any[];
  [key: string]: any;
}

/**
 * Fetch trades from Polymarket Data API.
 * 
 * Note: The API supports filtering by:
 * - `market` (condition_id) - returns all trades for that market
 * - `asset_id` (clob_token_id) - returns trades for specific outcome token
 * - `after` (timestamp) - only trades after this time
 */
export async function getTrades(params: GetTradesParams): Promise<GetTradesResponse> {
  const { marketId, assetId, sinceTs, limit = 100 } = params;
  const url = new URL(`${DATA_BASE}/trades`);
  
  // Try market filter first, then asset_id
  if (marketId) url.searchParams.set('market', marketId);
  if (assetId) url.searchParams.set('asset_id', assetId);
  if (sinceTs) url.searchParams.set('after', sinceTs.toString());
  url.searchParams.set('limit', limit.toString());
  
  const fullUrl = url.toString();
  console.log(`[PolyClient] getTrades URL: ${fullUrl}`);
  
  try {
    const result = await rateLimit(
      'DATA_TRADES',
      () => fetchWithTimeout(fullUrl),
      `getTrades(market=${marketId}, asset=${assetId}, since=${sinceTs})`
    );
    
    // Log response shape for debugging
    const isArray = Array.isArray(result);
    const hasData = result?.data !== undefined;
    const count = isArray ? result.length : (result?.data?.length || 0);
    console.log(`[PolyClient] getTrades response: isArray=${isArray}, hasData=${hasData}, count=${count}`);
    
    return result as GetTradesResponse;
  } catch (error: any) {
    console.error(`[PolyClient] getTrades error: ${error.message}`);
    throw error;
  }
}

// ==================== Price History ====================

export interface PriceHistoryParams {
  tokenId: string;
  startTs?: number;
  endTs?: number;
  interval?: string;
}

export async function getPriceHistory(params: PriceHistoryParams) {
  const { tokenId, startTs, endTs, interval = '1h' } = params;
  const url = new URL(`${CLOB_HOST}/prices-history`);
  
  url.searchParams.set('token_id', tokenId);
  if (startTs) url.searchParams.set('start_ts', startTs.toString());
  if (endTs) url.searchParams.set('end_ts', endTs.toString());
  url.searchParams.set('interval', interval);
  
  return rateLimit(
    'CLOB_PRICE_HISTORY',
    () => fetchWithTimeout(url.toString()),
    `getPriceHistory(${tokenId})`
  );
}

// ==================== Helper Functions ====================

/**
 * Calculate order book depth (notional value) within a price range
 */
export function calculateBookDepth(
  book: any,
  side: 'buy' | 'sell',
  fromPrice: number,
  toPrice: number
): number {
  const orders = side === 'buy' ? book.bids : book.asks;
  if (!orders || !Array.isArray(orders)) return 0;
  
  let depth = 0;
  for (const order of orders) {
    const price = parseFloat(order.price);
    const size = parseFloat(order.size);
    
    if (side === 'buy' && price >= fromPrice && price <= toPrice) {
      depth += price * size;
    } else if (side === 'sell' && price >= fromPrice && price <= toPrice) {
      depth += price * size;
    }
  }
  
  return depth;
}

/**
 * Calculate book imbalance
 */
export function calculateBookImbalance(book: any, levels = 3): number {
  const bids = book.bids?.slice(0, levels) || [];
  const asks = book.asks?.slice(0, levels) || [];
  
  let bidNotional = 0;
  let askNotional = 0;
  
  for (const bid of bids) {
    bidNotional += parseFloat(bid.price) * parseFloat(bid.size);
  }
  
  for (const ask of asks) {
    askNotional += parseFloat(ask.price) * parseFloat(ask.size);
  }
  
  const total = bidNotional + askNotional;
  if (total === 0) return 0;
  
  return (bidNotional - askNotional) / total;
}

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches() {
  bookCache.clear();
  priceCache.clear();
  midpriceCache.clear();
  marketCache.clear();
}

/**
 * Log client initialization
 */
export function logClientInit() {
  console.log('✅ Polymarket client initialized');
  console.log(`   CLOB: ${CLOB_HOST}`);
  console.log(`   Gamma: ${GAMMA_BASE}`);
  console.log(`   Data: ${DATA_BASE}`);
  console.log(`   Chain ID: ${CHAIN_ID}`);
}

