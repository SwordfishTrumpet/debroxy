/**
 * Middleware module unit tests
 * Tests for Express middleware functions
 */

// Setup test environment BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.PROXY_TOKEN = 'test-token-1234567890abcdef1234567890abcdef';
process.env.RD_API_KEY = 'test-rd-api-key-1234567890';
process.env.EXTERNAL_URL = 'http://localhost:9999';
process.env.PORT = '8888';
process.env.MAX_CONCURRENT_STREAMS = '3';
process.env.SYNC_INTERVAL_MIN = '15';
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import middleware functions after environment is set up
const { noCache, asyncHandler, validateTypeParam, validateImdbIdParam } = await import('../src/middleware.js');

describe('middleware', () => {
  describe('noCache', () => {
    it('should set no-cache headers and call next', () => {
      const mockReq = {};
      let headersSet = {};
      const mockRes = {
        setHeader: (name, value) => {
          headersSet[name] = value;
        }
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      noCache(mockReq, mockRes, mockNext);

      assert.deepStrictEqual(headersSet, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      assert.strictEqual(nextCalled, true);
    });
  });

  describe('asyncHandler', () => {
    it('should call async function and pass result through', async () => {
      const asyncFn = async (req, res, next) => {
        res.status = 200;
        return 'success';
      };

      const handler = asyncHandler(asyncFn);
      const mockReq = {};
      const mockRes = { status: null };
      let nextCalled = false;
      const mockNext = (err) => { nextCalled = err; };

      await handler(mockReq, mockRes, mockNext);

      assert.strictEqual(mockRes.status, 200);
      assert.strictEqual(nextCalled, false);
    });

    it('should catch async errors and pass to next', async () => {
      const error = new Error('Test error');
      const asyncFn = async () => {
        throw error;
      };

      const handler = asyncHandler(asyncFn);
      const mockReq = {};
      const mockRes = {};
      let nextCalled = false;
      const mockNext = (err) => { nextCalled = err; };

      await handler(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, error);
    });

    it('should handle synchronous errors in async function', async () => {
      const error = new Error('Sync error');
      const asyncFn = () => {
        throw error;
      };

      const handler = asyncHandler(asyncFn);
      const mockReq = {};
      const mockRes = {};
      let nextCalled = false;
      const mockNext = (err) => { nextCalled = err; };

      await handler(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, error);
    });

    it('should handle promise rejection', async () => {
      const error = new Error('Promise rejected');
      const asyncFn = () => {
        return Promise.reject(error);
      };

      const handler = asyncHandler(asyncFn);
      const mockReq = {};
      const mockRes = {};
      let nextCalled = false;
      const mockNext = (err) => { nextCalled = err; };

      await handler(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, error);
    });
  });

  describe('validateTypeParam', () => {
    it('should accept "movie" type', () => {
      const mockReq = { params: { type: 'movie' } };
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
        }
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateTypeParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, null);
      assert.strictEqual(jsonResponse, null);
      assert.strictEqual(nextCalled, true);
    });

    it('should accept "series" type', () => {
      const mockReq = { params: { type: 'series' } };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };
      const mockRes = {
        status: () => mockRes,
        json: () => mockRes
      };

      validateTypeParam(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, true);
    });

    it('should reject invalid type with 400', () => {
      const mockReq = { params: { type: 'invalid' } };
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
        }
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateTypeParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.deepStrictEqual(jsonResponse, {
        error: 'Invalid type. Must be "movie" or "series"',
        error_code: 'VALIDATION_ERROR'
      });
      assert.strictEqual(nextCalled, false);
    });

    it('should reject empty type', () => {
      const mockReq = { params: { type: '' } };
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: () => mockRes
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateTypeParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(nextCalled, false);
    });

    it('should reject missing type param', () => {
      const mockReq = { params: {} };
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: () => mockRes
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateTypeParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(nextCalled, false);
    });
  });

  describe('validateImdbIdParam', () => {
    it('should accept simple IMDB ID', () => {
      const mockReq = { params: { id: 'tt1234567' } };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };
      const mockRes = {
        status: () => mockRes,
        json: () => mockRes
      };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, true);
    });

    it('should accept composite IMDB ID with season/episode', () => {
      const mockReq = { params: { id: 'tt1234567:1:2' } };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };
      const mockRes = {
        status: () => mockRes,
        json: () => mockRes
      };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, true);
    });

    it('should accept composite IMDB ID with trailing colon', () => {
      const mockReq = { params: { id: 'tt1234567:' } };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };
      const mockRes = {
        status: () => mockRes,
        json: () => mockRes
      };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, true);
    });

    it('should reject invalid IMDB ID format', () => {
      const mockReq = { params: { id: 'invalid' } };
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
        }
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.deepStrictEqual(jsonResponse, {
        error: 'Invalid IMDB ID format',
        error_code: 'VALIDATION_ERROR'
      });
      assert.strictEqual(nextCalled, false);
    });

    it('should reject IMDB ID missing "tt" prefix', () => {
      const mockReq = { params: { id: '1234567' } };
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: () => mockRes
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(nextCalled, false);
    });

    it('should reject too short IMDB ID', () => {
      const mockReq = { params: { id: 'tt123' } };
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: () => mockRes
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(nextCalled, false);
    });

    it('should reject empty ID', () => {
      const mockReq = { params: { id: '' } };
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: () => mockRes
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(nextCalled, false);
    });

    it('should reject missing ID param', () => {
      const mockReq = { params: {} };
      let statusCode = null;
      const mockRes = {
        status: (code) => {
          statusCode = code;
          return mockRes;
        },
        json: () => mockRes
      };
      let nextCalled = false;
      const mockNext = () => { nextCalled = true; };

      validateImdbIdParam(mockReq, mockRes, mockNext);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(nextCalled, false);
    });
  });
});