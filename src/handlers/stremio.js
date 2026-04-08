/**
 * Stremio addon handlers
 * @module handlers/stremio
 */

import * as stremio from '../stremio.js';
import * as proxy from '../proxy.js';
import config from '../config.js';
import * as library from '../library.js';
import * as db from '../db.js';
import { validateStreamInfo, parseExtraParams } from '../validators.js';
import { ErrorCode, createErrorResponse } from '../errors.js';
import { noCache } from '../middleware.js';
import { generateConfigurePage } from '../configure.js';

/**
 * Manifest handler - returns addon manifest
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export function manifestHandler(req, res) {
  res.json(stremio.getManifest());
}

/**
 * Catalog handler - returns catalog items
 * Type validation handled by validateTypeParam middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export function catalogHandler(req, res) {
  const { type, id } = req.params;

  const extraParams = req.params.extra ? parseExtraParams(req.params.extra) : {};
  const result = stremio.handleCatalog(type, id, extraParams);

  // Prevent caching so new content appears immediately during sync
  noCache(req, res, () => res.json(result));
}

/**
 * Meta handler - returns metadata for a title
 * Type and IMDB ID validation handled by middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function metaHandler(req, res) {
  const { type, id } = req.params;
  const result = await stremio.handleMeta(type, id);
  res.json(result);
}

/**
 * Stream handler - returns available streams for a title
 * Type and IMDB ID validation handled by middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function streamHandler(req, res) {
  const { type, id } = req.params;

  // Token is only used when auth is enabled (determined by config in handleStream)
  const token = req.params.token;
  const result = await stremio.handleStream(type, id, token);
  res.json(result);
}

/**
 * Stream play handler - proxies the actual video stream
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function streamPlayHandler(req, res) {
  const streamInfo = stremio.decodeStreamInfo(req.params.encoded);

  if (!streamInfo) {
    return res.status(400).json(createErrorResponse(400, 'Invalid stream info', ErrorCode.BAD_REQUEST));
  }

  const validation = validateStreamInfo(streamInfo);
  if (!validation.valid) {
    return res.status(400).json(createErrorResponse(400, validation.error, ErrorCode.VALIDATION_ERROR));
  }

  const urlInfo = await stremio.getStreamUrl(streamInfo, req.ip);
  const handler = proxy.createProxyHandler(urlInfo);
  await handler(req, res);
}

/**
 * Subtitles handler - returns subtitles for a title (Stremio subtitles resource)
 * Type and IMDB ID validation handled by middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export function subtitlesHandler(req, res) {
  const { type, id } = req.params;

  const token = req.params.token;
  const result = stremio.handleSubtitles(type, id, token);
  res.json(result);
}

/**
 * Subtitle serve handler - proxies a subtitle file from RD
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function subtitleServeHandler(req, res) {
  const subtitleInfo = stremio.decodeStreamInfo(req.params.encoded);

  if (!subtitleInfo) {
    return res.status(400).json(createErrorResponse(400, 'Invalid subtitle info', ErrorCode.BAD_REQUEST));
  }

  const urlInfo = await stremio.getSubtitleUrl(subtitleInfo);

  if (!urlInfo) {
    return res.status(404).json(createErrorResponse(404, 'Subtitle file not available', ErrorCode.NOT_FOUND));
  }

  const handler = proxy.createProxyHandler(urlInfo);
  await handler(req, res);
}

/**
 * Configure page handler - returns HTML configuration page
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export function configureHandler(req, res) {
  const token = config.authEnabled ? req.params.token : null;
  const apiBase = config.authEnabled
    ? `${config.externalUrl}/${token}`
    : config.externalUrl;

  // Get low bandwidth mode for this client
  const lowBandwidthMode = db.getLowBandwidthMode(req.ip);

  const html = generateConfigurePage({
    library: library.getStatus(),
    streams: {
      active: proxy.getActiveStreams().length,
      max: config.maxConcurrentStreams,
    },
    token: token,
    apiBase: apiBase,
    lowBandwidthMode: lowBandwidthMode,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
