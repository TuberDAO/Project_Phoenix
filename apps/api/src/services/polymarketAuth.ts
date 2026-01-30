import { ClobClient } from '@polymarket/clob-client';
import { ethers } from 'ethers';

/**
 * Polymarket CLOB authentication and API key management.
 * Supports L1 (EOA), L2 (POLY_GNOSIS_SAFE), and L2 (PolyProxy) signature types.
 */

const CLOB_HOST = process.env.POLY_CLOB_HOST || process.env.CLOB_HOST || 'https://clob.polymarket.com';
const CHAIN_ID = parseInt(process.env.POLY_CHAIN_ID || process.env.CHAIN_ID || '137', 10);

export interface DeriveApiKeyParams {
  privateKey?: string; // Hex string with 0x prefix
  signatureType?: 0 | 1 | 2; // 0=EOA, 1=POLY_GNOSIS_SAFE, 2=POLY_PROXY
  funder?: string; // Optional funder address
}

export interface ApiKey {
  apiKey: string;
  secret: string; // aka passphrase
  passphrase: string;
}

/**
 * Derive API credentials from private key
 */
export async function deriveApiKey(params: DeriveApiKeyParams): Promise<ApiKey> {
  const { privateKey, signatureType = 0, funder } = params;
  
  if (!privateKey) {
    throw new Error('Private key is required');
  }
  
  // Create wallet from private key
  const wallet = new ethers.Wallet(privateKey);
  
  // Initialize CLOB client
  const clobClient = new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    wallet as any,
    signatureType,
    funder
  );
  
  // Derive API credentials
  const credentials = await clobClient.deriveApiKey();
  
  return {
    apiKey: credentials.apiKey,
    secret: credentials.secret,
    passphrase: credentials.secret, // alias
  };
}

/**
 * Create API key (alternative method)
 */
export async function createApiKey(params: DeriveApiKeyParams): Promise<ApiKey> {
  // For now, createApiKey is the same as deriveApiKey
  // In the future, this might use a different endpoint
  return deriveApiKey(params);
}

/**
 * Get API keys for an address
 * Note: This requires authenticated client, placeholder for now
 */
export async function getApiKeys(address: string): Promise<ApiKey[]> {
  // This would require an authenticated CLOB client call
  // Placeholder: return empty array
  console.warn('[Auth] getApiKeys not fully implemented (requires authenticated call)');
  return [];
}

/**
 * Delete API key
 * Note: This requires authenticated client, placeholder for now
 */
export async function deleteApiKey(keyId: string): Promise<void> {
  // This would require an authenticated CLOB client call
  // Placeholder: log warning
  console.warn('[Auth] deleteApiKey not fully implemented (requires authenticated call)');
}

/**
 * Validate that trading is enabled
 */
export function validateTradingEnabled(): void {
  const tradingEnabled = process.env.TRADING_ENABLED === 'true';
  if (!tradingEnabled) {
    throw new Error('Trading is not enabled. Set TRADING_ENABLED=true to use trading features.');
  }
}

/**
 * Log auth service initialization
 */
export function logAuthInit() {
  const tradingEnabled = process.env.TRADING_ENABLED === 'true';
  const dryRun = process.env.DRY_RUN !== 'false';
  
  if (tradingEnabled) {
    console.log('✅ Polymarket Auth service initialized');
    console.log(`   Trading: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   CLOB: ${CLOB_HOST}`);
    console.log(`   Chain ID: ${CHAIN_ID}`);
  } else {
    console.log('⚠️  Trading disabled (TRADING_ENABLED=false)');
  }
}

