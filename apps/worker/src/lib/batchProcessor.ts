/**
 * Batch processor with rate limiting, concurrency control, and retry logic.
 * Prevents rate limit issues while maximizing throughput.
 */

export interface BatchProcessorConfig {
  /** Max items to process per batch */
  batchSize: number;
  /** Delay between batches in ms */
  batchDelayMs: number;
  /** Max concurrent operations within a batch */
  concurrency: number;
  /** Max retry attempts per item */
  maxRetries: number;
  /** Base delay for exponential backoff in ms */
  retryBaseDelayMs: number;
  /** Max delay for exponential backoff in ms */
  retryMaxDelayMs: number;
}

export interface BatchResult<T, R> {
  item: T;
  result?: R;
  error?: Error;
  retries: number;
}

export interface BatchSummary<T, R> {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: BatchResult<T, R>[];
  durationMs: number;
}

const DEFAULT_CONFIG: BatchProcessorConfig = {
  batchSize: 20,
  batchDelayMs: 1500,
  concurrency: 3,
  maxRetries: 3,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 10000,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff with jitter
 */
function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = exponentialDelay * 0.3 * Math.random();
  return Math.min(exponentialDelay + jitter, maxDelay);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: any): boolean {
  // Retry on rate limits (429) and server errors (5xx)
  if (error?.response?.status || error?.status) {
    const status = error.response?.status || error.status;
    return status === 429 || (status >= 500 && status < 600);
  }
  
  // Retry on network errors
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
    return true;
  }
  
  // Retry on abort errors (timeout)
  if (error?.name === 'AbortError') {
    return true;
  }
  
  return false;
}

/**
 * Process a single item with retry logic
 */
async function processWithRetry<T, R>(
  item: T,
  processor: (item: T) => Promise<R>,
  config: BatchProcessorConfig
): Promise<BatchResult<T, R>> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await processor(item);
      return { item, result, retries: attempt };
    } catch (error: any) {
      lastError = error;
      
      if (attempt < config.maxRetries && isRetryableError(error)) {
        const backoff = calculateBackoff(
          attempt,
          config.retryBaseDelayMs,
          config.retryMaxDelayMs
        );
        await sleep(backoff);
        continue;
      }
      
      break;
    }
  }
  
  return { item, error: lastError, retries: config.maxRetries };
}

/**
 * Process items concurrently with a limit
 */
async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number,
  config: BatchProcessorConfig
): Promise<BatchResult<T, R>[]> {
  const results: BatchResult<T, R>[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const promise = processWithRetry(item, processor, config)
      .then(result => {
        results.push(result);
      });
    
    executing.push(promise);
    
    // If we've reached concurrency limit, wait for one to complete
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      // Remove completed promises
      const completedIndices: number[] = [];
      for (let i = 0; i < executing.length; i++) {
        const status = await Promise.race([
          executing[i].then(() => 'resolved'),
          Promise.resolve('pending')
        ]);
        if (status === 'resolved') {
          completedIndices.push(i);
        }
      }
      // Remove in reverse order to maintain indices
      for (const idx of completedIndices.reverse()) {
        executing.splice(idx, 1);
      }
    }
  }
  
  // Wait for remaining
  await Promise.all(executing);
  
  return results;
}

/**
 * Process items in batches with rate limiting and retry logic.
 * 
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param config - Optional configuration overrides
 * @param onBatchComplete - Optional callback after each batch
 * @returns Summary of processing results
 */
export async function processBatches<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  config: Partial<BatchProcessorConfig> = {},
  onBatchComplete?: (batchNum: number, totalBatches: number, batchResults: BatchResult<T, R>[]) => void
): Promise<BatchSummary<T, R>> {
  const startTime = Date.now();
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const { batchSize, batchDelayMs, concurrency } = finalConfig;
  
  const allResults: BatchResult<T, R>[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);
  
  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const batchStart = batchNum * batchSize;
    const batchEnd = Math.min(batchStart + batchSize, items.length);
    const batch = items.slice(batchStart, batchEnd);
    
    // Process batch with concurrency limit
    const batchResults = await processWithConcurrency(
      batch,
      processor,
      concurrency,
      finalConfig
    );
    
    allResults.push(...batchResults);
    
    // Notify callback
    if (onBatchComplete) {
      onBatchComplete(batchNum + 1, totalBatches, batchResults);
    }
    
    // Delay between batches (except after the last one)
    if (batchNum < totalBatches - 1) {
      await sleep(batchDelayMs);
    }
  }
  
  const succeeded = allResults.filter(r => r.result !== undefined && !r.error).length;
  const failed = allResults.filter(r => r.error !== undefined).length;
  const skipped = items.length - allResults.length;
  
  return {
    total: items.length,
    succeeded,
    failed,
    skipped,
    results: allResults,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
