/**
 * Prometheus metrics module
 * Provides application metrics for monitoring
 * @module metrics
 */

import client from 'prom-client';

// Enable default metrics (process CPU, memory, etc.)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'debroxy_' });

// Registry for custom metrics
const register = client.register;

// ==================
// HTTP Metrics
// ==================

/** HTTP request counter */
export const httpRequestsTotal = new client.Counter({
  name: 'debroxy_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

/** HTTP request duration histogram */
export const httpRequestDuration = new client.Histogram({
  name: 'debroxy_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

// ==================
// Stream Metrics
// ==================

/** Active streams gauge */
export const activeStreams = new client.Gauge({
  name: 'debroxy_active_streams',
  help: 'Number of currently active proxy streams',
});

/** Stream bytes transferred counter */
export const streamBytesTotal = new client.Counter({
  name: 'debroxy_stream_bytes_total',
  help: 'Total bytes transferred through proxy streams',
  labelNames: ['direction'], // 'download' or 'upload'
});

// ==================
// Library Metrics
// ==================

/** Library sync status */
export const syncStatus = new client.Gauge({
  name: 'debroxy_sync_status',
  help: 'Library sync status (1 = complete, 0 = syncing)',
});

/** Last sync timestamp */
export const lastSyncTimestamp = new client.Gauge({
  name: 'debroxy_last_sync_timestamp',
  help: 'Unix timestamp of last successful sync',
});

/** Library size gauges */
export const librarySize = new client.Gauge({
  name: 'debroxy_library_size',
  help: 'Number of items in library',
  labelNames: ['type'], // 'movies', 'series', 'torrents', 'unmatched'
});

// ==================
// API Error Metrics
// ==================

/** Real-Debrid API errors counter */
export const rdApiErrors = new client.Counter({
  name: 'debroxy_rd_api_errors_total',
  help: 'Total Real-Debrid API errors',
  labelNames: ['endpoint', 'error_type'],
});

/** Cinemeta API errors counter */
export const cinemetaErrors = new client.Counter({
  name: 'debroxy_cinemeta_errors_total',
  help: 'Total Cinemeta API errors',
  labelNames: ['error_type'],
});

// ==================
// Database Metrics
// ==================

/** Database query duration histogram */
export const dbQueryDuration = new client.Histogram({
  name: 'debroxy_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

// ==================
// Helper Functions
// ==================

/**
 * Normalize route for metric labels
 * Replaces dynamic segments with placeholders
 * @param {string} path - Request path
 * @returns {string} Normalized route
 */
export function normalizeRoute(path) {
  return path
    // Replace token in path with placeholder
    .replace(/\/[a-f0-9]{32,}/gi, '/:token')
    // Replace IMDB IDs
    .replace(/\/tt\d+/gi, '/:imdb_id')
    // Replace base64 encoded segments
    .replace(/\/[A-Za-z0-9_-]{20,}/g, '/:encoded')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id');
}

/**
 * Express middleware to record HTTP metrics
 */
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const route = normalizeRoute(req.path);
    const labels = {
      method: req.method,
      route,
      status: res.statusCode,
    };
    
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);
  });
  
  next();
}

/**
 * Update library metrics from current stats
 * @param {Object} stats - Library stats object
 */
export function updateLibraryMetrics(stats) {
  if (!stats) return;

  librarySize.set({ type: 'movies' }, stats.movies || 0);
  librarySize.set({ type: 'series' }, stats.series || 0);
  librarySize.set({ type: 'torrents' }, stats.torrents || 0);
  librarySize.set({ type: 'unmatched' }, stats.unmatched || 0);
  
  syncStatus.set(stats.isComplete ? 1 : 0);
  
  // Defensive: ensure lastSync is valid before creating Date
  if (stats.lastSync && !isNaN(new Date(stats.lastSync).getTime())) {
    lastSyncTimestamp.set(new Date(stats.lastSync).getTime() / 1000);
  }
}

/**
 * Get metrics in Prometheus format
 * @returns {Promise<string>} Prometheus formatted metrics
 */
export async function getMetrics() {
  return register.metrics();
}

/**
 * Get content type for metrics response
 * @returns {string} Content type header value
 */
export function getContentType() {
  return register.contentType;
}

export default {
  httpRequestsTotal,
  httpRequestDuration,
  activeStreams,
  streamBytesTotal,
  syncStatus,
  lastSyncTimestamp,
  librarySize,
  rdApiErrors,
  cinemetaErrors,
  dbQueryDuration,
  normalizeRoute,
  metricsMiddleware,
  updateLibraryMetrics,
  getMetrics,
  getContentType,
};
