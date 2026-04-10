/**
 * Library sync engine
 * Syncs Real-Debrid torrents to local SQLite database
 * @module library
 */

import axios from 'axios';
import PQueue from 'p-queue';
import { LRUCache } from 'lru-cache';
import * as db from './db.js';
import * as rd from './realdebrid.js';
import * as parser from './parser.js';
import * as settings from './settings.js';
import { createLogger } from './logger.js';
import { 
  CINEMETA_BASE_URL, 
  CINEMETA_TIMEOUT_MS, 
  CINEMETA_CONCURRENCY,
  RD_PAGE_SIZE,
  RD_INITIAL_OFFSET,
  INITIAL_RETRY_DELAY_MS,
  SYNC_BATCH_SIZE,
} from './constants.js';

const log = createLogger('library');

let syncTimer = null;
let isSyncing = false;

// Cinemeta request queue with concurrency limit
const cinemetaQueue = new PQueue({ concurrency: CINEMETA_CONCURRENCY });

// Cinemeta search results cache (max 1000 entries, TTL 24 hours)
const cinemetaCache = new LRUCache({
  max: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

/** Maximum queue size for Cinemeta requests to prevent OOM */
const CINEMETA_QUEUE_SIZE = parseInt(process.env.CINEMETA_QUEUE_SIZE || '1000', 10);

/** Maximum sync loop iterations to prevent infinite loops */
const MAX_SYNC_ITERATIONS = parseInt(process.env.MAX_SYNC_ITERATIONS || '10000', 10);

/** Batch size for incremental sync processing */
const INCREMENTAL_BATCH_SIZE = parseInt(process.env.INCREMENTAL_BATCH_SIZE || '50', 10);

/**
 * Wrapper function to enforce queue size limit with backpressure
 * @param {Function} fn - Function to enqueue
 * @param {number} priority - Queue priority (lower = higher priority)
 * @returns {Promise<any>} Result of the function or null if queue is full
 */
async function enqueueCinemetaRequest(fn, priority = 0) {
  if (cinemetaQueue.size >= CINEMETA_QUEUE_SIZE) {
    log.warn({ queueSize: cinemetaQueue.size, maxSize: CINEMETA_QUEUE_SIZE }, 'Cinemeta queue full, skipping request');
    return null; // Graceful degradation
  }
  return cinemetaQueue.add(fn, { priority });
}

/** Maximum retries for Cinemeta rate limiting */
const CINEMETA_MAX_RETRIES = parseInt(process.env.CINEMETA_MAX_RETRIES || '3', 10);

/** Minimum Cinemeta match score to accept (0.0 - 1.0) */
const MIN_CINEMETA_SCORE = 0.4;

/**
 * Search Cinemeta for a title (with caching)
 * @param {string} query - Search query
 * @param {string} type - 'movie' or 'series'
 * @param {number} retryCount - Current retry attempt (internal use)
 * @returns {Promise<Object|null>} Best matching result or null
 */
async function searchCinemeta(query, type, retryCount = 0) {
  // Normalize query for cache key
  const normalizedQuery = query.toLowerCase().trim();
  const cacheKey = `${type}:${normalizedQuery}`;
  
  // Check cache first
  const cached = cinemetaCache.get(cacheKey);
  if (cached !== undefined) {
    log.debug({ cacheKey, hit: true }, 'Cinemeta cache hit');
    return cached; // May be null (negative caching)
  }
  
  try {
    const url = `${CINEMETA_BASE_URL}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
    const response = await axios.get(url, { timeout: CINEMETA_TIMEOUT_MS });
    
    const metas = response.data?.metas || [];
    if (metas.length === 0) {
      // Cache null result (negative caching)
      cinemetaCache.set(cacheKey, null);
      log.debug({ cacheKey, hit: false }, 'Cinemeta cache miss (no results)');
      return null;
    }

    // Score matches by title similarity and return best
    const queryLower = query.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    for (const meta of metas.slice(0, 10)) {
      const score = scoreMatch(queryLower, meta);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = meta;
      }
    }

    // Require minimum confidence
    if (bestScore < MIN_CINEMETA_SCORE) {
      log.debug({ query, type, bestScore, threshold: MIN_CINEMETA_SCORE }, 'No confident Cinemeta match');
      // Cache null result (negative caching)
      cinemetaCache.set(cacheKey, null);
      return null;
    }

    // Cache successful result
    cinemetaCache.set(cacheKey, bestMatch);
    log.debug({ cacheKey, hit: false }, 'Cinemeta cache miss (cached result)');
    return bestMatch;
  } catch (error) {
    if (error.response?.status === 429) {
      if (retryCount >= CINEMETA_MAX_RETRIES) {
        log.error({ query, type, retries: retryCount }, 'Cinemeta rate limited, max retries exceeded');
        return null;
      }
      // Exponential backoff with jitter to prevent thundering herd
      const baseDelay = Math.pow(2, retryCount) * INITIAL_RETRY_DELAY_MS; // 1s, 2s, 4s
      const jitter = Math.random() * INITIAL_RETRY_DELAY_MS; // 0-1s random jitter
      const delay = baseDelay + jitter;
      log.warn({ retry: retryCount + 1, maxRetries: CINEMETA_MAX_RETRIES, delayMs: Math.round(delay) }, 'Cinemeta rate limited, retrying...');
      await new Promise(r => setTimeout(r, delay));
      return searchCinemeta(query, type, retryCount + 1);
    }
    log.debug({ query, error: error.message }, 'Cinemeta search failed');
    return null;
  }
}

/**
 * Get detailed metadata from Cinemeta by IMDB ID
 * @param {string} imdbId - IMDB ID
 * @param {string} type - 'movie' or 'series'
 * @returns {Promise<Object|null>} Metadata or null
 */
async function getCinemetaMeta(imdbId, type) {
  try {
    const url = `${CINEMETA_BASE_URL}/meta/${type}/${imdbId}.json`;
    const response = await axios.get(url, { timeout: CINEMETA_TIMEOUT_MS });
    return response.data?.meta || null;
  } catch (error) {
    log.debug({ imdbId, error: error.message }, 'Cinemeta meta fetch failed');
    return null;
  }
}

/**
 * Score a Cinemeta result against search query
 * @param {string} queryLower - Lowercase search query
 * @param {Object} meta - Cinemeta result
 * @returns {number} Score between 0 and 1
 */
function scoreMatch(queryLower, meta) {
  const nameLower = (meta.name || '').toLowerCase();
  let score = 0;

  // Exact match
  if (nameLower === queryLower) {
    score = 1.0;
  }
  // Contains full query
  else if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
    score = 0.8;
  }
  // Word overlap
  else {
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const nameWords = nameLower.split(/\s+/).filter(w => w.length > 2);
    const overlap = queryWords.filter(w => nameWords.includes(w)).length;
    score = queryWords.length > 0 ? (overlap / queryWords.length) * 0.7 : 0;
  }

  // Bonus for year match in query
  const yearMatch = queryLower.match(/\b(19|20)\d{2}\b/);
  if (yearMatch && meta.year) {
    if (parseInt(yearMatch[0]) === parseInt(meta.year)) {
      score += 0.2;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Process a single torrent: parse, match, and store
 * @param {Object} torrent - RD torrent object
 * @returns {Promise<boolean>} True if successfully indexed
 */
async function processTorrent(torrent) {
  const filename = torrent.filename || '';
  const parsed = parser.parse(filename);

  if (!parsed.title) {
    db.markUnmatched({
      rd_id: torrent.id,
      filename,
      reason: 'parse_failed',
    });
    return false;
  }

  // Build search query (with year)
  const searchQuery = parser.buildSearchQuery(parsed);
  
  // Search Cinemeta for matching title
  let meta = await enqueueCinemetaRequest(() => 
    searchCinemeta(searchQuery, parsed.type),
  );

  // If no match and we have a year, try without year
  if ((!meta || !meta.imdb_id) && parsed.year) {
    const queryWithoutYear = parsed.title;
    log.debug({ searchQuery, queryWithoutYear }, 'Retrying Cinemeta search without year');
    meta = await enqueueCinemetaRequest(() => 
      searchCinemeta(queryWithoutYear, parsed.type),
    );
  }

  if (!meta || !meta.imdb_id) {
    // Try alternate type (bidirectional: series→movie and movie→series)
    const alternateType = parsed.type === 'series' ? 'movie' : 'series';
    const altMeta = await enqueueCinemetaRequest(() => 
      searchCinemeta(searchQuery, alternateType),
    );
    if (altMeta?.imdb_id) {
      return await storeTorrent(torrent, parsed, altMeta, alternateType);
    }

    db.markUnmatched({
      rd_id: torrent.id,
      filename,
      reason: 'no_cinemeta_match',
    });
    return false;
  }

  return await storeTorrent(torrent, parsed, meta, parsed.type);
}

/**
 * Store torrent and title in database
 * @param {Object} torrent - RD torrent
 * @param {Object} parsed - Parsed metadata
 * @param {Object} meta - Cinemeta metadata
 * @param {string} type - Content type
 * @returns {Promise<boolean>} Success status
 */
async function storeTorrent(torrent, parsed, meta, type) {
  try {
    // Upsert title
    db.upsertTitle({
      imdb_id: meta.imdb_id || meta.id,
      type,
      name: meta.name,
      year: meta.year ? parseInt(meta.year) : parsed.year,
      poster: meta.poster,
      background: meta.background,
      description: meta.description,
      genres: meta.genres,
      imdb_rating: meta.imdbRating ? parseFloat(meta.imdbRating) : null,
    });

    // Upsert torrent
    db.upsertTorrent({
      rd_id: torrent.id,
      imdb_id: meta.imdb_id || meta.id,
      hash: torrent.hash,
      filename: torrent.filename,
      quality: parsed.quality,
      source: parsed.source,
      codec: parsed.codec,
      audio: parsed.audio,
      hdr: parsed.hdr,
      year: parsed.year,
      season: parsed.season,
      episode: parsed.episode,
    });

    // Season pack file fetching is now done lazily on-demand (see stremio.js getStreamUrl)
    // This avoids hammering RD API during initial sync

    // Remove from unmatched if it was there
    db.removeUnmatched(torrent.id);

    return true;
  } catch (error) {
    log.error({ rdId: torrent.id, error: error.message }, 'Failed to store torrent');
    return false;
  }
}

/**
 * Fetch and store files for a season pack
 * @param {string} rdTorrentId - RD torrent ID
 */
async function storeSeasonPackFiles(rdTorrentId) {
  try {
    const info = await rd.getTorrentInfo(rdTorrentId);
    if (!info.files || info.files.length === 0) return;

    const videoFiles = info.files.filter(f => 
      /\.(mkv|mp4|avi|mov|wmv)$/i.test(f.path),
    );

    const files = videoFiles.map((file, idx) => {
      const episodeInfo = parser.parseEpisodeFromFilename(file.path);
      return {
        rd_file_id: file.id,
        filename: file.path,
        filesize: file.bytes,
        link: info.links?.[idx] || null,
        season: episodeInfo?.season || null,
        episode: episodeInfo?.episode || null,
      };
    });

    if (files.length > 0) {
      db.insertFiles(rdTorrentId, files);
    }

    // Detect and store subtitle files (separately from video file index mapping)
    const subtitleFiles = info.files.filter(f => parser.isSubtitleFile(f.path));
    if (subtitleFiles.length > 0) {
      const subs = subtitleFiles.map(file => {
        const subInfo = parser.parseSubtitleInfo(file.path);
        const episodeInfo = parser.parseEpisodeFromFilename(file.path);
        return {
          rd_file_id: file.id,
          filename: file.path,
          filesize: file.bytes,
          link: null, // Links resolved at play time via getSubtitleUrl
          language: subInfo.language,
          language_code: subInfo.languageCode,
          format: subInfo.format,
          season: episodeInfo?.season || null,
          episode: episodeInfo?.episode || null,
        };
      });
      db.insertSubtitleFiles(rdTorrentId, subs);
      log.debug({ rdTorrentId, subtitleCount: subs.length }, 'Indexed subtitle files');
    }

    return files.length;
  } catch (error) {
    log.debug({ rdTorrentId, error: error.message }, 'Failed to fetch season pack files');
    return 0;
  }
}

/** Delay between RD API calls for season pack file loading (ms) - default 5 seconds */
const RD_FILE_LOAD_DELAY_MS = parseInt(process.env.RD_FILE_LOAD_DELAY_MS || '5000', 10);

/** Log progress interval for season pack file loading */
const RD_FILE_LOAD_LOG_INTERVAL = parseInt(process.env.RD_FILE_LOAD_LOG_INTERVAL || '50', 10);

/** Backoff time when rate limited (ms) - default 60 seconds */
const RD_RATE_LIMIT_BACKOFF_MS = parseInt(process.env.RD_RATE_LIMIT_BACKOFF_MS || '60000', 10);

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Background file loading state */
let fileLoadingActive = false;

/**
 * Load files for all season packs that don't have files yet
 * Runs as a slow background process to avoid overwhelming RD API
 * @returns {Promise<void>}
 */
async function loadAllSeasonPackFiles() {
  // Prevent multiple concurrent runs
  if (fileLoadingActive) {
    log.debug('Season pack file loading already active, skipping');
    return;
  }
  
  const seasonPacks = db.getSeasonPacksWithoutFiles();
  
  if (seasonPacks.length === 0) {
    log.info('No season packs need file loading');
    return;
  }

  fileLoadingActive = true;
  
  log.info({ 
    count: seasonPacks.length, 
    delayMs: RD_FILE_LOAD_DELAY_MS,
    estimatedMinutes: Math.ceil((seasonPacks.length * RD_FILE_LOAD_DELAY_MS) / 60000),
  }, 'Starting background season pack file loading...');
  
  let loaded = 0;
  let totalFiles = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  
  // Process one at a time with significant delay between requests
  for (let i = 0; i < seasonPacks.length; i++) {
    const pack = seasonPacks[i];
    
    try {
      const fileCount = await storeSeasonPackFiles(pack.rd_id);
      if (fileCount > 0) {
        loaded++;
        totalFiles += fileCount;
      }
      consecutiveErrors = 0; // Reset on success
    } catch (error) {
      errors++;
      consecutiveErrors++;
      
      if (error.response?.status === 429 || consecutiveErrors >= 3) {
        // Back off significantly on rate limit or repeated errors
        log.warn({ 
          rdId: pack.rd_id, 
          backoffMs: RD_RATE_LIMIT_BACKOFF_MS,
          consecutiveErrors,
        }, 'Rate limited or repeated errors, backing off...');
        await sleep(RD_RATE_LIMIT_BACKOFF_MS);
        consecutiveErrors = 0; // Reset after backoff
      }
    }
    
    // Log progress periodically
    if ((i + 1) % RD_FILE_LOAD_LOG_INTERVAL === 0 || i === seasonPacks.length - 1) {
      const eta = Math.ceil(((seasonPacks.length - i - 1) * RD_FILE_LOAD_DELAY_MS) / 60000);
      log.info({ 
        progress: `${i + 1}/${seasonPacks.length}`,
        loaded,
        totalFiles,
        errors,
        etaMinutes: eta,
      }, 'Season pack file loading progress');
    }
    
    // Delay between requests (skip delay on last item)
    if (i < seasonPacks.length - 1) {
      await sleep(RD_FILE_LOAD_DELAY_MS);
    }
  }

  fileLoadingActive = false;
  
  log.info({ 
    loaded, 
    totalFiles, 
    total: seasonPacks.length,
    errors,
  }, 'Season pack file loading complete');
}

let syncLock = false;

/**
 * Atomically acquire sync lock
 * @returns {boolean} True if lock acquired, false if already locked
 */
function acquireSyncLock() {
  if (syncLock) return false;
  syncLock = true;
  return true;
}

/**
 * Release sync lock
 */
function releaseSyncLock() {
  syncLock = false;
}

/**
 * Perform initial full sync
 * @returns {Promise<void>}
 */
async function initialSync() {
  if (!acquireSyncLock()) {
    log.debug('Sync already in progress, skipping initial sync');
    return;
  }

  isSyncing = true;
  log.info('Starting initial library sync...');
  
  const startOffset = parseInt(db.getSyncState('sync_offset') || String(RD_INITIAL_OFFSET), 10);
  let offset = startOffset;
  let total = 0;
  let indexed = 0;
  let iterations = 0;

  try {
    while (true) {
      iterations++;
      if (iterations > MAX_SYNC_ITERATIONS) {
        log.error({ maxIterations: MAX_SYNC_ITERATIONS, offset }, 'Sync iteration limit reached, stopping');
        break;
      }

      const torrents = await rd.listTorrents(offset, RD_PAGE_SIZE);
      
      if (!torrents || torrents.length === 0) {
        break;
      }

      if (offset === RD_INITIAL_OFFSET && torrents.length > 0) {
        // Estimate total from first batch
        total = torrents.length > 50 ? torrents.length * 10 : torrents.length;
      }

      // Filter already indexed torrents
      const newTorrents = torrents.filter(t => !db.isIndexed(t.id));

      // Process in smaller chunks to avoid overwhelming RD API
      let successful = 0;
      for (let i = 0; i < newTorrents.length; i += SYNC_BATCH_SIZE) {
        const chunk = newTorrents.slice(i, i + SYNC_BATCH_SIZE);
        const results = await Promise.allSettled(
          chunk.map(t => processTorrent(t)),
        );
        successful += results.filter(r => r.status === 'fulfilled' && r.value).length;
        
        // Log rejected promise reasons for debugging
        const rejected = results.filter(r => r.status === 'rejected');
        for (const result of rejected) {
          log.debug({ error: result.reason?.message || result.reason }, 'Torrent processing rejected');
        }
      }
      indexed += successful;

      const processed = Math.max(0, offset - RD_INITIAL_OFFSET);
      const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
      log.info({ 
        indexed, 
        offset, 
        batch: newTorrents.length,
        successful,
        progress: `${progress}%`, 
      }, `Indexed ${indexed} torrents`);

      // Save progress for resume
      offset += RD_PAGE_SIZE;
      db.setSyncState('sync_offset', String(offset));

      // Check if we've processed all
      if (torrents.length < RD_PAGE_SIZE) {
        break;
      }
    }

    // Mark initial sync complete
    db.setSyncState('initial_sync_complete', 'true');
    db.setSyncState('last_sync', String(Date.now()));
    db.deleteSyncState('sync_offset');

    const stats = db.getStats();
    log.info(stats, 'Initial sync complete');

    // Start background file loading for season packs (non-blocking)
    loadAllSeasonPackFiles().catch(err => 
      log.error({ error: err.message }, 'Background file loading failed'),
    );
  } catch (error) {
    log.error({ error: error.message, offset }, 'Initial sync failed');
    throw error;
  } finally {
    isSyncing = false;
    releaseSyncLock();
  }
}

/**
 * Perform incremental sync (new/removed torrents only)
 * Uses batch processing with Promise.allSettled for better throughput
 * @returns {Promise<void>}
 */
async function incrementalSync() {
  if (!acquireSyncLock()) {
    log.debug('Sync already in progress, skipping');
    return;
  }

  isSyncing = true;
  log.info('Starting incremental sync...');

  try {
    // Get current RD torrents
    const currentIds = new Set();
    const newTorrents = []; // Collect new torrents for batch processing
    let offset = RD_INITIAL_OFFSET;
    let iterations = 0;

    // First pass: collect all torrents and identify new ones
    while (true) {
      iterations++;
      if (iterations > MAX_SYNC_ITERATIONS) {
        log.error({ maxIterations: MAX_SYNC_ITERATIONS, offset }, 'Incremental sync iteration limit reached');
        break;
      }

      const torrents = await rd.listTorrents(offset, RD_PAGE_SIZE);
      if (!torrents || torrents.length === 0) break;

      for (const torrent of torrents) {
        currentIds.add(torrent.id);

        // Collect if not already indexed
        if (!db.isIndexed(torrent.id)) {
          newTorrents.push(torrent);
        }
      }

      offset += RD_PAGE_SIZE;
      if (torrents.length < RD_PAGE_SIZE) break;
    }

    // Process new torrents in batches with Promise.allSettled
    let processedCount = 0;
    let successCount = 0;
    
    for (let i = 0; i < newTorrents.length; i += INCREMENTAL_BATCH_SIZE) {
      const batch = newTorrents.slice(i, i + INCREMENTAL_BATCH_SIZE);
      
      // Check queue size before processing to prevent overflow
      if (cinemetaQueue.size >= CINEMETA_QUEUE_SIZE - batch.length) {
        log.warn({ queueSize: cinemetaQueue.size }, 'Cinemeta queue near capacity, waiting for drain');
        await cinemetaQueue.onIdle();
      }
      
      const results = await Promise.allSettled(
        batch.map(t => processTorrent(t)),
      );
      
      processedCount += batch.length;
      successCount += results.filter(r => r.status === 'fulfilled' && r.value).length;
      
      log.debug({ 
        batch: batch.length, 
        processed: processedCount, 
        total: newTorrents.length,
        success: successCount,
      }, 'Processed batch');
    }

    if (newTorrents.length > 0) {
      log.info({ processed: processedCount, success: successCount }, 'Batch processing complete');
    }

    // Remove torrents no longer in RD
    const indexedIds = db.getAllTorrentIds();
    let removed = 0;

    for (const rdId of indexedIds) {
      if (!currentIds.has(rdId)) {
        // Get imdb_id before removing for orphan cleanup
        const imdbId = db.getImdbIdByRdId(rdId);
        db.removeTorrent(rdId, imdbId);
        db.removeUnmatched(rdId);
        removed++;
      }
    }

    db.setSyncState('last_sync', String(Date.now()));
    
    const stats = db.getStats();
    log.info({ ...stats, removed, newProcessed: processedCount }, 'Incremental sync complete');

    // Start background file loading for any new season packs (non-blocking)
    loadAllSeasonPackFiles().catch(err => 
      log.error({ error: err.message }, 'Background file loading failed'),
    );

    // Mark completed items based on threshold
    const watchThreshold = settings.get('watchCompletionThreshold');
    const completedCount = db.markCompletedByThreshold(watchThreshold);
    if (completedCount > 0) {
      log.info({ completedCount, threshold: watchThreshold }, 'Marked items as completed');
    }

    // Clean up old completed watch history entries
    const cleanedCount = db.cleanupOldWatchHistory(90);
    if (cleanedCount > 0) {
      log.info({ cleanedCount }, 'Cleaned up old watch history entries');
    }
  } catch (error) {
    log.error({ error: error.message }, 'Incremental sync failed');
  } finally {
    isSyncing = false;
    releaseSyncLock();
  }
}

/**
 * Restart the sync timer (called when syncIntervalMin changes)
 */
export function restartSyncTimer() {
  if (syncTimer) {
    log.info('Restarting sync timer with new interval');
    startSyncTimer();
  }
}

/**
 * Start the sync timer
 */
export function startSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  const intervalMs = settings.get('syncIntervalMin') * 60 * 1000;
  syncTimer = setInterval(incrementalSync, intervalMs);
  log.info({ intervalMin: settings.get('syncIntervalMin') }, 'Sync timer started');
}

/**
 * Stop the sync timer
 */
export function stopSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    log.info('Sync timer stopped');
  }
}

/**
 * Initialize library: run initial sync if needed, then start timer
 * @returns {Promise<void>}
 */
export async function initialize() {
  const isComplete = db.getSyncState('initial_sync_complete') === 'true';

  if (!isComplete) {
    await initialSync();
  } else {
    // Run incremental sync on startup
    await incrementalSync();
  }

  // Mark completed items on startup
  const startupThreshold = settings.get('watchCompletionThreshold');
  const completedCount = db.markCompletedByThreshold(startupThreshold);
  if (completedCount > 0) {
    log.info({ completedCount }, 'Marked items as completed on startup');
  }

  startSyncTimer();
}

/**
 * Force a full re-sync (clear and rebuild)
 * @returns {Promise<void>}
 */
export async function resync() {
  log.info('Starting full resync...');
  
  // Clear sync state
  db.deleteSyncState('initial_sync_complete');
  db.deleteSyncState('sync_offset');
  db.deleteSyncState('last_sync');

  try {
    await initialSync();
  } catch (error) {
    // Ensure sync lock is released even on error to prevent deadlock
    releaseSyncLock();
    log.error({ error: error.message }, 'Full resync failed');
    throw error;
  }
}

/**
 * Force an immediate incremental sync
 * @returns {Promise<void>}
 */
export async function forceSync() {
  await incrementalSync();
  // Ensure timer is running after force sync
  if (!syncTimer) {
    startSyncTimer();
  }
}

/**
 * Get sync status
 * @returns {Object} Sync status
 */
export function getStatus() {
  return {
    isSyncing,
    isComplete: db.getSyncState('initial_sync_complete') === 'true',
    lastSync: db.getSyncState('last_sync'),
    currentOffset: db.getSyncState('sync_offset'),
    stats: db.getStats(),
  };
}

/**
 * Search Cinemeta (exported for external use)
 */
export { getCinemetaMeta };

export default {
  initialize,
  startSyncTimer,
  stopSyncTimer,
  restartSyncTimer,
  resync,
  forceSync,
  getStatus,
  getCinemetaMeta,
};
