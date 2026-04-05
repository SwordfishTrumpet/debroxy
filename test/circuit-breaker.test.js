/**
 * Circuit breaker unit tests
 * Tests for circuit breaker pattern implementation
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createCircuitBreaker } from '../src/circuit-breaker.js';

describe('circuit-breaker', () => {
  describe('createCircuitBreaker', () => {
    it('should create circuit breaker with default options', () => {
      const cb = createCircuitBreaker({ name: 'test' });
      const state = cb.getState();
      
      assert.strictEqual(state.name, 'test');
      assert.strictEqual(state.state, 'CLOSED');
      assert.strictEqual(state.failures, 0);
    });

    it('should create circuit breaker with custom options', () => {
      const cb = createCircuitBreaker({ 
        name: 'custom',
        threshold: 3,
        timeout: 5000,
      });
      const state = cb.getState();
      
      assert.strictEqual(state.threshold, 3);
      assert.strictEqual(state.timeout, 5000);
    });
  });

  describe('wrap', () => {
    let cb;

    beforeEach(() => {
      cb = createCircuitBreaker({ 
        name: 'test',
        threshold: 3,
        timeout: 100,
        windowMs: 10000,
      });
    });

    it('should pass through successful calls', async () => {
      const wrapped = cb.wrap(async () => 'success');
      const result = await wrapped();
      
      assert.strictEqual(result, 'success');
      assert.strictEqual(cb.getState().state, 'CLOSED');
    });

    it('should record failures but not open until threshold', async () => {
      const failing = cb.wrap(async () => { throw new Error('fail'); });
      
      // First two failures - circuit should still be closed
      for (let i = 0; i < 2; i++) {
        await assert.rejects(failing);
      }
      
      assert.strictEqual(cb.getState().state, 'CLOSED');
      assert.strictEqual(cb.getState().failures, 2);
    });

    it('should open circuit after threshold failures', async () => {
      const failing = cb.wrap(async () => { throw new Error('fail'); });
      
      // Trigger threshold failures
      for (let i = 0; i < 3; i++) {
        await assert.rejects(failing);
      }
      
      assert.strictEqual(cb.getState().state, 'OPEN');
    });

    it('should fail fast when circuit is open', async () => {
      const failing = cb.wrap(async () => { throw new Error('fail'); });
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await assert.rejects(failing);
      }
      
      // Now it should fail fast without calling the function
      const callCount = { value: 0 };
      const wrapped = cb.wrap(async () => {
        callCount.value++;
        return 'success';
      });
      
      await assert.rejects(async () => wrapped(), {
        message: /Circuit breaker is OPEN/,
      });
      
      assert.strictEqual(callCount.value, 0);
    });

    it('should transition to half-open after timeout', async () => {
      const failing = cb.wrap(async () => { throw new Error('fail'); });
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await assert.rejects(failing);
      }
      
      assert.strictEqual(cb.getState().state, 'OPEN');
      
      // Wait for timeout
      await new Promise(r => setTimeout(r, 150));
      
      // Next call should be allowed (half-open test)
      const success = cb.wrap(async () => 'recovered');
      const result = await success();
      
      assert.strictEqual(result, 'recovered');
      assert.strictEqual(cb.getState().state, 'CLOSED');
    });

    it('should reopen circuit if half-open test fails', async () => {
      const failing = cb.wrap(async () => { throw new Error('fail'); });
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await assert.rejects(failing);
      }
      
      // Wait for timeout
      await new Promise(r => setTimeout(r, 150));
      
      // Half-open test fails
      await assert.rejects(failing);
      
      assert.strictEqual(cb.getState().state, 'OPEN');
    });

    it('should reject additional requests in half-open state', async () => {
      const failing = cb.wrap(async () => { throw new Error('fail'); });
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await assert.rejects(failing);
      }
      
      // Wait for timeout
      await new Promise(r => setTimeout(r, 150));
      
      // Wrap a slow function that will be the test request
      const slow = cb.wrap(async () => {
        await new Promise(r => setTimeout(r, 50));
        return 'success';
      });
      
      // Start first request (claims test slot)
      const firstRequest = slow();
      
      // Second request should be rejected immediately
      await assert.rejects(async () => cb.wrap(async () => 'second')(), {
        message: /Circuit breaker is HALF_OPEN/,
      });
      
      // First request should complete successfully
      await firstRequest;
    });
  });

  describe('reset', () => {
    it('should reset circuit to closed state', async () => {
      const cb = createCircuitBreaker({ name: 'test', threshold: 3 });
      const failing = cb.wrap(async () => { throw new Error('fail'); });
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await assert.rejects(failing);
      }
      
      assert.strictEqual(cb.getState().state, 'OPEN');
      
      // Reset
      cb.reset();
      
      const state = cb.getState();
      assert.strictEqual(state.state, 'CLOSED');
      assert.strictEqual(state.failures, 0);
    });
  });

  describe('isFailure filter', () => {
    it('should only count errors matching isFailure predicate', async () => {
      const cb = createCircuitBreaker({
        name: 'filtered',
        threshold: 3,
        isFailure: (error) => error.message === 'real failure',
      });
      
      const realFail = cb.wrap(async () => { throw new Error('real failure'); });
      const fakeFail = cb.wrap(async () => { throw new Error('not a failure'); });
      
      // Fake failures shouldn't count
      await assert.rejects(fakeFail);
      await assert.rejects(fakeFail);
      
      assert.strictEqual(cb.getState().failures, 0);
      
      // Real failures should count
      await assert.rejects(realFail);
      await assert.rejects(realFail);
      
      assert.strictEqual(cb.getState().failures, 2);
    });
  });
});
