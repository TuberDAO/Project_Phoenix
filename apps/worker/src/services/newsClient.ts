import NewsAPI from 'newsapi';
import { rateLimit } from '../rate/limiters.js';

/**
 * News API client for fetching headlines.
 */

const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const NEWS_ENABLED = process.env.NEWS_ENABLED === 'true';

const newsClient = NEWS_API_KEY ? new NewsAPI(NEWS_API_KEY) : null;

export interface NewsItem {
  source: string;
  headline: string;
  url: string;
  timestamp: Date;
}

/**
 * Check if news client is configured
 */
export function isNewsConfigured(): boolean {
  return NEWS_ENABLED && !!newsClient;
}

/**
 * Fetch news headlines for given keywords
 */
export async function fetchNewsHeadlines(
  keywords: string[],
  sinceTs: number
): Promise<NewsItem[]> {
  if (!isNewsConfigured() || !newsClient) {
    return [];
  }
  
  const query = keywords.join(' OR ');
  const sinceDate = new Date(sinceTs);
  
  try {
    const response = await rateLimit(
      'NEWS_API',
      async () => {
        return newsClient!.v2.everything({
          q: query,
          from: sinceDate.toISOString(),
          sortBy: 'publishedAt',
          language: 'en',
          pageSize: 50,
        });
      },
      `fetchNews(${keywords.slice(0, 2).join(', ')})`
    );
    
    if (!response.articles || response.articles.length === 0) {
      return [];
    }
    
    return response.articles.map((article: any) => ({
      source: article.source?.name || 'Unknown',
      headline: article.title || '',
      url: article.url || '',
      timestamp: new Date(article.publishedAt),
    }));
  } catch (error: any) {
    console.error('[News] Failed to fetch headlines:', error.message);
    return [];
  }
}

/**
 * Log news client initialization
 */
export function logNewsInit() {
  if (isNewsConfigured()) {
    console.log('✅ News API client initialized');
  } else if (!NEWS_ENABLED) {
    console.log('⚠️  News API disabled (NEWS_ENABLED=false)');
  } else {
    console.log('⚠️  News API not configured (NEWS_API_KEY not set)');
  }
}

