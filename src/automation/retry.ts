/**
 * Phase 5 - Step 2: Retry Utility
 * 
 * Exponential backoff retry wrapper for automation operations.
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Execute operation with exponential backoff retry
 * 
 * @param operation - Async operation to retry
 * @param config - Retry configuration
 * @returns Result of successful operation
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error;
  let delay = config.initialDelayMs;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      if (attempt < config.maxRetries) {
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, {
          error: error.message,
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
        });
        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }
  
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
