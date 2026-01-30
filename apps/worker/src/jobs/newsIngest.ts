import { PrismaClient } from '@prisma/client';
import { fetchNewsHeadlines, isNewsConfigured } from '../services/newsClient.js';
import { fetchTweets, isTwitterConfigured } from '../services/twitterClient.js';

const prisma = new PrismaClient();

/**
 * Ingest news and social media posts for open markets.
 * Called periodically (e.g., every 60 seconds).
 */
export async function ingestNewsForMarkets() {
  console.log('[NewsIngest] Starting news ingestion cycle...');
  
  if (!isNewsConfigured() && !isTwitterConfigured()) {
    console.log('[NewsIngest] No news/social APIs configured, skipping');
    return;
  }
  
  try {
    // Get open markets
    const markets = await prisma.market.findMany({
      where: { status: 'open' },
      take: 20, // Process first 20 to avoid rate limits
    });
    
    console.log(`[NewsIngest] Processing ${markets.length} open markets`);
    
    // Check last run time from a simple KV store or use 5 minutes ago as default
    const sinceTs = Date.now() - 5 * 60 * 1000; // Last 5 minutes
    
    let totalItems = 0;
    
    for (const market of markets) {
      try {
        // Build keywords from question and metadata
        const keywords = extractKeywords(market.question, market.category);
        
        if (keywords.length === 0) {
          continue;
        }
        
        // Fetch news
        const newsItems = isNewsConfigured()
          ? await fetchNewsHeadlines(keywords, sinceTs)
          : [];
        
        // Fetch tweets
        const tweets = isTwitterConfigured()
          ? await fetchTweets(keywords, sinceTs)
          : [];
        
        const allItems = [...newsItems, ...tweets];
        
        if (allItems.length === 0) {
          continue;
        }
        
        console.log(`[NewsIngest] Market ${market.id}: ${allItems.length} items (${newsItems.length} news, ${tweets.length} tweets)`);
        
        // Upsert news events
        for (const item of allItems) {
          try {
            // Calculate match score (simple keyword matching)
            const matchScore = calculateMatchScore(item.headline, market.question);
            
            // Volume score (1.0 for now, could weight by source authority)
            const volumeScore = 1.0;
            
            await prisma.newsEvent.upsert({
              where: {
                // Composite key: url is unique enough
                url: item.url,
              },
              update: {
                volumeScore,
                matchScore,
              },
              create: {
                marketId: market.id,
                source: item.source,
                headline: item.headline,
                url: item.url,
                timestamp: item.timestamp,
                volumeScore,
                matchScore,
              },
            });
            
            totalItems++;
          } catch (itemError: any) {
            // Skip duplicates or errors
            if (!itemError.message.includes('Unique constraint')) {
              console.error(`[NewsIngest] Failed to upsert item:`, itemError.message);
            }
          }
        }
      } catch (marketError: any) {
        console.error(`[NewsIngest] Failed to process market ${market.id}:`, marketError.message);
      }
    }
    
    console.log(`[NewsIngest] Ingestion complete: ${totalItems} items upserted`);
  } catch (error: any) {
    console.error('[NewsIngest] Ingestion failed:', error.message);
    throw error;
  }
}

/**
 * Extract keywords from question and category
 */
function extractKeywords(question: string, category?: string | null): string[] {
  const keywords: string[] = [];
  
  // Extract quoted terms
  const quoted = question.match(/"([^"]+)"/g);
  if (quoted) {
    keywords.push(...quoted.map(q => q.replace(/"/g, '')));
  }
  
  // Extract significant words (> 4 chars, not common words)
  const words = question.toLowerCase().split(/\s+/);
  const stopWords = new Set(['will', 'does', 'what', 'when', 'where', 'who', 'which', 'this', 'that', 'than', 'then', 'there', 'their', 'them', 'these', 'those', 'with', 'from', 'into', 'during', 'before', 'after', 'above', 'below', 'between']);
  
  for (const word of words) {
    const clean = word.replace(/[^a-z0-9]/g, '');
    if (clean.length > 4 && !stopWords.has(clean)) {
      keywords.push(clean);
    }
  }
  
  // Add category if present
  if (category) {
    keywords.push(category.toLowerCase());
  }
  
  // Deduplicate and limit to top 5
  return Array.from(new Set(keywords)).slice(0, 5);
}

/**
 * Calculate match score between headline and question
 */
function calculateMatchScore(headline: string, question: string): number {
  const headlineWords = new Set(headline.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')));
  const questionWords = question.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => w.length > 3);
  
  if (questionWords.length === 0) return 0;
  
  let matches = 0;
  for (const word of questionWords) {
    if (headlineWords.has(word)) {
      matches++;
    }
  }
  
  return matches / questionWords.length;
}

