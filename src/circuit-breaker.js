/**
 * Circuit breaker pattern implementation
 * Prevents cascading failures by failing fast when services are down
 * @module circuit-breaker
 */

import { createLogger } from './logger.js';

const log = createLogger('circuit-breaker');

/**
 * Circuit breaker states
 */
const State = {
  CLOSED: 'CLOSED',     // Normal operation, requests pass through
  OPEN: 'OPEN',         // Circuit tripped, requests fail fast
  HALF_OPEN: 'HALF_OPEN', // Testing if service is back
};

/**
 * Creates a circuit breaker wrapper for async functions
 * 
 * @param {Object} options - Circuit breaker configuration
 * @param {string} options.name - Name for logging
 * @param {number} [options.threshold=5] - Number of failures before opening circuit
 * @param {number} [options.timeout=30000] - Time in ms before trying again (half-open)
 * @param {number} [options.windowMs=60000] - Time window for counting failures
 * @param {Function} [options.isFailure] - Function to determine if error should count as failure
 * @returns {Object} Circuit breaker instance
 */
export function createCircuitBreaker(options = {}) {
  const {
    name = 'default',
    threshold = parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
    timeout = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '30000', 10),
    windowMs = 60000,
    isFailure = () => true, // By default, all errors count as failures
  } = options;

  let state = State.CLOSED;
  let failures = [];
  let lastFailureTime = 0;
  let halfOpenLock = false; // Atomic lock for half-open state

  /**
   * Clean up old failures outside the time window
   */
  function cleanupOldFailures() {
    const now = Date.now();
    failures = failures.filter(t => now - t < windowMs);
  }

  /**
   * Record a failure
   */
  function recordFailure() {
    const now = Date.now();
    failures.push(now);
    lastFailureTime = now;
    cleanupOldFailures();

    if (state === State.HALF_OPEN) {
      // Failed during recovery test, reopen circuit
      state = State.OPEN;
      log.warn({ name, state, failures: failures.length }, 'Circuit breaker reopened after half-open failure');
    } else if (state === State.CLOSED && failures.length >= threshold) {
      // Threshold exceeded, open circuit
      state = State.OPEN;
      log.warn({ name, state, failures: failures.length, threshold }, 'Circuit breaker opened');
    }
  }

  /**
   * Record a success
   */
  function recordSuccess() {
    if (state === State.HALF_OPEN) {
      // Successful call during half-open, close circuit
      state = State.CLOSED;
      failures = [];
      log.info({ name, state }, 'Circuit breaker closed after successful recovery');
    }
  }

  /**
   * Check if circuit should transition to half-open
   */
  function checkHalfOpen() {
    if (state === State.OPEN && Date.now() - lastFailureTime >= timeout) {
      state = State.HALF_OPEN;
      log.info({ name, state }, 'Circuit breaker entering half-open state');
    }
  }

  /**
   * Get current circuit breaker state
   * @returns {Object} State information
   */
  function getState() {
    cleanupOldFailures();
    return {
      name,
      state,
      failures: failures.length,
      threshold,
      timeout,
      lastFailureTime,
    };
  }

  /**
   * Wrap an async function with circuit breaker logic
   * @param {Function} fn - Async function to wrap
   * @returns {Function} Wrapped function
   */
  function wrap(fn) {
    return async function circuitBreakerWrapper(...args) {
      // Check if we should transition to half-open
      checkHalfOpen();

      // If circuit is open, fail fast
      if (state === State.OPEN) {
        const error = new Error(`Circuit breaker is OPEN for ${name}`);
        error.code = 'CIRCUIT_OPEN';
        error.circuitBreaker = getState();
        throw error;
      }

      // If half-open, only allow one request at a time (atomic check-and-increment)
      if (state === State.HALF_OPEN) {
        // Atomic check: if already locked, reject immediately
        if (halfOpenLock) {
          const error = new Error(`Circuit breaker is HALF_OPEN for ${name}, waiting for test request`);
          error.code = 'CIRCUIT_HALF_OPEN';
          error.circuitBreaker = getState();
          throw error;
        }
        halfOpenLock = true; // Claim the test slot atomically
        log.debug({ name }, 'Allowing test request in half-open state');
      }

      try {
        const result = await fn(...args);
        recordSuccess();
        return result;
      } catch (error) {
        if (isFailure(error)) {
          recordFailure();
        }
        throw error;
      } finally {
        // Release the lock if we claimed the test slot
        if (halfOpenLock) {
          halfOpenLock = false;
        }
      }
    };
  }

  /**
   * Reset the circuit breaker to closed state
   */
  function reset() {
    state = State.CLOSED;
    failures = [];
    lastFailureTime = 0;
    halfOpenLock = false;
    log.info({ name }, 'Circuit breaker reset');
  }

  return {
    wrap,
    getState,
    reset,
    State,
  };
}

/**
 * Default circuit breaker instance for Real-Debrid API
 */
export const rdCircuitBreaker = createCircuitBreaker({
  name: 'real-debrid',
  threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5', 10),
  timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '30000', 10),
  windowMs: 60000,
  isFailure: (error) => {
    // Count as failure: network errors, 5xx errors, rate limiting
    if (!error.response) return true; // Network error
    const status = error.response?.status;
    return status >= 500 || status === 429;
  },
});

export default { createCircuitBreaker, rdCircuitBreaker };
