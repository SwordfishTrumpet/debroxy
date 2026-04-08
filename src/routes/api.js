/**
 * Management API routes
 * @module routes/api
 */

import { asyncHandler } from '../middleware.js';
import { STREAM_TIMEOUT_MS } from '../constants.js';
import * as proxy from '../proxy.js';
import {
  getUserHandler,
  listTorrentsHandler,
  getTorrentHandler,
  addMagnetHandler,
  unrestrictHandler,
  listDownloadsHandler,
  getStreamsHandler,
  proxyStreamHandler,
  getLibraryHandler,
  resyncHandler,
  syncHandler,
  getUnmatchedHandler,
  reportProgressHandler,
  getProgressHandler,
  deleteProgressHandler,
  getHistoryHandler,
  getHistoryStatsHandler,
  markCompleteHandler,
  toggleBandwidthModeHandler,
} from '../handlers/api.js';

/**
 * Register Management API routes
 * @param {Object} app - Express app
 * @param {Object} options - Route options
 * @param {Function} options.tokenAuth - Token auth middleware
 * @param {Function} options.createTimeoutMiddleware - Timeout middleware factory
 * @param {string} options.prefix - Route prefix (empty string or '/:token')
 */
export function registerApiRoutes(app, { tokenAuth, createTimeoutMiddleware, prefix = '/:token' }) {
  const p = prefix; // shorthand
  const auth = tokenAuth;

  // RD user info
  app.get(`${p}/api/user`, auth, asyncHandler(getUserHandler));

  // List RD torrents
  app.get(`${p}/api/torrents`, auth, asyncHandler(listTorrentsHandler));

  // Get torrent details
  app.get(`${p}/api/torrents/:id`, auth, asyncHandler(getTorrentHandler));

  // Add magnet
  app.post(`${p}/api/magnet`, auth, asyncHandler(addMagnetHandler));

  // Unrestrict link
  app.post(`${p}/api/unrestrict`, auth, asyncHandler(unrestrictHandler));

  // List downloads
  app.get(`${p}/api/downloads`, auth, asyncHandler(listDownloadsHandler));

  // Proxy stream status
  app.get(`${p}/api/streams`, auth, getStreamsHandler);

  // Generic URL proxy (for direct RD URLs) - with extended timeout for streaming
  app.options(`${p}/proxy/stream`, auth, proxy.handlePreflight);
  app.get(`${p}/proxy/stream`, auth, createTimeoutMiddleware(STREAM_TIMEOUT_MS), asyncHandler(proxyStreamHandler));

  // Library stats
  app.get(`${p}/api/library`, auth, getLibraryHandler);

  // Force resync
  app.post(`${p}/api/library/resync`, auth, asyncHandler(resyncHandler));

  // Force immediate sync
  app.post(`${p}/api/library/sync`, auth, asyncHandler(syncHandler));

  // Get unmatched torrents
  app.get(`${p}/api/library/unmatched`, auth, getUnmatchedHandler);

  // Report progress
  app.post(`${p}/api/progress`, auth, reportProgressHandler);

  // Get progress for specific item
  app.get(`${p}/api/progress/:imdbId`, auth, getProgressHandler);

  // Delete progress for specific item
  app.delete(`${p}/api/progress/:imdbId`, auth, deleteProgressHandler);

  // Get watch history
  app.get(`${p}/api/history`, auth, getHistoryHandler);

  // Get watch stats
  app.get(`${p}/api/history/stats`, auth, getHistoryStatsHandler);

  // Mark item as completed
  app.post(`${p}/api/progress/:imdbId/complete`, auth, markCompleteHandler);

  // Toggle low bandwidth mode
  app.post(`${p}/api/bandwidth-mode`, auth, asyncHandler(toggleBandwidthModeHandler));
}
