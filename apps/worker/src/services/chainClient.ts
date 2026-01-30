/**
 * Chain RPC client for enriching bet data with on-chain transaction details.
 * 
 * Fetches blockNumber and computes gasPriorityFlag from real transaction data.
 * 
 * Environment Variables:
 * - CHAIN_RPC_URL: Polygon RPC endpoint (required if enrichment enabled)
 * - CHAIN_ENRICHMENT_ENABLED: "true" to enable, defaults to "false"
 * - CHAIN_GAS_PRIORITY_MULTIPLIER: Gas price multiplier threshold (default: 1.3)
 * - CHAIN_ENRICHMENT_CONCURRENCY: Max concurrent RPC calls (default: 3)
 */

import { JsonRpcProvider, type TransactionReceipt, type TransactionResponse } from 'ethers';

// ==================== Configuration ====================

const CHAIN_RPC_URL = process.env.CHAIN_RPC_URL || '';
const CHAIN_ENRICHMENT_ENABLED = process.env.CHAIN_ENRICHMENT_ENABLED === 'true';
const CHAIN_GAS_PRIORITY_MULTIPLIER = parseFloat(process.env.CHAIN_GAS_PRIORITY_MULTIPLIER || '1.3');
const CHAIN_ENRICHMENT_CONCURRENCY = parseInt(process.env.CHAIN_ENRICHMENT_CONCURRENCY || '3', 10);

// ==================== Types ====================

export interface ChainEnrichmentResult {
  blockNumber: number;
  gasPriorityFlag: boolean;
  effectiveGasPrice?: bigint;
  baseFeePerGas?: bigint;
}

interface PendingRequest {
  promise: Promise<ChainEnrichmentResult>;
  timestamp: number;
}

// ==================== State ====================

let provider: JsonRpcProvider | null = null;
let initialized = false;

// Cache: txHash -> enrichment result (prevents duplicate RPC calls)
const enrichmentCache = new Map<string, ChainEnrichmentResult>();

// In-flight requests to prevent duplicate concurrent fetches
const pendingRequests = new Map<string, PendingRequest>();

// Concurrency control
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

// Rolling baseline for gas comparison (updated periodically)
let gasBaseline: bigint | null = null;
let baselineLastUpdated = 0;
const BASELINE_UPDATE_INTERVAL_MS = 30_000; // 30 seconds

// ==================== Initialization ====================

/**
 * Check if chain enrichment is enabled and properly configured.
 */
export function isChainEnrichmentEnabled(): boolean {
  return CHAIN_ENRICHMENT_ENABLED;
}

/**
 * Initialize the chain client. Call once at worker startup.
 * Throws if enrichment is enabled but RPC URL is missing.
 */
export function initChainClient(): void {
  if (initialized) return;

  console.log('[ChainEnrich] Initializing chain client...');
  console.log(`[ChainEnrich]   CHAIN_ENRICHMENT_ENABLED: ${CHAIN_ENRICHMENT_ENABLED}`);

  if (!CHAIN_ENRICHMENT_ENABLED) {
    console.log('[ChainEnrich] ⚠️  Chain enrichment disabled (CHAIN_ENRICHMENT_ENABLED != "true")');
    console.log('[ChainEnrich]   Bets will have blockNumber=0, gasPriorityFlag=false');
    initialized = true;
    return;
  }

  if (!CHAIN_RPC_URL) {
    throw new Error(
      '[ChainEnrich] FATAL: CHAIN_ENRICHMENT_ENABLED=true but CHAIN_RPC_URL is not set.\n' +
      '  Set CHAIN_RPC_URL to a Polygon RPC endpoint (e.g., https://polygon-rpc.com)\n' +
      '  Or set CHAIN_ENRICHMENT_ENABLED=false to disable enrichment.'
    );
  }

  try {
    provider = new JsonRpcProvider(CHAIN_RPC_URL, 137); // Polygon chainId
    console.log('[ChainEnrich] ✅ Chain client initialized');
    console.log(`[ChainEnrich]   RPC: ${CHAIN_RPC_URL.substring(0, 40)}...`);
    console.log(`[ChainEnrich]   Gas priority multiplier: ${CHAIN_GAS_PRIORITY_MULTIPLIER}x`);
    console.log(`[ChainEnrich]   Concurrency limit: ${CHAIN_ENRICHMENT_CONCURRENCY}`);
  } catch (error: any) {
    throw new Error(`[ChainEnrich] Failed to initialize provider: ${error.message}`);
  }

  initialized = true;
}

// ==================== Concurrency Control ====================

async function acquireSlot(): Promise<void> {
  if (activeRequests < CHAIN_ENRICHMENT_CONCURRENCY) {
    activeRequests++;
    return;
  }

  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests--;
  const next = requestQueue.shift();
  if (next) next();
}

// ==================== Gas Baseline ====================

/**
 * Update gas baseline from recent block.
 * Uses baseFeePerGas from the latest block as reference.
 */
async function updateGasBaseline(): Promise<void> {
  if (!provider) return;

  const now = Date.now();
  if (gasBaseline && now - baselineLastUpdated < BASELINE_UPDATE_INTERVAL_MS) {
    return; // Baseline still fresh
  }

  try {
    const block = await provider.getBlock('latest');
    if (block?.baseFeePerGas) {
      gasBaseline = block.baseFeePerGas;
      baselineLastUpdated = now;
      console.log(`[ChainEnrich] Updated gas baseline: ${gasBaseline} wei (block ${block.number})`);
    }
  } catch (error: any) {
    console.warn(`[ChainEnrich] Failed to update gas baseline: ${error.message}`);
    // Keep using old baseline if available
  }
}

