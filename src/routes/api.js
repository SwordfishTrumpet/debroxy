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
} from '../handlers/api.js';

/**
 * Register Management API routes
 * @param {Object} app - Express app
 * @param {Object} options - Route options
 * @param {Function} options.tokenAuth - Token auth middleware
 * @param {Function} options.createTimeoutMiddleware - Timeout middleware factory
 */
export function registerApiRoutes(app, { tokenAuth, createTimeoutMiddleware }) {
  // RD user info
  app.get('/:token/api/user', tokenAuth, asyncHandler(getUserHandler));

  // List RD torrents
  app.get('/:token/api/torrents', tokenAuth, asyncHandler(listTorrentsHandler));

  // Get torrent details
  app.get('/:token/api/torrents/:id', tokenAuth, asyncHandler(getTorrentHandler));

  // Add magnet
  app.post('/:token/api/magnet', tokenAuth, asyncHandler(addMagnetHandler));

  // Unrestrict link
  app.post('/:token/api/unrestrict', tokenAuth, asyncHandler(unrestrictHandler));

  // List downloads
  app.get('/:token/api/downloads', tokenAuth, asyncHandler(listDownloadsHandler));

  // Proxy stream status
  app.get('/:token/api/streams', tokenAuth, getStreamsHandler);

  // Generic URL proxy (for direct RD URLs) - with extended timeout for streaming
  app.options('/:token/proxy/stream', tokenAuth, proxy.handlePreflight);
  app.get('/:token/proxy/stream', tokenAuth, createTimeoutMiddleware(STREAM_TIMEOUT_MS), asyncHandler(proxyStreamHandler));

  // Library stats
  app.get('/:token/api/library', tokenAuth, getLibraryHandler);

  // Force resync
  app.post('/:token/api/library/resync', tokenAuth, asyncHandler(resyncHandler));

  // Force immediate sync
  app.post('/:token/api/library/sync', tokenAuth, asyncHandler(syncHandler));

  // Get unmatched torrents
  app.get('/:token/api/library/unmatched', tokenAuth, getUnmatchedHandler);

  // Report progress
  app.post('/:token/api/progress', tokenAuth, reportProgressHandler);

  // Get progress for specific item
  app.get('/:token/api/progress/:imdbId', tokenAuth, getProgressHandler);

  // Delete progress for specific item
  app.delete('/:token/api/progress/:imdbId', tokenAuth, deleteProgressHandler);

  // Get watch history
  app.get('/:token/api/history', tokenAuth, getHistoryHandler);

  // Get watch stats
  app.get('/:token/api/history/stats', tokenAuth, getHistoryStatsHandler);

  // Mark item as completed
  app.post('/:token/api/progress/:imdbId/complete', tokenAuth, markCompleteHandler);
}
