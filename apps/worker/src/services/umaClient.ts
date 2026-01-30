import { rateLimit } from '../rate/limiters.js';

/**
 * UMA Protocol client for oracle timing data.
 * Queries UMA subgraph for resolution events and oracle requests.
 */

const UMA_SUBGRAPH_URL = process.env.UMA_SUBGRAPH_URL || '';

/**
 * Check if UMA client is configured
 */
export function isUmaConfigured(): boolean {
  return !!UMA_SUBGRAPH_URL;
}

/**
 * GraphQL query helper
 */
async function querySubgraph(query: string, variables: Record<string, any> = {}) {
  if (!UMA_SUBGRAPH_URL) {
    throw new Error('UMA_SUBGRAPH_URL not configured');
  }
  
  return rateLimit(
    'UMA_SUBGRAPH',
    async () => {
      const response = await fetch(UMA_SUBGRAPH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
      
      if (!response.ok) {
        throw new Error(`UMA Subgraph error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.errors) {
        throw new Error(`UMA Subgraph query error: ${JSON.stringify(data.errors)}`);
      }
      
      return data.data;
    },
    'querySubgraph'
  );
}

/**
 * Get resolution events for a market
 */
export interface ResolutionEvent {
  id: string;
  timestamp: number;
  eventType: 'request' | 'proposal' | 'dispute' | 'settlement';
  requestTimestamp?: number;
  proposalTimestamp?: number;
}

export interface OracleEvents {
  requestTs?: number;
  proposalTs?: number;
  disputeTs?: number;
}

export interface GetResolutionEventsParams {
  marketId?: string;
  questionId?: string;
  sinceTs?: number;
}

export async function getResolutionEvents(
  params: GetResolutionEventsParams
): Promise<ResolutionEvent[]> {
  if (!isUmaConfigured()) {
    console.warn('[UMA] Subgraph not configured, returning empty events');
    return [];
  }
  
  const { marketId, questionId, sinceTs } = params;
  
  // Build GraphQL query based on parameters
  // This is a stub - adjust based on actual UMA subgraph schema
  const query = `
    query GetResolutionEvents($questionId: String, $sinceTs: Int) {
      priceRequests(
        where: {
          identifier_contains: $questionId
          requestTimestamp_gte: $sinceTs
        }
        orderBy: requestTimestamp
        orderDirection: desc
      ) {
        id
        requestTimestamp
        proposalTimestamp
        disputeTimestamp
        settlementTimestamp
      }
    }
  `;
  
  try {
    const data = await querySubgraph(query, {
      questionId: questionId || marketId,
      sinceTs: sinceTs || 0,
    });
    
    const events: ResolutionEvent[] = [];
    
    for (const request of data.priceRequests || []) {
      if (request.requestTimestamp) {
        events.push({
          id: `${request.id}-request`,
          timestamp: request.requestTimestamp,
          eventType: 'request',
          requestTimestamp: request.requestTimestamp,
        });
      }
      
      if (request.proposalTimestamp) {
        events.push({
          id: `${request.id}-proposal`,
          timestamp: request.proposalTimestamp,
          eventType: 'proposal',
          proposalTimestamp: request.proposalTimestamp,
        });
      }
      
      if (request.disputeTimestamp) {
        events.push({
          id: `${request.id}-dispute`,
          timestamp: request.disputeTimestamp,
          eventType: 'dispute',
        });
      }
      
      if (request.settlementTimestamp) {
        events.push({
          id: `${request.id}-settlement`,
          timestamp: request.settlementTimestamp,
          eventType: 'settlement',
        });
      }
    }
    
    return events.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error('[UMA] Failed to fetch resolution events:', error);
    return [];
  }
}

/**
 * Get closest oracle events (request, proposal, dispute) around a timestamp
 */
export async function getClosestOracleEvents(
  marketId: string,
  aroundTs: number
): Promise<OracleEvents> {
  if (!isUmaConfigured()) {
    return {};
  }
  
  try {
    // Query events in a wide window around the bet
    const windowSec = 7 * 24 * 3600; // ±7 days
    const events = await getResolutionEvents({
      marketId,
      sinceTs: aroundTs - windowSec,
    });
    
    const result: OracleEvents = {};
    let minRequestDist = Infinity;
    let minProposalDist = Infinity;
    let minDisputeDist = Infinity;
    
    for (const event of events) {
      const dist = Math.abs(event.timestamp - aroundTs);
      
      if (event.eventType === 'request' && event.requestTimestamp) {
        const reqDist = Math.abs(event.requestTimestamp - aroundTs);
        if (reqDist < minRequestDist) {
          minRequestDist = reqDist;
          result.requestTs = event.requestTimestamp;
        }
      }
      
      if (event.eventType === 'proposal' && event.proposalTimestamp) {
        const propDist = Math.abs(event.proposalTimestamp - aroundTs);
        if (propDist < minProposalDist) {
          minProposalDist = propDist;
          result.proposalTs = event.proposalTimestamp;
        }
      }
      
      if (event.eventType === 'dispute') {
        if (dist < minDisputeDist) {
          minDisputeDist = dist;
          result.disputeTs = event.timestamp;
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('[UMA] Failed to get closest oracle events:', error);
    return {};
  }
}

/**
 * Get oracle proximity (seconds to nearest oracle event)
 */
export async function getOracleProximity(
  marketId: string,
  currentTimestamp: number
): Promise<number> {
  const events = await getClosestOracleEvents(marketId, currentTimestamp);
  
  const distances: number[] = [];
  if (events.requestTs) distances.push(Math.abs(events.requestTs - currentTimestamp));
  if (events.proposalTs) distances.push(Math.abs(events.proposalTs - currentTimestamp));
  if (events.disputeTs) distances.push(Math.abs(events.disputeTs - currentTimestamp));
  
  if (distances.length === 0) {
    return 999999; // No known events
  }
  
  return Math.min(...distances);
}

/**
 * Log UMA client initialization
 */
export function logUmaInit() {
  if (isUmaConfigured()) {
    console.log('✅ UMA client initialized');
    console.log(`   Subgraph: ${UMA_SUBGRAPH_URL.substring(0, 50)}...`);
  } else {
    console.log('⚠️  UMA client not configured (UMA_SUBGRAPH_URL not set)');
    console.log('   Oracle proximity features will use default values');
  }
}