// ==================== Main Enrichment Function ====================

/**
 * Enrich a bet with on-chain transaction data.
 * 
 * @param txHash - Transaction hash (0x...)
 * @returns Enrichment result with blockNumber and gasPriorityFlag
 */
export async function enrichBetFromChain(txHash: string): Promise<ChainEnrichmentResult> {
  // Default fallback
  const fallback: ChainEnrichmentResult = {
    blockNumber: 0,
    gasPriorityFlag: false,
  };

  // If disabled, return fallback immediately
  if (!CHAIN_ENRICHMENT_ENABLED || !provider) {
    return fallback;
  }

  // Normalize txHash
  const normalizedHash = txHash.toLowerCase();

  // Check cache first
  const cached = enrichmentCache.get(normalizedHash);
  if (cached) {
    return cached;
  }

  // Check if request is already in-flight
  const pending = pendingRequests.get(normalizedHash);
  if (pending) {
    return pending.promise;
  }

  // Create new request
  const requestPromise = (async (): Promise<ChainEnrichmentResult> => {
    await acquireSlot();

    try {
      // Update baseline periodically
      await updateGasBaseline();

      // Fetch transaction receipt (has blockNumber + effectiveGasPrice)
      const receipt = await provider!.getTransactionReceipt(normalizedHash);

      if (!receipt) {
        console.warn(`[ChainEnrich] No receipt for ${normalizedHash.slice(0, 18)}... (tx may be pending)`);
        return fallback;
      }

      const blockNumber = receipt.blockNumber;
      const effectiveGasPrice = receipt.gasPrice; // In ethers v6, receipt.gasPrice is effectiveGasPrice

      // Compute gasPriorityFlag
      let gasPriorityFlag = false;

      if (effectiveGasPrice && gasBaseline) {
        // Compare effective gas price to baseline * multiplier
        const threshold = (gasBaseline * BigInt(Math.floor(CHAIN_GAS_PRIORITY_MULTIPLIER * 100))) / 100n;
        gasPriorityFlag = effectiveGasPrice >= threshold;
      } else if (effectiveGasPrice) {
        // Fallback: fetch block to get baseFeePerGas
        try {
          const block = await provider!.getBlock(blockNumber);
          if (block?.baseFeePerGas) {
            const threshold = (block.baseFeePerGas * BigInt(Math.floor(CHAIN_GAS_PRIORITY_MULTIPLIER * 100))) / 100n;
            gasPriorityFlag = effectiveGasPrice >= threshold;
          }
        } catch (blockError: any) {
          console.warn(`[ChainEnrich] Failed to fetch block ${blockNumber}: ${blockError.message}`);
        }
      }

      const result: ChainEnrichmentResult = {
        blockNumber,
        gasPriorityFlag,
        effectiveGasPrice: effectiveGasPrice ?? undefined,
        baseFeePerGas: gasBaseline ?? undefined,
      };

      // Cache result
      enrichmentCache.set(normalizedHash, result);

      // Log success
      const gasGwei = effectiveGasPrice ? (Number(effectiveGasPrice) / 1e9).toFixed(2) : 'N/A';
      const baseGwei = gasBaseline ? (Number(gasBaseline) / 1e9).toFixed(2) : 'N/A';
      console.log(
        `[ChainEnrich] ${normalizedHash.slice(0, 18)}... block=${blockNumber} ` +
        `gas=${gasGwei}gwei base=${baseGwei}gwei priority=${gasPriorityFlag}`
      );

      return result;
    } catch (error: any) {
      console.error(`[ChainEnrich] Failed to enrich ${normalizedHash.slice(0, 18)}...: ${error.message}`);
      return fallback;
    } finally {
      releaseSlot();
      pendingRequests.delete(normalizedHash);
    }
  })();

  pendingRequests.set(normalizedHash, {
    promise: requestPromise,
    timestamp: Date.now(),
  });

  return requestPromise;
}

// ==================== Cache Management ====================

/**
 * Get cache statistics for monitoring.
 */
export function getChainEnrichmentStats(): {
  enabled: boolean;
  cacheSize: number;
  pendingRequests: number;
  activeRequests: number;
  queuedRequests: number;
  gasBaseline: string | null;
} {
  return {
    enabled: CHAIN_ENRICHMENT_ENABLED,
    cacheSize: enrichmentCache.size,
    pendingRequests: pendingRequests.size,
    activeRequests,
    queuedRequests: requestQueue.length,
    gasBaseline: gasBaseline ? `${(Number(gasBaseline) / 1e9).toFixed(2)} gwei` : null,
  };
}

/**
 * Clear the enrichment cache.
 * Useful for testing or memory management.
 */
export function clearEnrichmentCache(): void {
  enrichmentCache.clear();
  console.log('[ChainEnrich] Cache cleared');
}

/**
 * Log chain client initialization status.
 */
export function logChainClientInit(): void {
  if (CHAIN_ENRICHMENT_ENABLED) {
    if (provider) {
      console.log('✅ Chain enrichment enabled (Polygon RPC)');
    } else {
      console.log('❌ Chain enrichment enabled but provider not initialized');
    }
  } else {
    console.log('⚠️  Chain enrichment disabled (set CHAIN_ENRICHMENT_ENABLED=true to enable)');
  }
}
