/**
 * Settings module tests
 * Tests for runtime settings management
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Setup test environment BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.PROXY_TOKEN = 'test-token-1234567890abcdef1234567890abcdef';
process.env.RD_API_KEY = 'test-rd-api-key-1234567890';
process.env.EXTERNAL_URL = 'http://localhost:9999';
process.env.PORT = '0';
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

// Import settings after environment setup
const { get, set, getAll, updateMany, reset, resetAll, VALID_SETTINGS, getMetadata } = await import('../src/settings.js');

describe('settings', () => {
  beforeEach(() => {
    // Reset all settings to defaults before each test
    resetAll();
  });

  describe('get()', () => {
    it('should return default value for unset settings', () => {
      const value = get('transcodingEnabled');
      assert.strictEqual(typeof value, 'boolean');
    });

    it('should return null for invalid setting key', () => {
      const value = get('invalidKey');
      assert.strictEqual(value, null);
    });

    it('should return integer for maxConcurrentStreams', () => {
      const value = get('maxConcurrentStreams');
      assert.strictEqual(typeof value, 'number');
      assert.strictEqual(Number.isInteger(value), true);
    });

    it('should return number for watchCompletionThreshold', () => {
      const value = get('watchCompletionThreshold');
      assert.strictEqual(typeof value, 'number');
      assert.ok(value >= 0.5 && value <= 0.99);
    });
  });

  describe('set()', () => {
    it('should update a setting value', () => {
      const result = set('transcodingEnabled', false);
      assert.strictEqual(result.success, true);
      assert.strictEqual(get('transcodingEnabled'), false);
    });

    it('should validate maxConcurrentStreams range', () => {
      const result = set('maxConcurrentStreams', 0); // Below min of 1
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('at least'));
    });

    it('should validate maxConcurrentStreams maximum', () => {
      const result = set('maxConcurrentStreams', 25); // Above max of 20
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('at most'));
    });

    it('should accept valid maxConcurrentStreams', () => {
      const result = set('maxConcurrentStreams', 5);
      assert.strictEqual(result.success, true);
      assert.strictEqual(get('maxConcurrentStreams'), 5);
    });

    it('should reject invalid setting keys', () => {
      const result = set('invalidKey', 'value');
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('Invalid'));
    });

    it('should validate minStreamQuality enum values', () => {
      const result = set('minStreamQuality', 'invalid');
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('must be one of'));
    });

    it('should accept valid minStreamQuality values', () => {
      const validQualities = ['', '2160p', '1440p', '1080p', '720p', '480p', '360p'];
      for (const quality of validQualities) {
        const result = set('minStreamQuality', quality);
        assert.strictEqual(result.success, true, `Should accept ${quality}`);
        assert.strictEqual(get('minStreamQuality'), quality);
      }
    });

    it('should validate watchCompletionThreshold range', () => {
      const resultLow = set('watchCompletionThreshold', 0.4); // Below 0.5
      assert.strictEqual(resultLow.success, false);

      const resultHigh = set('watchCompletionThreshold', 1.0); // Above 0.99
      assert.strictEqual(resultHigh.success, false);
    });

    it('should reject object values (type confusion protection)', () => {
      const result = set('maxConcurrentStreams', { value: 5 });
      assert.strictEqual(result.success, false);
      assert.ok(result.error.includes('primitive'));
    });

    it('should reject array values (type confusion protection)', () => {
      const result = set('transcodingEnabled', [true]);
      assert.strictEqual(result.success, false);
    });

    it('should reject null/undefined values', () => {
      const resultNull = set('syncIntervalMin', null);
      assert.strictEqual(resultNull.success, false);

      const resultEmpty = set('syncIntervalMin', '');
      assert.strictEqual(resultEmpty.success, false);
    });
  });

  describe('getAll()', () => {
    it('should return all valid settings', () => {
      const all = getAll();
      for (const key of VALID_SETTINGS) {
        assert.ok(key in all, `Should include ${key}`);
      }
    });

    it('should return correct types for all settings', () => {
      const all = getAll();
      assert.strictEqual(typeof all.transcodingEnabled, 'boolean');
      assert.strictEqual(typeof all.transcodingPreferHls, 'boolean');
      assert.strictEqual(typeof all.maxConcurrentStreams, 'number');
      assert.strictEqual(typeof all.syncIntervalMin, 'number');
      assert.strictEqual(typeof all.watchCompletionThreshold, 'number');
      assert.strictEqual(typeof all.minStreamQuality, 'string');
    });
  });

  describe('updateMany()', () => {
    it('should update multiple settings at once', () => {
      const result = updateMany({
        transcodingEnabled: false,
        maxConcurrentStreams: 10,
      });

      assert.strictEqual(result.errors.length, 0);
      assert.strictEqual(get('transcodingEnabled'), false);
      assert.strictEqual(get('maxConcurrentStreams'), 10);
    });

    it('should report errors for invalid settings without failing all', () => {
      const result = updateMany({
        transcodingEnabled: true,
        maxConcurrentStreams: 100, // Invalid
      });

      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].key === 'maxConcurrentStreams');
      assert.strictEqual(get('transcodingEnabled'), true); // Should still be set
    });

    it('should reject too many settings in one request', () => {
      const result = updateMany({
        a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10, k: 11,
      });

      assert.strictEqual(result.errors.length, 1);
      assert.ok(result.errors[0].error.includes('Too many'));
    });
  });

  describe('reset()', () => {
    it('should reset a setting to its default', () => {
      set('maxConcurrentStreams', 15);
      assert.strictEqual(get('maxConcurrentStreams'), 15);

      reset('maxConcurrentStreams');
      // Should be back to default (usually 3)
      assert.notStrictEqual(get('maxConcurrentStreams'), 15);
    });

    it('should reject invalid keys', () => {
      const result = reset('invalidKey');
      assert.strictEqual(result.success, false);
    });
  });

  describe('resetAll()', () => {
    it('should reset all settings to defaults', () => {
      // Change some settings
      set('transcodingEnabled', false);
      set('maxConcurrentStreams', 10);
      set('syncIntervalMin', 30);

      resetAll();

      // All should be back to defaults
      const defaults = getAll();
      assert.strictEqual(typeof defaults.transcodingEnabled, 'boolean');
      assert.strictEqual(typeof defaults.maxConcurrentStreams, 'number');
    });
  });

  describe('VALID_SETTINGS', () => {
    it('should contain expected setting keys', () => {
      assert.ok(VALID_SETTINGS.includes('transcodingEnabled'));
      assert.ok(VALID_SETTINGS.includes('transcodingPreferHls'));
      assert.ok(VALID_SETTINGS.includes('maxConcurrentStreams'));
      assert.ok(VALID_SETTINGS.includes('syncIntervalMin'));
      assert.ok(VALID_SETTINGS.includes('watchCompletionThreshold'));
      assert.ok(VALID_SETTINGS.includes('minStreamQuality'));
    });
  });

  describe('getMetadata()', () => {
    it('should return metadata for all settings', () => {
      const metadata = getMetadata();
      for (const key of VALID_SETTINGS) {
        assert.ok(metadata[key], `Should have metadata for ${key}`);
        assert.ok(metadata[key].label, `Should have label for ${key}`);
        assert.ok(metadata[key].type, `Should have type for ${key}`);
        assert.ok('default' in metadata[key], `Should have default for ${key}`);
      }
    });

    it('should include correct types in metadata', () => {
      const metadata = getMetadata();
      assert.strictEqual(metadata.transcodingEnabled.type, 'boolean');
      assert.strictEqual(metadata.maxConcurrentStreams.type, 'number');
      assert.strictEqual(metadata.minStreamQuality.type, 'enum');
    });

    it('should include min/max for numeric settings', () => {
      const metadata = getMetadata();
      assert.ok('min' in metadata.maxConcurrentStreams);
      assert.ok('max' in metadata.maxConcurrentStreams);
      assert.ok('min' in metadata.syncIntervalMin);
      assert.ok('max' in metadata.syncIntervalMin);
    });

    it('should include options for enum settings', () => {
      const metadata = getMetadata();
      assert.ok(Array.isArray(metadata.minStreamQuality.options));
      assert.ok(metadata.minStreamQuality.options.length > 0);
    });
  });
});
