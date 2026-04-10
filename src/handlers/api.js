/**
 * Management API handlers
 * @module handlers/api
 */

import * as rd from '../realdebrid.js';
import * as proxy from '../proxy.js';
import * as db from '../db.js';
import * as library from '../library.js';
import * as settings from '../settings.js';
import * as stremio from '../stremio.js';
import * as validators from '../validators.js';
import config from '../config.js';
import { ErrorCode, createErrorResponse } from '../errors.js';

// Progress report debounce map (in-memory, per-process)
const progressDebounce = new Map();
const PROGRESS_DEBOUNCE_MS = 5000; // 5 seconds

/**
 * Get cache key for progress debounce
 * @param {string} imdbId - IMDB ID
 * @param {number|null} season - Season
 * @param {number|null} episode - Episode
 * @returns {string} Cache key
 */
function getProgressCacheKey(imdbId, season, episode) {
  return `${imdbId}:${season || 'null'}:${episode || 'null'}`;
}

/**
 * RD user info handler
 */
export async function getUserHandler(req, res) {
  const user = await rd.getUser();
  res.json(user);
}

/**
 * List RD torrents handler
 */
export async function listTorrentsHandler(req, res) {
  const { offset, limit } = validators.validatePagination(req.query.offset, req.query.limit);
  const torrents = await rd.listTorrents(offset, limit);
  res.json(torrents);
}

/**
 * Get torrent details handler
 */
export async function getTorrentHandler(req, res) {
  if (!validators.validateRdId(req.params.id)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid torrent ID format', ErrorCode.VALIDATION_ERROR));
  }
  const torrent = await rd.getTorrentInfo(req.params.id);
  res.json(torrent);
}

/**
 * Add magnet handler
 */
export async function addMagnetHandler(req, res) {
  const { magnet } = req.body;
  if (!magnet) {
    return res.status(400).json(createErrorResponse(400, 'magnet is required', ErrorCode.VALIDATION_ERROR));
  }
  if (!validators.validateMagnet(magnet)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid magnet URI format', ErrorCode.VALIDATION_ERROR));
  }
  const result = await rd.addMagnet(magnet);
  res.json(result);
}

/**
 * Unrestrict link handler
 */
export async function unrestrictHandler(req, res) {
  const { link } = req.body;
  if (!link) {
    return res.status(400).json(createErrorResponse(400, 'link is required', ErrorCode.VALIDATION_ERROR));
  }
  if (!validators.validateLink(link)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid or unsafe link URL', ErrorCode.VALIDATION_ERROR));
  }
  const result = await rd.unrestrict(link);
  res.json(result);
}

/**
 * List downloads handler
 */
export async function listDownloadsHandler(req, res) {
  const { offset, limit } = validators.validatePagination(req.query.offset, req.query.limit);
  const downloads = await rd.listDownloads(offset, limit);
  res.json(downloads);
}

/**
 * Get active streams handler
 */
export function getStreamsHandler(req, res) {
  res.json({
    active: proxy.getActiveStreams(),
    max: settings.get('maxConcurrentStreams'),
  });
}

/**
 * Proxy stream handler
 */
export async function proxyStreamHandler(req, res) {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json(createErrorResponse(400, 'url is required', ErrorCode.VALIDATION_ERROR));
  }

  const validation = await proxy.validateUrl(url);
  if (!validation.valid) {
    return res.status(403).json(createErrorResponse(403, validation.error, ErrorCode.FORBIDDEN));
  }

  const handler = proxy.createProxyHandler({ url, filename: 'stream' });
  await handler(req, res);
}

/**
 * Get library status handler
 */
export function getLibraryHandler(req, res) {
  res.json(library.getStatus());
}

/**
 * Force resync handler
 */
export async function resyncHandler(req, res) {
  await library.resync();
  res.json({ status: 'resync_complete', ...library.getStatus() });
}

/**
 * Force immediate sync handler
 */
export async function syncHandler(req, res) {
  await library.forceSync();
  res.json({ status: 'sync_complete', ...library.getStatus() });
}

/**
 * Get unmatched torrents handler
 */
export function getUnmatchedHandler(req, res) {
  const { offset: skip, limit } = validators.validatePagination(req.query.skip, req.query.limit);

  res.json({
    count: db.getUnmatchedCount(),
    items: db.getUnmatched(skip, limit),
  });
}

/**
 * Report progress handler
 */
export function reportProgressHandler(req, res) {
  const validation = validators.validateProgressReport(req.body);

  if (!validation.valid) {
    return res.status(400).json(createErrorResponse(400, validation.error, ErrorCode.VALIDATION_ERROR));
  }

  const data = validation.data;
  const cacheKey = getProgressCacheKey(data.imdb_id, data.season, data.episode);

  // Check debounce
  const lastUpdate = progressDebounce.get(cacheKey);
  const now = Date.now();
  if (lastUpdate && (now - lastUpdate) < PROGRESS_DEBOUNCE_MS) {
    return res.status(429).json(createErrorResponse(429, 'Progress update debounced', ErrorCode.RATE_LIMITED));
  }

  progressDebounce.set(cacheKey, now);

  // Clean up old debounce entries periodically
  if (progressDebounce.size > 1000) {
    const cutoff = now - PROGRESS_DEBOUNCE_MS;
    for (const [key, timestamp] of progressDebounce) {
      if (timestamp < cutoff) {
        progressDebounce.delete(key);
      }
    }
  }

  db.upsertWatchProgress(data);

  res.json({
    status: 'ok',
    progress: {
      imdbId: data.imdb_id,
      season: data.season,
      episode: data.episode,
      progressSeconds: data.progress_seconds,
      percentWatched: data.percent_watched,
    },
  });
}

