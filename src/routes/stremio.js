/**
 * Stremio addon routes
 * @module routes/stremio
 */

import { asyncHandler, validateTypeParam, validateImdbIdParam } from '../middleware.js';
import { STREAM_TIMEOUT_MS } from '../constants.js';
import * as proxy from '../proxy.js';
import {
  manifestHandler,
  catalogHandler,
  metaHandler,
  streamHandler,
  streamPlayHandler,
  subtitlesHandler,
  subtitleServeHandler,
  configureHandler,
} from '../handlers/stremio.js';

/**
 * Register Stremio addon routes
 * @param {Object} app - Express app
 * @param {Object} options - Route options
 * @param {string} options.prefix - Route prefix (/:token or '')
 * @param {Array} options.authMiddleware - Auth middleware array
 * @param {Function} options.createTimeoutMiddleware - Timeout middleware factory
 */
export function registerStremioRoutes(app, { prefix, authMiddleware, createTimeoutMiddleware }) {
  // Stremio addon routes
  app.get(`${prefix}/configure`, ...authMiddleware, configureHandler);
  app.get(`${prefix}/manifest.json`, ...authMiddleware, manifestHandler);
  app.get(`${prefix}/catalog/:type/:id.json`, ...authMiddleware, validateTypeParam, catalogHandler);
  app.get(`${prefix}/catalog/:type/:id/:extra.json`, ...authMiddleware, validateTypeParam, catalogHandler);
  app.get(`${prefix}/meta/:type/:id.json`, ...authMiddleware, validateTypeParam, validateImdbIdParam, asyncHandler(metaHandler));
  app.get(`${prefix}/stream/:type/:id.json`, ...authMiddleware, validateTypeParam, validateImdbIdParam, asyncHandler(streamHandler));

  // Stream play (proxy)
  app.options(`${prefix}/stream/play/:encoded`, ...authMiddleware, proxy.handlePreflight);
  app.get(`${prefix}/stream/play/:encoded`, ...authMiddleware, createTimeoutMiddleware(STREAM_TIMEOUT_MS), asyncHandler(streamPlayHandler));

  // Subtitles resource (Stremio protocol)
  app.get(`${prefix}/subtitles/:type/:id.json`, ...authMiddleware, validateTypeParam, validateImdbIdParam, subtitlesHandler);

  // Subtitle file serve (proxy)
  app.options(`${prefix}/subtitle/serve/:encoded`, ...authMiddleware, proxy.handlePreflight);
  app.get(`${prefix}/subtitle/serve/:encoded`, ...authMiddleware, asyncHandler(subtitleServeHandler));
}
