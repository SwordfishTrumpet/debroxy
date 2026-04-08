/**
 * Reusable Express middleware
 * @module middleware
 */

import { createErrorResponse, ErrorCode } from './errors.js';
import { validateType, validateImdbId, extractBaseId } from './validators.js';

/**
 * Set no-cache headers to prevent caching of catalog responses
 * This ensures new content appears immediately during sync
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function noCache(req, res, next) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

/**
 * Wrap an async route handler to forward errors to Express error handler
 * Eliminates the need for try/catch in every async route
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware that catches rejected promises
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Validate that :type param is 'movie' or 'series'
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function validateTypeParam(req, res, next) {
  if (!validateType(req.params.type)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid type. Must be "movie" or "series"', ErrorCode.VALIDATION_ERROR));
  }
  next();
}

/**
 * Validate that :id param contains a valid IMDB ID (supports composite IDs like tt1234567:1:2)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function validateImdbIdParam(req, res, next) {
  const baseId = extractBaseId(req.params.id);
  if (!validateImdbId(baseId)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid IMDB ID format', ErrorCode.VALIDATION_ERROR));
  }
  next();
}
