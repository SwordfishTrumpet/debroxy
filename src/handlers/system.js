/**
 * System handlers (health check, metrics)
 * @module handlers/system
 */

import config from '../config.js';
import * as db from '../db.js';
import * as proxy from '../proxy.js';
import * as library from '../library.js';
import * as metrics from '../metrics.js';
import { ErrorCode, createErrorResponse } from '../errors.js';
import { safeCompare } from '../security.js';
import { VERSION } from '../constants.js';

const METRICS_ENABLED = process.env.ENABLE_METRICS !== 'false';

/**
 * Health check handler
 * Returns minimal public info without auth, full stats with auth
 */
export function healthHandler(req, res) {
  // Check for Authorization header for full stats (or auth disabled = always full stats)
  const authHeader = req.headers.authorization;
  const hasAuth = !config.authEnabled || (authHeader && authHeader.startsWith('Bearer ') &&
    safeCompare(authHeader.substring(7), config.proxyToken));

  // Verify actual database connectivity
  let dbConnected = false;
  try {
    db.getStats(); // Attempt a real query
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  if (hasAuth) {
    // Return full stats for authenticated requests
    const stats = dbConnected ? db.getStats() : null;
    const streams = proxy.getActiveStreams();

    // Update metrics with current library stats
    if (METRICS_ENABLED && stats) {
      metrics.updateLibraryMetrics({
        ...stats,
        isComplete: library.getStatus().isComplete,
        lastSync: library.getStatus().lastSync,
      });
      metrics.activeStreams.set(streams.length);
    }

    res.json({
      status: dbConnected ? 'ok' : 'degraded',
      version: VERSION,
      uptime: process.uptime(),
      database: dbConnected ? 'connected' : 'disconnected',
      library: stats,
      streams: {
        active: streams.length,
        max: config.maxConcurrentStreams,
      },
    });
  } else {
    // Minimal public health check
    res.json({ status: dbConnected ? 'ok' : 'degraded' });
  }
}

/**
 * Metrics handler
 * Returns Prometheus metrics (requires auth)
 */
export async function metricsHandler(req, res) {
  if (!METRICS_ENABLED) {
    return res.status(404).json(createErrorResponse(404, 'Metrics disabled', ErrorCode.NOT_FOUND));
  }

  // Update library metrics before returning
  const stats = db.getStats();
  const streams = proxy.getActiveStreams();
  metrics.updateLibraryMetrics({
    ...stats,
    isComplete: library.getStatus().isComplete,
    lastSync: library.getStatus().lastSync,
  });
  metrics.activeStreams.set(streams.length);

  res.set('Content-Type', metrics.getContentType());
  res.send(await metrics.getMetrics());
}