/**
 * Get progress handler
 */
export function getProgressHandler(req, res) {
  const { imdbId } = req.params;
  const season = req.query.season ? parseInt(req.query.season, 10) : null;
  const episode = req.query.episode ? parseInt(req.query.episode, 10) : null;

  if (!validators.validateImdbId(imdbId)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid IMDB ID', ErrorCode.VALIDATION_ERROR));
  }

  // Validate season and episode are positive integers if provided
  if (season !== null && (isNaN(season) || season < 1)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid season number', ErrorCode.VALIDATION_ERROR));
  }
  if (episode !== null && (isNaN(episode) || episode < 1)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid episode number', ErrorCode.VALIDATION_ERROR));
  }

  const progress = db.getWatchProgress(imdbId, season, episode);

  res.json({ progress });
}

/**
 * Delete progress handler
 */
export function deleteProgressHandler(req, res) {
  const { imdbId } = req.params;
  const season = req.query.season ? parseInt(req.query.season, 10) : null;
  const episode = req.query.episode ? parseInt(req.query.episode, 10) : null;

  if (!validators.validateImdbId(imdbId)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid IMDB ID', ErrorCode.VALIDATION_ERROR));
  }

  db.deleteWatchProgress(imdbId, season, episode);

  res.json({ status: 'ok' });
}

/**
 * Get watch history handler
 */
export function getHistoryHandler(req, res) {
  const validation = validators.validateWatchHistoryQuery(req.query);

  if (!validation.valid) {
    return res.status(400).json(createErrorResponse(400, validation.error, ErrorCode.VALIDATION_ERROR));
  }

  const result = db.getWatchHistory(validation.data);

  res.json({
    items: result.items,
    total: result.total,
    skip: validation.data.skip,
    limit: validation.data.limit,
  });
}

/**
 * Get watch stats handler
 */
export function getHistoryStatsHandler(req, res) {
  const stats = db.getWatchStats();

  res.json({
    totalWatched: stats.totalWatched,
    totalMovies: stats.totalMovies,
    totalSeries: stats.totalSeries,
    totalTimeMinutes: Math.round(stats.totalTimeSeconds / 60),
    avgCompletion: Math.round(stats.avgCompletion * 100) / 100,
  });
}

/**
 * Mark item as completed handler
 */
export function markCompleteHandler(req, res) {
  const { imdbId } = req.params;
  const season = req.body?.season ? parseInt(req.body.season, 10) : null;
  const episode = req.body?.episode ? parseInt(req.body.episode, 10) : null;

  if (!validators.validateImdbId(imdbId)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid IMDB ID', ErrorCode.VALIDATION_ERROR));
  }

  const progress = db.getWatchProgress(imdbId, season, episode);

  if (!progress) {
    return res.status(404).json(createErrorResponse(404, 'Progress not found', ErrorCode.NOT_FOUND));
  }

  db.markWatchCompleted(progress.id);

  res.json({ status: 'ok' });
}

/**
 * Toggle low bandwidth mode handler
 * Enables/disables 480p transcoding for slower connections
 */
export function toggleBandwidthModeHandler(req, res) {
  const clientIp = req.ip;
  const enabled = req.body?.enabled === true;

  db.setLowBandwidthMode(clientIp, enabled);

  res.json({
    enabled,
    message: enabled ? 'Low bandwidth mode enabled (480p transcoding)' : 'Low bandwidth mode disabled (full quality)',
  });
}

/**
 * RD connection status handler
 * Returns RD user info and circuit breaker state
 */
export async function rdStatusHandler(req, res) {
  try {
    const user = await rd.getUser();
    res.json({
      connected: true,
      user,
      circuitBreaker: rd.getCircuitBreakerState(),
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error.response?.data?.error || error.message,
      circuitBreaker: rd.getCircuitBreakerState(),
    });
  }
}

/**
 * Get settings handler
 * Returns current settings with metadata
 */
export function getSettingsHandler(req, res) {
  const allSettings = settings.getAll();
  const metadata = settings.getMetadata();

  res.json({
    settings: allSettings,
    metadata,
  });
}

/**
 * Update settings handler
 * Updates settings and clears cache when transcoding changes, restarts timer when sync interval changes
 */
export function updateSettingsHandler(req, res) {
  const result = settings.updateMany(req.body);

  // If transcodingEnabled was changed, clear the URL cache
  // so the new setting takes effect immediately
  if (result.updated && 'transcodingEnabled' in result.updated) {
    stremio.clearUrlCache?.();
  }

  // If syncIntervalMin was changed, restart the sync timer
  // so the new interval takes effect immediately
  if (result.updated && 'syncIntervalMin' in result.updated) {
    library.restartSyncTimer();
  }

  res.json({
    success: result.errors.length === 0,
    updated: result.updated,
    errors: result.errors,
    message: result.errors.length === 0 ? 'All settings updated successfully' : 'Some settings failed to update',
  });
}
