/**
 * Export trade history for a Polymarket market via Dome API.
 * 
 * Environment Variables:
 *   DOME_API_KEY  - Required: Your Dome API key
 *   MARKET_SLUG   - Required: The market slug to query
 *   AFTER         - Optional: ISO datetime, include trades >= this time
 *   BEFORE        - Optional: ISO datetime, include trades < this time
 *   LIMIT         - Optional: Max trades to fetch (default: 5000, API max per request: 1000)
 * 
 * Run with:
 *   $env:DOME_API_KEY="your-key"
 *   $env:MARKET_SLUG="will-cz-be-pardoned"
 *   $env:AFTER="2025-01-19T00:00:00Z"
 *   $env:BEFORE="2025-01-22T00:00:00Z"
 *   pnpm -C apps/worker exec tsx src/scripts/domeExportTradeWindow.ts
 */

// Configuration from env
const DOME_API_KEY = process.env.DOME_API_KEY;
const MARKET_SLUG = process.env.MARKET_SLUG;
const AFTER = process.env.AFTER ? new Date(process.env.AFTER) : null;
const BEFORE = process.env.BEFORE ? new Date(process.env.BEFORE) : null;
const LIMIT = parseInt(process.env.LIMIT || '5000', 10);

const BASE_URL = 'https://api.domeapi.io/v1/polymarket/orders';
const PAGE_SIZE = 1000; // Dome API max per request

interface DomeTrade {
  token_id?: string;
  token_label?: string;
  side?: string;
  market_slug?: string;
  condition_id?: string;
  shares?: number;
  shares_normalized?: number;
  price?: number;
  tx_hash?: string;
  title?: string;
  timestamp?: number;
  order_hash?: string;
  user?: string;
  taker?: string;
  [key: string]: unknown;
}

interface DomeOrdersResponse {
  orders?: DomeTrade[];
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
  error?: string;
  message?: string;
}

interface HourlyBucket {
  hour: string;
  numTrades: number;
  totalNotional: number;
}

function formatTimestamp(ts: number | undefined | null): string {
  if (!ts) return 'n/a';
  try {
    return new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return 'n/a';
  }
}

function getHourKey(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toISOString().slice(0, 13) + ':00';
}

