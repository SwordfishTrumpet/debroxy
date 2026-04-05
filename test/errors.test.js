/**
 * Errors module unit tests
 * Tests for structured error handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  ErrorCode, 
  StatusToErrorCode, 
  SafeErrorMessages,
  createErrorResponse, 
  getSafeMessage,
} from '../src/errors.js';

describe('errors', () => {
  describe('ErrorCode', () => {
    it('should have all expected error codes', () => {
      // Authentication errors
      assert.strictEqual(typeof ErrorCode.UNAUTHORIZED, 'string');
      assert.strictEqual(typeof ErrorCode.INVALID_TOKEN, 'string');
      
      // Client errors
      assert.strictEqual(typeof ErrorCode.BAD_REQUEST, 'string');
      assert.strictEqual(typeof ErrorCode.NOT_FOUND, 'string');
      assert.strictEqual(typeof ErrorCode.VALIDATION_ERROR, 'string');
      assert.strictEqual(typeof ErrorCode.RATE_LIMITED, 'string');
      
      // Server errors
      assert.strictEqual(typeof ErrorCode.INTERNAL_ERROR, 'string');
      assert.strictEqual(typeof ErrorCode.UPSTREAM_ERROR, 'string');
      assert.strictEqual(typeof ErrorCode.CIRCUIT_OPEN, 'string');
    });

    it('should have unique error code values', () => {
      const values = Object.values(ErrorCode);
      const uniqueValues = new Set(values);
      assert.strictEqual(values.length, uniqueValues.size);
    });
  });

  describe('StatusToErrorCode', () => {
    it('should map common HTTP status codes', () => {
      assert.strictEqual(StatusToErrorCode[400], ErrorCode.BAD_REQUEST);
      assert.strictEqual(StatusToErrorCode[401], ErrorCode.UNAUTHORIZED);
      assert.strictEqual(StatusToErrorCode[403], ErrorCode.FORBIDDEN);
      assert.strictEqual(StatusToErrorCode[404], ErrorCode.NOT_FOUND);
      assert.strictEqual(StatusToErrorCode[429], ErrorCode.RATE_LIMITED);
      assert.strictEqual(StatusToErrorCode[500], ErrorCode.INTERNAL_ERROR);
      assert.strictEqual(StatusToErrorCode[502], ErrorCode.UPSTREAM_ERROR);
    });
  });

  describe('SafeErrorMessages', () => {
    it('should have messages for common error codes', () => {
      assert.strictEqual(typeof SafeErrorMessages.ECONNREFUSED, 'string');
      assert.strictEqual(typeof SafeErrorMessages.ETIMEDOUT, 'string');
      assert.strictEqual(typeof SafeErrorMessages.ENOTFOUND, 'string');
      assert.strictEqual(typeof SafeErrorMessages.CIRCUIT_OPEN, 'string');
    });
  });

  describe('createErrorResponse', () => {
    it('should create structured error response', () => {
      const response = createErrorResponse(400, 'Bad request', ErrorCode.BAD_REQUEST);
      
      assert.strictEqual(response.error, 'Bad request');
      assert.strictEqual(response.error_code, ErrorCode.BAD_REQUEST);
    });

    it('should use status code to determine error code if not provided', () => {
      const response = createErrorResponse(404, 'Not found');
      
      assert.strictEqual(response.error, 'Not found');
      assert.strictEqual(response.error_code, ErrorCode.NOT_FOUND);
    });

    it('should fall back to INTERNAL_ERROR for unknown status', () => {
      const response = createErrorResponse(418, 'I am a teapot');
      
      assert.strictEqual(response.error, 'I am a teapot');
      assert.strictEqual(response.error_code, ErrorCode.INTERNAL_ERROR);
    });

    it('should include additional details', () => {
      const response = createErrorResponse(400, 'Invalid input', ErrorCode.VALIDATION_ERROR, { 
        field: 'email',
        reason: 'Invalid format',
      });
      
      assert.strictEqual(response.error, 'Invalid input');
      assert.strictEqual(response.error_code, ErrorCode.VALIDATION_ERROR);
      assert.strictEqual(response.field, 'email');
      assert.strictEqual(response.reason, 'Invalid format');
    });

    it('should handle empty details object', () => {
      const response = createErrorResponse(500, 'Server error', ErrorCode.INTERNAL_ERROR, {});
      
      assert.strictEqual(response.error, 'Server error');
      assert.strictEqual(Object.keys(response).length, 2); // error and error_code
    });
  });

  describe('getSafeMessage', () => {
    it('should return full message in dev mode', () => {
      const error = new Error('Detailed error message');
      const message = getSafeMessage(error, true);
      
      assert.strictEqual(message, 'Detailed error message');
    });

    it('should return generic message for 5xx errors in production', () => {
      const error = new Error('Database connection failed: password wrong');
      error.status = 500;
      
      const message = getSafeMessage(error, false);
      
      assert.strictEqual(message, 'Internal server error');
    });

    it('should return original message for 4xx errors in production', () => {
      const error = new Error('Invalid input');
      error.status = 400;
      
      const message = getSafeMessage(error, false);
      
      assert.strictEqual(message, 'Invalid input');
    });

    it('should map known error codes to safe messages', () => {
      const error = new Error('Connection refused to database');
      error.code = 'ECONNREFUSED';
      
      const message = getSafeMessage(error, false);
      
      assert.strictEqual(message, 'Service temporarily unavailable');
    });

    it('should handle timeout errors', () => {
      const error = new Error('Operation timed out');
      error.code = 'ETIMEDOUT';
      
      const message = getSafeMessage(error, false);
      
      assert.strictEqual(message, 'Request timeout');
    });

    it('should handle circuit breaker errors', () => {
      const error = new Error('Circuit breaker is open');
      error.code = 'CIRCUIT_OPEN';
      
      const message = getSafeMessage(error, false);
      
      assert.strictEqual(message, 'Service temporarily unavailable (circuit open)');
    });

    it('should return internal server error for unknown errors in production', () => {
      const error = new Error('Some unknown error');
      
      const message = getSafeMessage(error, false);
      
      assert.strictEqual(message, 'Internal server error');
    });
  });
});
