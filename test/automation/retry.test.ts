/**
 * Phase 5 - Step 2: Retry Utility Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../src/automation/retry';

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(operation, {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockResolvedValue('success');
    
    const result = await withRetry(operation, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should throw last error after all retries exhausted', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
    
    await expect(
      withRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      })
    ).rejects.toThrow('Always fails');
    
    expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should apply exponential backoff', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');
    
    const startTime = Date.now();
    
    await withRetry(operation, {
      maxRetries: 2,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });
    
    const duration = Date.now() - startTime;
    
    // Should wait at least 100ms + 200ms = 300ms
    expect(duration).toBeGreaterThanOrEqual(300);
  });

  it('should cap delay at maxDelayMs', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');
    
    const startTime = Date.now();
    
    await withRetry(operation, {
      maxRetries: 2,
      initialDelayMs: 1000,
      maxDelayMs: 500, // Cap at 500ms
      backoffMultiplier: 2,
    });
    
    const duration = Date.now() - startTime;
    
    // Should wait 500ms + 500ms (capped) = 1000ms, not 1000ms + 2000ms
    // Allow some tolerance for test execution time
    expect(duration).toBeLessThan(1600);
  });

  it('should handle zero retries', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Fail'));
    
    await expect(
      withRetry(operation, {
        maxRetries: 0,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      })
    ).rejects.toThrow('Fail');
    
    expect(operation).toHaveBeenCalledTimes(1); // Only initial attempt
  });

  it('should preserve error details', async () => {
    const customError = new Error('Custom error');
    (customError as any).code = 'CUSTOM_CODE';
    (customError as any).details = { foo: 'bar' };
    
    const operation = vi.fn().mockRejectedValue(customError);
    
    try {
      await withRetry(operation, {
        maxRetries: 1,
        initialDelayMs: 10,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.details).toEqual({ foo: 'bar' });
    }
  });

  it('should work with async operations', async () => {
    let attempt = 0;
    const operation = async () => {
      attempt++;
      if (attempt < 3) {
        throw new Error(`Attempt ${attempt} failed`);
      }
      return 'success';
    };
    
    const result = await withRetry(operation, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
    });
    
    expect(result).toBe('success');
    expect(attempt).toBe(3);
  });
});
