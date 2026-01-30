/**
 * Search Polymarket markets via Dome API.
 * 
 * Environment Variables:
 *   DOME_API_KEY  - Required: Your Dome API key
 *   SEARCH        - Optional: Search keywords (default: "cz pardon binance changpeng zhao")
 *   LIMIT         - Optional: Max results (default: 20, max: 100)
 * 
 * Run with:
 *   $env:DOME_API_KEY="your-key"
 *   pnpm -C apps/worker exec tsx src/scripts/domeFindMarkets.ts
 */

// Configuration from env
const DOME_API_KEY = process.env.DOME_API_KEY;
const SEARCH = process.env.SEARCH || 'cz pardon binance changpeng zhao';
const LIMIT = parseInt(process.env.LIMIT || '20', 10);
const STATUS = process.env.STATUS || 'closed'; // 'open' or 'closed' - required when using search

const BASE_URL = 'https://api.domeapi.io/v1/polymarket/markets';

interface DomeMarket {
  market_slug?: string;
  condition_id?: string;
  title?: string;
  start_time?: number;
  end_time?: number;
  close_time?: number;
  completed_time?: number;
  game_start_time?: string;
  tags?: string[];
  volume_total?: number;
  volume_1_week?: number;
  volume_1_month?: number;
  status?: string;
  side_a?: { id: string; label: string };
  side_b?: { id: string; label: string };
  winning_side?: string | null;
  [key: string]: unknown;
}

interface DomeMarketsResponse {
  markets?: DomeMarket[];
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
  error?: string;
  message?: string;
}

function formatTimestamp(ts: number | undefined | null): string {
  if (!ts) return 'n/a';
  try {
    return new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return 'n/a';
  }
}

function formatVolume(vol: number | undefined | null): string {
  if (vol === undefined || vol === null) return 'n/a';
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Dome API - Find Polymarket Markets');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Validate API key
  if (!DOME_API_KEY) {
    console.error('❌ DOME_API_KEY environment variable is required.');
    console.log('');
    console.log('Usage:');
    console.log('  $env:DOME_API_KEY="your-dome-api-key"');
    console.log('  pnpm -C apps/worker exec tsx src/scripts/domeFindMarkets.ts');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Search:  "${SEARCH}"`);
  console.log(`  Status:  ${STATUS}`);
  console.log(`  Limit:   ${LIMIT}`);
  console.log(`  API Key: ${DOME_API_KEY.slice(0, 8)}...`);
  console.log('');

  // Build URL with search parameter (status is required when using search)
  const params = new URLSearchParams();
  params.set('search', SEARCH);
  params.set('status', STATUS);
  params.set('limit', Math.min(LIMIT, 100).toString());

  const url = `${BASE_URL}?${params.toString()}`;
  console.log(`🔍 Fetching: ${BASE_URL}?search=${encodeURIComponent(SEARCH)}&status=${STATUS}&limit=${LIMIT}`);
  console.log('');

  try {
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

    const data: DomeMarketsResponse = await response.json();

    if (data.error || data.message) {
      console.error('❌ Dome API error:', data.error || data.message);
      process.exit(1);
    }

    const markets = data.markets || [];
    const pagination = data.pagination;

    console.log(`Found ${markets.length} markets`);
    if (pagination) {
      console.log(`Total matching: ${pagination.total} | Has more: ${pagination.has_more}`);
    }
    console.log('');

    if (markets.length === 0) {
      console.log('❌ No markets found matching the search criteria.');
      console.log('');
      console.log('Try different keywords or check the Dome API status.');
      process.exit(0);
    }

    // Print table
    console.log('───────────────────────────────────────────────────────────────────────────────────────────────────');
    console.log('  #  | Volume      | Status  | End Time            | Market Slug / Title');
    console.log('───────────────────────────────────────────────────────────────────────────────────────────────────');

    for (let i = 0; i < markets.length; i++) {
      const m = markets[i];
      const num = (i + 1).toString().padStart(3);
      const volume = formatVolume(m.volume_total).padStart(11);
      const status = (m.status || 'n/a').padEnd(7);
      const endTime = formatTimestamp(m.end_time);
      const slug = m.market_slug || 'n/a';
      const title = m.title || 'n/a';

      console.log(`  ${num} | ${volume} | ${status} | ${endTime} | ${slug}`);
      console.log(`      |             |         |                     | ${title.slice(0, 70)}${title.length > 70 ? '...' : ''}`);
    }

    console.log('───────────────────────────────────────────────────────────────────────────────────────────────────');
    console.log('');

    // Print detailed JSON for top 5
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  DETAILED INFO (Top 5)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    const topN = Math.min(5, markets.length);
    for (let i = 0; i < topN; i++) {
      const m = markets[i];
      console.log(`#${i + 1} ──────────────────────────────────────────────────────────`);
      console.log('');
      console.log(JSON.stringify(m, null, 2));
      console.log('');
    }

    // Print next steps
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Next step: Pick a MARKET_SLUG from above and run:');
    console.log('');
    console.log('  $env:DOME_API_KEY="your-key"');
    console.log('  $env:MARKET_SLUG="<market_slug>"');
    console.log('  $env:AFTER="2025-01-19T00:00:00Z"');
    console.log('  $env:BEFORE="2025-01-22T00:00:00Z"');
    console.log('  pnpm -C apps/worker exec tsx src/scripts/domeExportTradeWindow.ts');
    console.log('');

  } catch (err: any) {
    console.error('❌ Request failed:', err.message);
    process.exit(1);
  }
}

main();
