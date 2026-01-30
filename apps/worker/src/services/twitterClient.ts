import { TwitterApi } from 'twitter-api-v2';
import { rateLimit } from '../rate/limiters.js';

/**
 * Twitter API client for fetching tweets.
 */

const TWITTER_BEARER = process.env.TWITTER_BEARER || '';
const TWITTER_ENABLED = process.env.TWITTER_ENABLED === 'true';

const twitterClient = TWITTER_BEARER ? new TwitterApi(TWITTER_BEARER) : null;
const readOnlyClient = twitterClient?.readOnly;

export interface TweetItem {
  source: string;
  headline: string; // Tweet text
  url: string;
  timestamp: Date;
}

/**
 * Check if Twitter client is configured
 */
export function isTwitterConfigured(): boolean {
  return TWITTER_ENABLED && !!readOnlyClient;
}

/**
 * Fetch tweets for given keywords
 */
export async function fetchTweets(
  keywords: string[],
  sinceTs: number
): Promise<TweetItem[]> {
  if (!isTwitterConfigured() || !readOnlyClient) {
    return [];
  }
  
  const query = keywords.join(' OR ');
  const sinceDate = new Date(sinceTs);
  
  try {
    const response = await rateLimit(
      'TWITTER_API',
      async () => {
        return readOnlyClient!.v2.search(query, {
          max_results: 50,
          'tweet.fields': ['created_at', 'author_id'],
          start_time: sinceDate.toISOString(),
        });
      },
      `fetchTweets(${keywords.slice(0, 2).join(', ')})`
    );
    
    if (!response.data || response.data.data.length === 0) {
      return [];
    }
    
    return response.data.data.map((tweet: any) => ({
      source: 'Twitter',
      headline: tweet.text || '',
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      timestamp: new Date(tweet.created_at),
    }));
  } catch (error: any) {
    console.error('[Twitter] Failed to fetch tweets:', error.message);
    return [];
  }
}

/**
 * Log Twitter client initialization
 */
export function logTwitterInit() {
  if (isTwitterConfigured()) {
    console.log('✅ Twitter API client initialized');
  } else if (!TWITTER_ENABLED) {
    console.log('⚠️  Twitter API disabled (TWITTER_ENABLED=false)');
  } else {
    console.log('⚠️  Twitter API not configured (TWITTER_BEARER not set)');
  }
}

