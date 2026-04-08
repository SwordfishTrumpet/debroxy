/**
 * Real-Debrid API client with retry logic, concurrency limiting, and circuit breaker
 * @module realdebrid
 */

import https from 'https';
import axios from 'axios';
import PQueue from 'p-queue';
import config from './config.js';
import { createLogger } from './logger.js';
import { rdCircuitBreaker } from './circuit-breaker.js';
import { RD_BASE_URL, RD_API_TIMEOUT_MS, RD_CONCURRENCY, MAX_RETRIES, INITIAL_RETRY_DELAY_MS } from './constants.js';

const log = createLogger('realdebrid');

// Concurrency limiter: max 4 concurrent RD API calls
const queue = new PQueue({ concurrency: RD_CONCURRENCY });

// HTTP keep-alive agent for connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: RD_CONCURRENCY,
  timeout: RD_API_TIMEOUT_MS,
});

// Axios instance with auth header and keep-alive
const client = axios.create({
  baseURL: RD_BASE_URL,
  headers: {
    Authorization: `Bearer ${config.rdApiKey}`,
  },
  timeout: RD_API_TIMEOUT_MS,
  httpsAgent,
});

/**
 * Execute request with retry logic
 * @param {Function} requestFn - Function that returns a promise
 * @param {number} retries - Number of retries remaining
 * @returns {Promise} Response data
 */
async function withRetry(requestFn, retries = MAX_RETRIES) {
  try {
    const response = await requestFn();
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    const shouldRetry = retries > 0 && (
      status === 429 || // Rate limited
      status >= 500 || // Server error
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    );

    if (shouldRetry) {
      // Exponential backoff: 1s, 2s, 4s (for 3 retries)
      const attempt = MAX_RETRIES - retries;
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      log.warn({ status, retries, delay }, 'RD API request failed, retrying...');
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(requestFn, retries - 1);
    }

    log.error({ 
      status, 
      message: error.response?.data?.error || error.message,
      endpoint: error.config?.url, 
    }, 'RD API request failed');
    throw error;
  }
}

/**
 * Queue a request through the concurrency limiter and circuit breaker
 * @param {Function} requestFn - Function that returns a promise
 * @returns {Promise} Response data
 */
function queueRequest(requestFn) {
  // Wrap the request with circuit breaker, then queue it
  const protectedRequest = rdCircuitBreaker.wrap(() => withRetry(requestFn));
  return queue.add(protectedRequest);
}

/**
 * Get circuit breaker state for monitoring
 * @returns {Object} Circuit breaker state
 */
export function getCircuitBreakerState() {
  return rdCircuitBreaker.getState();
}

/**
 * Reset circuit breaker (for recovery or testing)
 */
export function resetCircuitBreaker() {
  rdCircuitBreaker.reset();
}

/**
 * Get current user information
 * @returns {Promise<Object>} User info
 */
export async function getUser() {
  return queueRequest(() => client.get('/user'));
}

/**
 * List torrents with pagination
 * @param {number} offset - Starting offset
 * @param {number} limit - Max items (default 100, max 2500)
 * @returns {Promise<Array>} Array of torrent objects
 */
export async function listTorrents(offset = 0, limit = 100) {
  return queueRequest(() => client.get('/torrents', {
    params: { offset, limit },
  }));
}

/**
 * Get detailed torrent information
 * @param {string} id - Torrent ID
 * @returns {Promise<Object>} Torrent info with files
 */
export async function getTorrentInfo(id) {
  return queueRequest(() => client.get(`/torrents/info/${id}`));
}

/**
 * Add a magnet link
 * @param {string} magnet - Magnet URI
 * @returns {Promise<Object>} { id, uri }
 */
export async function addMagnet(magnet) {
  return queueRequest(() => client.post('/torrents/addMagnet', 
    new URLSearchParams({ magnet }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  ));
}

/**
 * Select files to download from a torrent
 * @param {string} torrentId - Torrent ID
 * @param {string|Array} files - File IDs (comma-separated or 'all')
 * @returns {Promise<void>}
 */
export async function selectFiles(torrentId, files = 'all') {
  const fileIds = Array.isArray(files) ? files.join(',') : files;
  return queueRequest(() => client.post(`/torrents/selectFiles/${torrentId}`,
    new URLSearchParams({ files: fileIds }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  ));
}

/**
 * Delete a torrent
 * @param {string} id - Torrent ID
 * @returns {Promise<void>}
 */
export async function deleteTorrent(id) {
  return queueRequest(() => client.delete(`/torrents/delete/${id}`));
}

/**
 * Unrestrict a link (generate direct download URL)
 * @param {string} link - Original link to unrestrict
 * @returns {Promise<Object>} { download, filename, filesize, ... }
 */
export async function unrestrict(link) {
  return queueRequest(() => client.post('/unrestrict/link',
    new URLSearchParams({ link }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  ));
}

/**
 * Check instant availability for torrent hashes
 * @param {Array<string>} hashes - Array of torrent hashes
 * @returns {Promise<Object>} Availability data by hash
 */
export async function instantAvailability(hashes) {
  const hashList = Array.isArray(hashes) ? hashes.join('/') : hashes;
  return queueRequest(() => client.get(`/torrents/instantAvailability/${hashList}`));
}

/**
 * List downloads history
 * @param {number} offset - Starting offset
 * @param {number} limit - Max items
 * @returns {Promise<Array>} Array of download objects
 */
export async function listDownloads(offset = 0, limit = 100) {
  return queueRequest(() => client.get('/downloads', {
    params: { offset, limit },
  }));
}

/**
 * Get active hosts
 * @returns {Promise<Object>} Hosts data
 */
export async function getHosts() {
  return queueRequest(() => client.get('/hosts'));
}

/**
 * Get transcoding links for a file
 * @param {string} fileId - File ID from /unrestrict/link
 * @returns {Promise<Object|null>} Transcoding data or null if unavailable
 */
export async function getTranscodeLinks(fileId) {
  try {
    const data = await queueRequest(() => client.get(`/streaming/transcode/${fileId}`));
    return data;
  } catch (error) {
    // Transcoding not available for this file
    log.debug({ fileId, error: error.response?.data?.error || error.message }, 'Transcoding not available');
    return null;
  }
}

/**
 * Get media info for a file
 * @param {string} fileId - File ID from /unrestrict/link
 * @returns {Promise<Object|null>} Media info or null if unavailable
 */
export async function getMediaInfo(fileId) {
  try {
    const data = await queueRequest(() => client.get(`/streaming/mediaInfos/${fileId}`));
    return data;
  } catch (error) {
    log.debug({ fileId, error: error.response?.data?.error || error.message }, 'Media info not available');
    return null;
  }
}

export default {
  getUser,
  listTorrents,
  getTorrentInfo,
  addMagnet,
  selectFiles,
  deleteTorrent,
  unrestrict,
  getTranscodeLinks,
  getMediaInfo,
  instantAvailability,
  listDownloads,
  getHosts,
  getCircuitBreakerState,
  resetCircuitBreaker,
};