async function fetchTrades(
  startTime: number | null,
  endTime: number | null,
  maxTrades: number
): Promise<DomeTrade[]> {
  const allTrades: DomeTrade[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore && allTrades.length < maxTrades) {
    const params = new URLSearchParams();
    params.set('market_slug', MARKET_SLUG!);
    params.set('limit', Math.min(PAGE_SIZE, maxTrades - allTrades.length).toString());
    params.set('offset', offset.toString());

    if (startTime !== null) {
      params.set('start_time', startTime.toString());
    }
    if (endTime !== null) {
      params.set('end_time', endTime.toString());
    }

    const url = `${BASE_URL}?${params.toString()}`;
    
    if (offset === 0) {
      console.log(`🔍 Fetching trades from Dome API...`);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DOME_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ Dome API returned HTTP ${response.status}`);
      console.error('Response body:');
      console.error(errorBody);
      process.exit(1);
    }

    const data: DomeOrdersResponse = await response.json();

    if (data.error || data.message) {
      console.error('❌ Dome API error:', data.error || data.message);
      process.exit(1);
    }

    const orders = data.orders || [];
    allTrades.push(...orders);

    const pagination = data.pagination;
    if (pagination) {
      hasMore = pagination.has_more && orders.length > 0;
      console.log(`   Fetched ${allTrades.length} / ${Math.min(pagination.total, maxTrades)} trades...`);
    } else {
      hasMore = orders.length === PAGE_SIZE;
    }

    offset += orders.length;

    // Small delay between requests to avoid rate limiting
    if (hasMore && allTrades.length < maxTrades) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return allTrades;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Dome API - Export Trade Window');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Validate required env vars
  if (!DOME_API_KEY) {
    console.error('❌ DOME_API_KEY environment variable is required.');
    process.exit(1);
  }

  if (!MARKET_SLUG) {
    console.error('❌ MARKET_SLUG environment variable is required.');
    console.log('');
    console.log('Usage:');
    console.log('  $env:DOME_API_KEY="your-key"');
    console.log('  $env:MARKET_SLUG="market-slug-here"');
    console.log('  $env:AFTER="2025-01-19T00:00:00Z"');
    console.log('  $env:BEFORE="2025-01-22T00:00:00Z"');
    console.log('  pnpm -C apps/worker exec tsx src/scripts/domeExportTradeWindow.ts');
    process.exit(1);
  }

  // Convert ISO dates to Unix timestamps
  const startTime = AFTER ? Math.floor(AFTER.getTime() / 1000) : null;
  const endTime = BEFORE ? Math.floor(BEFORE.getTime() / 1000) : null;

  console.log('Configuration:');
  console.log(`  Market Slug: ${MARKET_SLUG}`);
  console.log(`  After:       ${AFTER ? AFTER.toISOString() : 'none'} ${startTime ? `(${startTime})` : ''}`);
  console.log(`  Before:      ${BEFORE ? BEFORE.toISOString() : 'none'} ${endTime ? `(${endTime})` : ''}`);
  console.log(`  Max Trades:  ${LIMIT}`);
  console.log(`  API Key:     ${DOME_API_KEY.slice(0, 8)}...`);
  console.log('');

  try {
    // Fetch all trades with pagination
    const trades = await fetchTrades(startTime, endTime, LIMIT);

    console.log('');
    console.log(`Total trades fetched: ${trades.length.toLocaleString()}`);
    console.log('');

    if (trades.length === 0) {
      console.log('❌ No trades found for this market/window.');
      console.log('');
      console.log('Check that:');
      console.log('  - MARKET_SLUG is correct');
      console.log('  - Time window contains trades');
      console.log('  - Market exists in Dome API');
      process.exit(0);
    }

    // Calculate notional (shares_normalized * price)
    let totalNotional = 0;
    let tradesWithNotional = 0;

    for (const t of trades) {
      if (t.shares_normalized !== undefined && t.price !== undefined) {
        const notional = t.shares_normalized * t.price;
        (t as any)._notional = notional;
        totalNotional += notional;
        tradesWithNotional++;
      }
    }

    // Get unique users
    const uniqueUsers = new Set(trades.map((t) => t.user).filter(Boolean));

    // Time range
    const timestamps = trades
      .map((t) => t.timestamp)
      .filter((ts): ts is number => ts !== undefined)
      .sort((a, b) => a - b);

    const firstTs = timestamps[0];
    const lastTs = timestamps[timestamps.length - 1];

    // Summary stats
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY STATISTICS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  Total Trades:       ${trades.length.toLocaleString()}`);
    console.log(`  Total Notional:     $${totalNotional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  Unique Users:       ${uniqueUsers.size.toLocaleString()}`);
    console.log(`  Time Range:         ${formatTimestamp(firstTs)} to ${formatTimestamp(lastTs)}`);
    console.log('');

    // Side breakdown
    const buys = trades.filter((t) => t.side === 'BUY').length;
    const sells = trades.filter((t) => t.side === 'SELL').length;
    console.log(`  Buys:               ${buys.toLocaleString()} (${((buys / trades.length) * 100).toFixed(1)}%)`);
    console.log(`  Sells:              ${sells.toLocaleString()} (${((sells / trades.length) * 100).toFixed(1)}%)`);
    console.log('');

    // Top 30 trades by notional
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TOP 30 TRADES BY SIZE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Timestamp           | Side | Price  | Shares   | Notional   | User');
    console.log('  --------------------|------|--------|----------|------------|------------------------');

    const sortedTrades = [...trades]
      .sort((a, b) => ((b as any)._notional || 0) - ((a as any)._notional || 0))
      .slice(0, 30);

    for (const t of sortedTrades) {
      const ts = formatTimestamp(t.timestamp);
      const side = (t.side || 'n/a').padEnd(4);
      const price = t.price !== undefined ? t.price.toFixed(4).padStart(6) : '  n/a ';
      const shares = t.shares_normalized !== undefined
        ? t.shares_normalized.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(8)
        : '     n/a';
      const notional = (t as any)._notional !== undefined
        ? ('$' + (t as any)._notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).padStart(10)
        : '       n/a';
      const user = t.user ? t.user.slice(0, 24) : 'n/a';

      console.log(`  ${ts} | ${side} | ${price} | ${shares} | ${notional} | ${user}`);
    }

    console.log('');

    // Hourly buckets
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  HOURLY AGGREGATION');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Hour (UTC)         | Trades | Total Notional');
    console.log('  -------------------|--------|----------------');

    const hourlyBuckets = new Map<string, HourlyBucket>();

    for (const t of trades) {
      if (!t.timestamp) continue;

      const hourKey = getHourKey(t.timestamp);
      let bucket = hourlyBuckets.get(hourKey);
      if (!bucket) {
        bucket = { hour: hourKey, numTrades: 0, totalNotional: 0 };
        hourlyBuckets.set(hourKey, bucket);
      }

      bucket.numTrades++;
      if ((t as any)._notional !== undefined) {
        bucket.totalNotional += (t as any)._notional;
      }
    }

    // Sort by hour
    const sortedHours = [...hourlyBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [hourKey, bucket] of sortedHours) {
      const hour = hourKey.replace('T', ' ');
      const numTrades = bucket.numTrades.toString().padStart(6);
      const notional = ('$' + bucket.totalNotional.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })).padStart(14);

      console.log(`  ${hour} | ${numTrades} | ${notional}`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

    // Quick stats
    console.log('');
    console.log('Quick stats for analysis:');
    console.log(`  Market: ${MARKET_SLUG}`);
    console.log(`  Window: ${AFTER?.toISOString() || 'start'} to ${BEFORE?.toISOString() || 'end'}`);
    console.log(`  Trades: ${trades.length} | Notional: $${totalNotional.toFixed(0)} | Users: ${uniqueUsers.size}`);
    console.log('');

  } catch (err: any) {
    console.error('❌ Request failed:', err.message);
    process.exit(1);
  }
}

main();
