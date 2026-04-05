/**
 * Structured error codes for consistent API responses
 * @module errors
 */

/**
 * Error codes enum
 * Used in all JSON error responses for programmatic handling
 */
export const ErrorCode = {
  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Authorization errors (403)
  FORBIDDEN: 'FORBIDDEN',
  
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  
  // Stream-specific errors
  MAX_STREAMS_REACHED: 'MAX_STREAMS_REACHED',
  STREAM_ERROR: 'STREAM_ERROR',
  
  // Library errors
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  SYNC_ERROR: 'SYNC_ERROR',
};

/**
 * Map HTTP status codes to default error codes
 */
export const StatusToErrorCode = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  408: ErrorCode.REQUEST_TIMEOUT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  429: ErrorCode.RATE_LIMITED,
  500: ErrorCode.INTERNAL_ERROR,
  502: ErrorCode.UPSTREAM_ERROR,
  503: ErrorCode.SERVICE_UNAVAILABLE,
  504: ErrorCode.REQUEST_TIMEOUT,
};

/**
 * Map internal error codes to safe messages
 */
export const SafeErrorMessages = {
  'ECONNREFUSED': 'Service temporarily unavailable',
  'ETIMEDOUT': 'Request timeout',
  'ENOTFOUND': 'Service unavailable',
  'ECONNRESET': 'Connection reset',
  'EPIPE': 'Connection error',
  'CIRCUIT_OPEN': 'Service temporarily unavailable (circuit open)',
};

/**
 * Create a structured error response object
 * @param {number} status - HTTP status code
 * @param {string} message - Human-readable error message
 * @param {string} [code] - Error code from ErrorCode enum
 * @param {Object} [details] - Additional error details
 * @returns {Object} Structured error response
 */
export function createErrorResponse(status, message, code, details = {}) {
  return {
    error: message,
    error_code: code || StatusToErrorCode[status] || ErrorCode.INTERNAL_ERROR,
    ...details,
  };
}

/**
 * Get safe error message for production
 * @param {Error} error - Error object
 * @param {boolean} isDev - Whether in development mode
 * @returns {string} Safe error message
 */
export function getSafeMessage(error, isDev = false) {
  if (isDev) {
    return error.message;
  }
  
  return SafeErrorMessages[error.code] ||
    (error.status && error.status < 500 ? error.message : 'Internal server error');
}

export default {
  ErrorCode,
  StatusToErrorCode,
  SafeErrorMessages,
  createErrorResponse,
  getSafeMessage,
};
