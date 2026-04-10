/**
 * Security module unit tests
 * Tests for authentication, authorization, and security utilities
 */

// Setup test environment BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.PROXY_TOKEN = 'test-token-1234567890abcdef1234567890abcdef'; // 32+ chars
process.env.RD_API_KEY = 'test-rd-api-key-1234567890';
process.env.EXTERNAL_URL = 'http://localhost:9999';

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

// Note: ES modules cannot be cleared from cache like CommonJS
// We rely on setting environment variables before import
// Import security and config modules
const { hashToken, safeCompare, tokenAuth } = await import('../src/security.js');
const configModule = await import('../src/config.js');
const config = configModule.default;
console.log('ENV PROXY_TOKEN:', JSON.stringify(process.env.PROXY_TOKEN), 'length:', process.env.PROXY_TOKEN?.length, 'config.authEnabled:', config.authEnabled, 'config.proxyToken:', config.proxyToken, 'config.proxyToken length:', config.proxyToken?.length);

describe('security', () => {
  describe('hashToken', () => {
    it('should hash token to short prefix', () => {
      const token = 'my-secret-token-123';
      const hashed = hashToken(token);

      assert.strictEqual(typeof hashed, 'string');
      assert.strictEqual(hashed.length, 8); // First 8 chars of SHA256 hex
      assert.notStrictEqual(hashed, token);
    });

    it('should produce same hash for same token', () => {
      const token = 'test-token';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      assert.strictEqual(hash1, hash2);
    });

    it('should produce different hashes for different tokens', () => {
      const hash1 = hashToken('token1');
      const hash2 = hashToken('token2');

      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('safeCompare', () => {
    it('should return true for identical strings', () => {
      const result = safeCompare('same-string', 'same-string');
      assert.strictEqual(result, true);
    });

    it('should return false for different strings of same length', () => {
      const result = safeCompare('string-one', 'string-two');
      assert.strictEqual(result, false);
    });

    it('should return false for strings of different length', () => {
      const result = safeCompare('short', 'longer');
      assert.strictEqual(result, false);
    });

    it('should return false for non-string inputs', () => {
      // @ts-ignore - testing invalid input
      assert.strictEqual(safeCompare(null, 'string'), false);
      // @ts-ignore
      assert.strictEqual(safeCompare('string', undefined), false);
      // @ts-ignore
      assert.strictEqual(safeCompare(123, '123'), false);
      // @ts-ignore
      assert.strictEqual(safeCompare('123', 123), false);
    });

    it('should handle empty strings', () => {
      assert.strictEqual(safeCompare('', ''), true);
      assert.strictEqual(safeCompare('', 'not-empty'), false);
    });
  });

  describe('tokenAuth middleware', () => {
    const validToken = process.env.PROXY_TOKEN;

    beforeEach(() => {
      // Clear any failed attempts from previous tests by authenticating successfully
      // This is a hack because we can't directly access the internal map
      // We'll create a mock request with valid token and call tokenAuth
      // with a mock response that does nothing
      const mockReq = {
        ip: '127.0.0.1',
        headers: {},
        params: { token: validToken },
      };
      const mockRes = {
        status: () => mockRes,
        json: () => {},
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      // This should clear any existing failed attempts for 127.0.0.1
      tokenAuth(mockReq, mockRes, mockNext);
      // Note: we can't guarantee it clears because token might not match
      // But validToken matches env var, so it should work
    });

    it('should call next() with valid Authorization header', () => {
      const mockReq = {
        ip: '127.0.0.1',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        params: {},
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };
      const mockRes = {
        status: () => mockRes,
        json: () => {},
      };

      tokenAuth(mockReq, mockRes, mockNext);
      assert.strictEqual(nextCalled, true, 'next() should be called');
    });

    it('should call next() with valid URL token parameter', () => {
      const mockReq = {
        ip: '127.0.0.1',
        headers: {},
        params: { token: validToken },
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };
      const mockRes = {
        status: () => mockRes,
        json: () => {},
      };

      tokenAuth(mockReq, mockRes, mockNext);
      assert.strictEqual(nextCalled, true, 'next() should be called');
    });

    it('should reject invalid token with 401', () => {
      console.log('DEBUG: config.authEnabled:', config.authEnabled, 'config.proxyToken:', config.proxyToken ? 'set' : 'null');
      const mockReq = {
        ip: '127.0.0.1',
        headers: {},
        params: { token: 'invalid-token' },
      };
      let statusCode = null;
      let jsonResponse = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: (data) => {
          jsonResponse = data;
          return mockRes;
        },
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      tokenAuth(mockReq, mockRes, mockNext);
      console.log('DEBUG: statusCode:', statusCode, 'jsonResponse:', jsonResponse);
      assert.strictEqual(statusCode, 401);
      assert.strictEqual(jsonResponse.error, 'Unauthorized');
      assert.strictEqual(nextCalled, false);
    });

    it('should reject missing token with 401', () => {
      const mockReq = {
        ip: '127.0.0.1',
        headers: {},
        params: {},
      };
      let statusCode = null;
      let jsonResponse = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: (data) => {
          jsonResponse = data;
          return mockRes;
        },
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      tokenAuth(mockReq, mockRes, mockNext);
      assert.strictEqual(statusCode, 401);
      assert.strictEqual(jsonResponse.error, 'Unauthorized');
      assert.strictEqual(nextCalled, false);
    });

    it('should prefer Authorization header over URL token', () => {
      const mockReq = {
        ip: '127.0.0.1',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
        params: { token: 'invalid-url-token' },
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };
      const mockRes = {
        status: () => mockRes,
        json: () => {},
      };

      tokenAuth(mockReq, mockRes, mockNext);
      assert.strictEqual(nextCalled, true, 'next() should be called despite invalid URL token');
    });

    // Note: Lockout tests are skipped because they're stateful and complex
    // Integration tests in server.test.js cover lockout behavior
  });
});