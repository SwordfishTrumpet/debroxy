/**
 * Reusable Express middleware
 * @module middleware
 */

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
