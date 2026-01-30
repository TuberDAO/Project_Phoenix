import WebSocket from 'ws';
import { featureComputeQueue } from '../queues/definitions.js';

/**
 * Polymarket WebSocket / RTDS client for real-time market data.
 * Subscribes to order book updates, trades, and price changes.
 */

const WS_URL = process.env.POLYMARKET_WS_URL || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const WS_ENABLED = process.env.ENABLE_WEBSOCKETS !== 'false';

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isConnecting = false;

// Track processed trades to avoid duplicates
const processedTrades = new Set<string>();
const MAX_PROCESSED_CACHE = 10000;

/**
 * Normalize trade event to internal format
 */
interface NormalizedTrade {
  txHash: string;
  marketId: string;
  wallet: string;
  outcomeId: string;
  timestamp: Date;
  betUsd: number;
  side: 'buy' | 'sell';
  price: number;
  size: number;
}

function normalizeTrade(trade: any): NormalizedTrade | null {
  try {
    return {
      txHash: trade.transactionHash || trade.id || `${trade.market}-${trade.timestamp}`,
      marketId: trade.market || trade.asset_id,
      wallet: trade.maker_address?.toLowerCase() || 'unknown',
      outcomeId: trade.outcome || 'yes',
      timestamp: new Date(trade.timestamp * 1000),
      betUsd: parseFloat(trade.price) * parseFloat(trade.size),
      side: trade.side?.toLowerCase() || 'buy',
      price: parseFloat(trade.price),
      size: parseFloat(trade.size),
    };
  } catch (error) {
    console.error('[PolyWS] Failed to normalize trade:', error);
    return null;
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(data: WebSocket.Data) {
  try {
    const message = JSON.parse(data.toString());
    
    // Handle different message types
    switch (message.event_type || message.type) {
      case 'trade':
      case 'last_trade_price':
        await handleTradeEvent(message);
        break;
      
      case 'book':
      case 'book_delta':
        // Book updates - could be used for real-time liquidity monitoring
        // For now, we fetch books on-demand via REST
        break;
      
      case 'tick':
      case 'price_change':
        // Price updates - could trigger feature recomputation
        break;
      
      default:
        // Unknown message type
        break;
    }
  } catch (error) {
    console.error('[PolyWS] Error handling message:', error);
  }
}

/**
 * Handle trade event from WebSocket
 */
async function handleTradeEvent(trade: any) {
  const normalized = normalizeTrade(trade);
  if (!normalized) return;
  
  // Deduplicate by transaction hash
  if (processedTrades.has(normalized.txHash)) {
    return;
  }
  
  processedTrades.add(normalized.txHash);
  
  // Prune cache if too large
  if (processedTrades.size > MAX_PROCESSED_CACHE) {
    const toDelete = Array.from(processedTrades).slice(0, 1000);
    toDelete.forEach(hash => processedTrades.delete(hash));
  }
  
  console.log(
    `[PolyWS] New trade: ${normalized.marketId} | ` +
    `${normalized.wallet.substring(0, 8)}... | ` +
    `$${normalized.betUsd.toFixed(2)} | ` +
    `${normalized.side} @ ${normalized.price}`
  );
  
  // Enqueue for feature computation and scoring
  // The worker will check if bet already exists in DB to avoid duplicates
  await featureComputeQueue.add('ws-trade', {
    betId: normalized.txHash,
    trade: normalized,
  });
}

/**
 * Connect to WebSocket
 */
function connect() {
  if (!WS_ENABLED) {
    console.log('[PolyWS] WebSocket disabled via config');
    return;
  }
  
  if (isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
    return;
  }
  
  isConnecting = true;
  console.log(`[PolyWS] Connecting to ${WS_URL}...`);
  
  ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    isConnecting = false;
    console.log('[PolyWS] ✅ Connected to Polymarket WebSocket');
    
    // Subscribe to market channel (all markets)
    // Adjust subscription based on API documentation
    const subscribeMsg = {
      type: 'subscribe',
      channel: 'market',
      markets: ['all'], // or specific market IDs
    };
    
    ws?.send(JSON.stringify(subscribeMsg));
  });
  
  ws.on('message', handleMessage);
  
  ws.on('error', (error) => {
    console.error('[PolyWS] WebSocket error:', error.message);
  });
  
  ws.on('close', (code, reason) => {
    isConnecting = false;
    console.log(`[PolyWS] Disconnected (code: ${code}, reason: ${reason.toString()})`);
    
    // Reconnect after delay
    if (WS_ENABLED) {
      console.log('[PolyWS] Reconnecting in 5s...');
      reconnectTimer = setTimeout(connect, 5000);
    }
  });
}

/**
 * Disconnect from WebSocket
 */
export function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
  
  console.log('[PolyWS] Disconnected');
}

/**
 * Initialize WebSocket connection
 */
export function initWebSocket() {
  if (WS_ENABLED) {
    connect();
  } else {
    console.log('[PolyWS] WebSocket disabled (ENABLE_WEBSOCKETS=false)');
  }
}

/**
 * Get connection status
 */
export function getStatus() {
  return {
    enabled: WS_ENABLED,
    connected: ws?.readyState === WebSocket.OPEN,
    processedTradesCount: processedTrades.size,
  };
}

