/**
 * System routes (health check, metrics)
 * @module routes/system
 */

import { healthHandler, metricsHandler } from '../handlers/system.js';

/**
 * Register system routes
 * @param {Object} app - Express app
 * @param {Object} options - Route options
 * @param {Function} options.healthLimiter - Rate limiter for health endpoint
 * @param {Function} options.tokenAuth - Token auth middleware
 */
export function registerSystemRoutes(app, { healthLimiter, tokenAuth }) {
  // Health check (minimal public info, full stats with auth or when auth disabled)
  app.get('/health', healthLimiter, healthHandler);

  // Prometheus metrics endpoint (requires auth)
  app.get('/:token/metrics', tokenAuth, metricsHandler);
}
