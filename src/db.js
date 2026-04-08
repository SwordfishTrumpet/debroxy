/**
 * SQLite database module with better-sqlite3
 * @module db
 */

import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('db');
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Maximum retries for database connection */
const DB_MAX_RETRIES = parseInt(process.env.DB_MAX_RETRIES || '5', 10);

/**
 * Stats cache (TTL 30 seconds)
 * Invalidated on write operations that affect stats
 */
const statsCache = new LRUCache({
  max: 1,
  ttl: 30 * 1000, // 30 seconds
});

const STATS_CACHE_KEY = 'library_stats';

/**
 * Invalidate the stats cache
 * Called after write operations that affect library counts
 */
function invalidateStatsCache() {
  statsCache.delete(STATS_CACHE_KEY);
}

/**
 * Initialize database connection with retry logic
 * @returns {Database} better-sqlite3 database instance
 */
function initializeDatabase() {
  // Ensure data directory exists
  const dbDir = dirname(config.dbPath);
  mkdirSync(dbDir, { recursive: true });

  let lastError = null;
  
  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      const database = new Database(config.dbPath);
      database.pragma('journal_mode = WAL');
      database.pragma('foreign_keys = ON');
      database.pragma('busy_timeout = 5000');
      
      log.info({ path: config.dbPath, attempts: attempt }, 'Database initialized');
      return database;
    } catch (error) {
      lastError = error;
      const delayMs = Math.pow(2, attempt - 1) * 100; // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
      log.warn({ 
        attempt, 
        maxRetries: DB_MAX_RETRIES, 
        delayMs, 
        error: error.message, 
      }, 'Database connection failed, retrying...');
      
      if (attempt < DB_MAX_RETRIES) {
        // Synchronous sleep using Atomics.wait (efficient, no CPU burn)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      }
    }
  }
  
  log.fatal({ error: lastError?.message, path: config.dbPath }, 'Database connection failed after max retries');
  process.exit(1);
}

// Initialize database with retry logic
const db = initializeDatabase();

/**
 * Database schema for version 1
 * Creates all tables and indexes
 */
const SCHEMA_SQL = `
-- Titles table: stores movie/series metadata from Cinemeta
CREATE TABLE IF NOT EXISTS titles (
    imdb_id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('movie', 'series')),
    name TEXT NOT NULL,
    year INTEGER,
    poster TEXT,
    background TEXT,
    description TEXT,
    genres TEXT,
    imdb_rating REAL,
    added_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Torrents table: stores RD torrent entries
CREATE TABLE IF NOT EXISTS torrents (
    rd_id TEXT PRIMARY KEY,
    imdb_id TEXT NOT NULL REFERENCES titles(imdb_id) ON DELETE CASCADE,
    hash TEXT,
    filename TEXT NOT NULL,
    quality TEXT,
    source TEXT,
    codec TEXT,
    audio TEXT,
    hdr TEXT,
    season INTEGER,
    episode INTEGER,
    added_at INTEGER NOT NULL
);

-- Torrent files table: individual files within torrents (for season packs)
CREATE TABLE IF NOT EXISTS torrent_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rd_torrent_id TEXT NOT NULL REFERENCES torrents(rd_id) ON DELETE CASCADE,
    rd_file_id INTEGER,
    filename TEXT NOT NULL,
    filesize INTEGER,
    link TEXT,
    season INTEGER,
    episode INTEGER
);

-- Subtitle files table: subtitle files within torrents
CREATE TABLE IF NOT EXISTS subtitle_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rd_torrent_id TEXT NOT NULL REFERENCES torrents(rd_id) ON DELETE CASCADE,
    rd_file_id INTEGER,
    filename TEXT NOT NULL,
    filesize INTEGER,
    link TEXT,
    language TEXT,
    language_code TEXT,
    format TEXT NOT NULL,
    season INTEGER,
    episode INTEGER
);

-- Unmatched table: torrents that couldn't be identified
CREATE TABLE IF NOT EXISTS unmatched (
    rd_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    reason TEXT,
    added_at INTEGER NOT NULL
);

-- Sync state table: key-value store for sync progress/state
CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Watch history table: tracks playback progress
CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imdb_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('movie', 'series')),
    season INTEGER,
    episode INTEGER,
    progress_seconds REAL NOT NULL DEFAULT 0,
    duration_seconds REAL,
    percent_watched REAL NOT NULL DEFAULT 0,
    is_completed INTEGER NOT NULL DEFAULT 0,
    watch_count INTEGER NOT NULL DEFAULT 1,
    last_watched_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(imdb_id, season, episode)
);

-- Indexes for performance with 50K+ torrents
CREATE INDEX IF NOT EXISTS idx_titles_type ON titles(type);
CREATE INDEX IF NOT EXISTS idx_titles_name ON titles(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_titles_year ON titles(year);
CREATE INDEX IF NOT EXISTS idx_titles_added ON titles(added_at DESC);

CREATE INDEX IF NOT EXISTS idx_torrents_imdb ON torrents(imdb_id);
CREATE INDEX IF NOT EXISTS idx_torrents_added ON torrents(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_torrents_season_ep ON torrents(season, episode);

CREATE INDEX IF NOT EXISTS idx_torrent_files_torrent ON torrent_files(rd_torrent_id);
CREATE INDEX IF NOT EXISTS idx_torrent_files_episode ON torrent_files(season, episode);

CREATE INDEX IF NOT EXISTS idx_subtitle_files_torrent ON subtitle_files(rd_torrent_id);
CREATE INDEX IF NOT EXISTS idx_subtitle_files_episode ON subtitle_files(season, episode);

CREATE INDEX IF NOT EXISTS idx_unmatched_added ON unmatched(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_state_key ON sync_state(key);

-- Watch history indexes
CREATE INDEX IF NOT EXISTS idx_watch_history_imdb ON watch_history(imdb_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_last_watched ON watch_history(last_watched_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_history_continue ON watch_history(is_completed, last_watched_at DESC);

-- Low bandwidth mode table: stores per-client preference for forcing 480p transcoding
CREATE TABLE IF NOT EXISTS low_bandwidth_mode (
    client_ip TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

-- User settings table: stores runtime-configurable user settings
CREATE TABLE IF NOT EXISTS user_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
`;

// Initialize schema
db.exec(SCHEMA_SQL);
log.info('Database schema initialized');

// Prepared statements for performance
const statements = {
  upsertTitle: db.prepare(`
    INSERT INTO titles (imdb_id, type, name, year, poster, background, description, genres, imdb_rating, added_at, updated_at)
    VALUES (@imdb_id, @type, @name, @year, @poster, @background, @description, @genres, @imdb_rating, @added_at, @updated_at)
    ON CONFLICT(imdb_id) DO UPDATE SET
      name = excluded.name,
      year = excluded.year,
      poster = excluded.poster,
      background = excluded.background,
      description = excluded.description,
      genres = excluded.genres,
      imdb_rating = excluded.imdb_rating,
      updated_at = excluded.updated_at
  `),

  upsertTorrent: db.prepare(`
    INSERT INTO torrents (rd_id, imdb_id, hash, filename, quality, source, codec, audio, hdr, season, episode, added_at)
    VALUES (@rd_id, @imdb_id, @hash, @filename, @quality, @source, @codec, @audio, @hdr, @season, @episode, @added_at)
    ON CONFLICT(rd_id) DO UPDATE SET
      imdb_id = excluded.imdb_id,
      hash = excluded.hash,
      filename = excluded.filename,
      quality = excluded.quality,
      source = excluded.source,
      codec = excluded.codec,
      audio = excluded.audio,
      hdr = excluded.hdr,
      season = excluded.season,
      episode = excluded.episode,
      added_at = excluded.added_at
  `),

  insertFile: db.prepare(`
    INSERT INTO torrent_files (rd_torrent_id, rd_file_id, filename, filesize, link, season, episode)
    VALUES (@rd_torrent_id, @rd_file_id, @filename, @filesize, @link, @season, @episode)
  `),

  deleteFilesByTorrent: db.prepare('DELETE FROM torrent_files WHERE rd_torrent_id = ?'),

  insertSubtitleFile: db.prepare(`
    INSERT INTO subtitle_files (rd_torrent_id, rd_file_id, filename, filesize, link, language, language_code, format, season, episode)
    VALUES (@rd_torrent_id, @rd_file_id, @filename, @filesize, @link, @language, @language_code, @format, @season, @episode)
  `),

  deleteSubtitleFilesByTorrent: db.prepare('DELETE FROM subtitle_files WHERE rd_torrent_id = ?'),

  getSubtitlesForTitle: db.prepare(`
    SELECT sf.*, t.imdb_id, t.filename as torrent_filename
    FROM subtitle_files sf
    JOIN torrents t ON t.rd_id = sf.rd_torrent_id
    WHERE t.imdb_id = @imdb_id
    AND (
      @season IS NULL
      OR sf.season = @season
      OR sf.season IS NULL
    )
    AND (
      @episode IS NULL
      OR sf.episode = @episode
      OR sf.episode IS NULL
    )
    ORDER BY sf.language ASC, sf.filename ASC
  `),

  getSubtitleById: db.prepare('SELECT * FROM subtitle_files WHERE id = ?'),

  removeTorrent: db.prepare('DELETE FROM torrents WHERE rd_id = ?'),

  removeTitle: db.prepare(`
    DELETE FROM titles WHERE imdb_id = ? AND NOT EXISTS (
      SELECT 1 FROM torrents WHERE imdb_id = titles.imdb_id
    )
  `),

  markUnmatched: db.prepare(`
    INSERT INTO unmatched (rd_id, filename, reason, added_at)
    VALUES (@rd_id, @filename, @reason, @added_at)
    ON CONFLICT(rd_id) DO UPDATE SET
      filename = excluded.filename,
      reason = excluded.reason
  `),

  removeUnmatched: db.prepare('DELETE FROM unmatched WHERE rd_id = ?'),

  // Consolidated query: check both tables in single query
  isIndexed: db.prepare(`
    SELECT 1 FROM (
      SELECT 1 FROM torrents WHERE rd_id = ?
      UNION ALL
      SELECT 1 FROM unmatched WHERE rd_id = ?
    ) LIMIT 1
  `),

  getCatalog: db.prepare(`
    SELECT t.*, COUNT(tr.rd_id) as torrent_count
    FROM titles t
    LEFT JOIN torrents tr ON tr.imdb_id = t.imdb_id
    WHERE t.type = @type
    AND (@search IS NULL OR t.name LIKE @search ESCAPE '$')
    AND (@genre IS NULL OR EXISTS (
      SELECT 1 FROM json_each(t.genres) WHERE value = @genre
    ))
    AND (@year_min IS NULL OR t.year >= @year_min)
    AND (@year_max IS NULL OR t.year <= @year_max)
    GROUP BY t.imdb_id
    ORDER BY
      CASE WHEN @search_exact IS NOT NULL THEN
        CASE WHEN LOWER(t.name) = LOWER(@search_exact) THEN 0 ELSE 1
      END END ASC,
      CASE @sort
        WHEN 'year_desc' THEN COALESCE(t.year, 0) * -1
        WHEN 'year_asc' THEN COALESCE(t.year, 9999)
        WHEN 'name_asc' THEN NULL
        WHEN 'rating_desc' THEN COALESCE(t.imdb_rating, 0) * -1
        ELSE t.added_at * -1
      END ASC,
      CASE WHEN @sort = 'name_asc' THEN t.name COLLATE NOCASE END ASC,
      t.added_at DESC
    LIMIT @limit OFFSET @skip
  `),

  getTitleByImdb: db.prepare('SELECT * FROM titles WHERE imdb_id = ?'),

  getStreamsForTitle: db.prepare(`
    SELECT t.*, tf.id as file_id, tf.rd_file_id, tf.filename as file_name, tf.filesize, tf.link,
           tf.season as file_season, tf.episode as file_episode
    FROM torrents t
    LEFT JOIN torrent_files tf ON tf.rd_torrent_id = t.rd_id
    WHERE t.imdb_id = @imdb_id
    AND (
      @season IS NULL 
      OR (tf.season IS NOT NULL AND tf.season = @season)
      OR (tf.season IS NULL AND t.season = @season)
    )
    AND (
      @episode IS NULL 
      OR (tf.episode IS NOT NULL AND tf.episode = @episode)
      OR (tf.episode IS NULL AND t.episode = @episode)
      OR (tf.episode IS NULL AND t.episode IS NULL AND t.season = @season)
    )
    ORDER BY t.quality DESC, tf.filesize DESC
  `),

  // Consolidated query: get all IDs from both tables in single query
  getAllTorrentIds: db.prepare(`
    SELECT rd_id FROM torrents
    UNION
    SELECT rd_id FROM unmatched
  `),

  getUnmatched: db.prepare(`
    SELECT * FROM unmatched ORDER BY added_at DESC LIMIT @limit OFFSET @skip
  `),

  getUnmatchedCount: db.prepare('SELECT COUNT(*) as count FROM unmatched'),

  getSyncState: db.prepare('SELECT value FROM sync_state WHERE key = ?'),
  setSyncState: db.prepare(`
    INSERT INTO sync_state (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
  deleteSyncState: db.prepare('DELETE FROM sync_state WHERE key = ?'),

  getStats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM titles WHERE type = 'movie') as movies,
      (SELECT COUNT(*) FROM titles WHERE type = 'series') as series,
      (SELECT COUNT(*) FROM torrents) as torrents,
      (SELECT COUNT(*) FROM torrent_files) as files,
      (SELECT COUNT(*) FROM subtitle_files) as subtitles,
      (SELECT COUNT(*) FROM unmatched) as unmatched,
      (SELECT COUNT(*) FROM watch_history) as watch_history
  `),

  cleanupOldUnmatched: db.prepare(`
    DELETE FROM unmatched WHERE added_at < ?
  `),

  getSeasonPacksWithoutFiles: db.prepare(`
    SELECT t.rd_id
    FROM torrents t
    JOIN titles ti ON ti.imdb_id = t.imdb_id
    WHERE ti.type = 'series'
    AND t.season IS NOT NULL
    AND t.episode IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM torrent_files tf WHERE tf.rd_torrent_id = t.rd_id
    )
  `),

  // Watch history statements
  upsertWatchProgress: db.prepare(`
    INSERT INTO watch_history (imdb_id, type, season, episode, progress_seconds, duration_seconds, percent_watched, is_completed, watch_count, last_watched_at, created_at)
    VALUES (@imdb_id, @type, @season, @episode, @progress_seconds, @duration_seconds, @percent_watched, @is_completed, @watch_count, @last_watched_at, @created_at)
    ON CONFLICT(imdb_id, season, episode) DO UPDATE SET
      progress_seconds = excluded.progress_seconds,
      duration_seconds = COALESCE(excluded.duration_seconds, duration_seconds),
      percent_watched = excluded.percent_watched,
      is_completed = excluded.is_completed,
      watch_count = CASE 
        WHEN excluded.percent_watched < 0.1 AND percent_watched > 0.5 THEN watch_count + 1
        ELSE watch_count
      END,
      last_watched_at = excluded.last_watched_at
  `),

  getWatchProgress: db.prepare('SELECT * FROM watch_history WHERE imdb_id = @imdb_id AND season IS @season AND episode IS @episode'),

  getContinueWatching: db.prepare(`
    SELECT wh.*, t.name, t.poster, t.year
    FROM watch_history wh
    JOIN titles t ON t.imdb_id = wh.imdb_id
    WHERE wh.is_completed = 0
    AND wh.percent_watched > 0.01
    AND wh.type = @type
    ORDER BY wh.last_watched_at DESC
    LIMIT @limit OFFSET @skip
  `),

  getWatchHistory: db.prepare(`
    SELECT wh.*, t.name, t.poster, t.year
    FROM watch_history wh
    JOIN titles t ON t.imdb_id = wh.imdb_id
    WHERE (@type IS NULL OR wh.type = @type)
    AND (@completed IS NULL OR wh.is_completed = @completed)
    ORDER BY wh.last_watched_at DESC
    LIMIT @limit OFFSET @skip
  `),

  getWatchHistoryCount: db.prepare(`
    SELECT COUNT(*) as count
    FROM watch_history wh
    WHERE (@type IS NULL OR wh.type = @type)
    AND (@completed IS NULL OR wh.is_completed = @completed)
  `),

  markWatchCompleted: db.prepare('UPDATE watch_history SET is_completed = 1 WHERE id = ?'),

  markCompletedByThreshold: db.prepare('UPDATE watch_history SET is_completed = 1 WHERE percent_watched >= @threshold AND is_completed = 0'),

  getWatchStats: db.prepare(`
    SELECT
      COUNT(*) as total_watched,
      SUM(CASE WHEN type = 'movie' THEN 1 ELSE 0 END) as total_movies,
      SUM(CASE WHEN type = 'series' THEN 1 ELSE 0 END) as total_series,
      SUM(COALESCE(duration_seconds * percent_watched, 0)) as total_time_seconds,
      AVG(percent_watched) as avg_completion
    FROM watch_history
  `),

  cleanupOldWatchHistory: db.prepare('DELETE FROM watch_history WHERE is_completed = 1 AND last_watched_at < ?'),

  deleteWatchProgress: db.prepare('DELETE FROM watch_history WHERE imdb_id = @imdb_id AND season IS @season AND episode IS @episode'),

  getImdbIdByRdId: db.prepare('SELECT imdb_id FROM torrents WHERE rd_id = ?'),

  // Low bandwidth mode statements
  getLowBandwidthMode: db.prepare('SELECT enabled FROM low_bandwidth_mode WHERE client_ip = ?'),
  setLowBandwidthMode: db.prepare(`
    INSERT INTO low_bandwidth_mode (client_ip, enabled, updated_at)
    VALUES (@client_ip, @enabled, @updated_at)
    ON CONFLICT(client_ip) DO UPDATE SET
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `),
  getAllLowBandwidthModes: db.prepare('SELECT * FROM low_bandwidth_mode WHERE enabled = 1'),

  // User settings statements
  getUserSetting: db.prepare('SELECT value FROM user_settings WHERE key = ?'),
  setUserSetting: db.prepare(`
    INSERT INTO user_settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `),
  getAllUserSettings: db.prepare('SELECT key, value FROM user_settings'),
};

/**
 * Upsert a title (movie/series metadata)
 * @param {Object} title - Title data
 */
export function upsertTitle(title) {
  const now = Date.now();
  statements.upsertTitle.run({
    imdb_id: title.imdb_id,
    type: title.type,
    name: title.name,
    year: title.year || null,
    poster: title.poster || null,
    background: title.background || null,
    description: title.description || null,
    genres: title.genres ? JSON.stringify(title.genres) : null,
    imdb_rating: title.imdb_rating || null,
    added_at: title.added_at || now,
    updated_at: now,
  });
  invalidateStatsCache();
}

/**
 * Upsert a torrent entry
 * @param {Object} torrent - Torrent data
 */
export function upsertTorrent(torrent) {
  statements.upsertTorrent.run({
    rd_id: torrent.rd_id,
    imdb_id: torrent.imdb_id,
    hash: torrent.hash || null,
    filename: torrent.filename,
    quality: torrent.quality || null,
    source: torrent.source || null,
    codec: torrent.codec || null,
    audio: torrent.audio || null,
    hdr: torrent.hdr || null,
    season: torrent.season || null,
    episode: torrent.episode || null,
    added_at: torrent.added_at || Date.now(),
  });
  invalidateStatsCache();
}

/**
 * Insert torrent files (for season packs)
 * @param {string} rdTorrentId - Parent torrent RD ID
 * @param {Array} files - Array of file objects
 */
export function insertFiles(rdTorrentId, files) {
  // Delete existing files first
  statements.deleteFilesByTorrent.run(rdTorrentId);

  const insertMany = db.transaction((files) => {
    for (const file of files) {
      statements.insertFile.run({
        rd_torrent_id: rdTorrentId,
        rd_file_id: file.rd_file_id || null,
        filename: file.filename,
        filesize: file.filesize || null,
        link: file.link || null,
        season: file.season || null,
        episode: file.episode || null,
      });
    }
  });

  insertMany(files);
}

/**
 * Insert subtitle files for a torrent
 * @param {string} rdTorrentId - Parent torrent RD ID
 * @param {Array} files - Array of subtitle file objects
 */
export function insertSubtitleFiles(rdTorrentId, files) {
  // Delete existing subtitle files first
  statements.deleteSubtitleFilesByTorrent.run(rdTorrentId);

  const insertMany = db.transaction((files) => {
    for (const file of files) {
      statements.insertSubtitleFile.run({
        rd_torrent_id: rdTorrentId,
        rd_file_id: file.rd_file_id || null,
        filename: file.filename,
        filesize: file.filesize || null,
        link: file.link || null,
        language: file.language || null,
        language_code: file.language_code || null,
        format: file.format,
        season: file.season || null,
        episode: file.episode || null,
      });
    }
  });

  insertMany(files);
}

/**
 * Get subtitles for a title
 * @param {string} imdbId - IMDB ID
 * @param {number|null} season - Season number (for series)
 * @param {number|null} episode - Episode number (for series)
 * @returns {Array} Array of subtitle objects
 */
export function getSubtitlesForTitle(imdbId, season = null, episode = null) {
  return statements.getSubtitlesForTitle.all({
    imdb_id: imdbId,
    season,
    episode,
  });
}

/**
 * Get a single subtitle by ID
 * @param {number} id - Subtitle file ID
 * @returns {Object|null} Subtitle object or null
 */
export function getSubtitleById(id) {
  return statements.getSubtitleById.get(id);
}

/**
 * Remove a torrent and clean up orphaned titles
 * @param {string} rdId - RD torrent ID
 * @param {string} imdbId - IMDB ID for orphan cleanup
 */
export function removeTorrent(rdId, imdbId) {
  statements.removeTorrent.run(rdId);
  if (imdbId) {
    statements.removeTitle.run(imdbId);
  }
  invalidateStatsCache();
}

/**
 * Sanitize search input for SQL LIKE queries
 * Escapes SQLite LIKE wildcards (% and _) to prevent wildcard injection
 * Uses $ as the escape character (specified in the SQL ESCAPE clause)
 * @param {string} search - Raw search input
 * @returns {string|null} Sanitized search pattern or null
 */
function sanitizeSearch(search) {
  if (!search || typeof search !== 'string') return null;
  // Trim whitespace first (Stremio may send queries with trailing spaces)
  const trimmed = search.trim();
  if (!trimmed) return null;
  // Escape SQLite LIKE wildcards: % → $%, _ → $_
  // Then wrap with % for substring matching
  const escaped = trimmed
    .replace(/%/g, '$%')
    .replace(/_/g, '$_');
  return `%${escaped}%`;
}

/**
 * Get catalog items (paginated with filtering and sorting)
 * @param {string} type - 'movie' or 'series'
 * @param {Object} options - Query options
 * @param {string|null} options.search - Search query
 * @param {string|null} options.genre - Genre filter
 * @param {number|null} options.yearMin - Minimum year
 * @param {number|null} options.yearMax - Maximum year
 * @param {string|null} options.sort - Sort option (added, year_desc, year_asc, name_asc, rating_desc)
 * @param {number} options.skip - Items to skip
 * @param {number} options.limit - Max items to return
 * @returns {Array} Array of title objects
 */
export function getCatalog(type, options = {}) {
  const {
    search = null,
    genre = null,
    yearMin = null,
    yearMax = null,
    sort = 'added',
    skip = 0,
    limit = 100,
  } = options;
  
  const searchPattern = sanitizeSearch(search);
  // For exact match prioritization, pass the original search term (trimmed)
  const searchExact = search ? search.trim() : null;
  
  return statements.getCatalog.all({
    type,
    search: searchPattern,
    search_exact: searchExact,
    genre,
    year_min: yearMin,
    year_max: yearMax,
    sort,
    skip,
    limit,
  });
}

/**
 * Get title by IMDB ID
 * @param {string} imdbId - IMDB ID
 * @returns {Object|null} Title object or null
 */
export function getTitleByImdb(imdbId) {
  return statements.getTitleByImdb.get(imdbId);
}

/**
 * Get streams for a title
 * @param {string} imdbId - IMDB ID
 * @param {number|null} season - Season number (for series)
 * @param {number|null} episode - Episode number (for series)
 * @returns {Array} Array of stream objects
 */
export function getStreamsForTitle(imdbId, season = null, episode = null) {
  return statements.getStreamsForTitle.all({
    imdb_id: imdbId,
    season,
    episode,
  });
}

/**
 * Check if a torrent is already indexed
 * @param {string} rdId - RD torrent ID
 * @returns {boolean} True if indexed
 */
export function isIndexed(rdId) {
  // Single consolidated query checks both torrents and unmatched tables
  return !!statements.isIndexed.get(rdId, rdId);
}

/**
 * Mark a torrent as unmatched
 * @param {Object} data - { rd_id, filename, reason }
 */
export function markUnmatched(data) {
  statements.markUnmatched.run({
    rd_id: data.rd_id,
    filename: data.filename,
    reason: data.reason || 'unknown',
    added_at: Date.now(),
  });
  invalidateStatsCache();
}

/**
 * Remove from unmatched table
 * @param {string} rdId - RD torrent ID
 */
export function removeUnmatched(rdId) {
  statements.removeUnmatched.run(rdId);
}

/**
 * Get all indexed torrent IDs
 * @returns {Set<string>} Set of RD IDs
 */
export function getAllTorrentIds() {
  // Single consolidated UNION query returns all IDs from both tables
  const rows = statements.getAllTorrentIds.all();
  return new Set(rows.map(r => r.rd_id));
}

/**
 * Get unmatched torrents (paginated)
 * @param {number} skip - Items to skip
 * @param {number} limit - Max items
 * @returns {Array} Array of unmatched torrents
 */
export function getUnmatched(skip = 0, limit = 100) {
  return statements.getUnmatched.all({ skip, limit });
}

/**
 * Get count of unmatched torrents
 * @returns {number} Count
 */
export function getUnmatchedCount() {
  return statements.getUnmatchedCount.get().count;
}

/**
 * Get sync state value
 * @param {string} key - State key
 * @returns {string|null} State value
 */
export function getSyncState(key) {
  const row = statements.getSyncState.get(key);
  return row ? row.value : null;
}

/**
 * Set sync state value
 * @param {string} key - State key
 * @param {string} value - State value
 */
export function setSyncState(key, value) {
  statements.setSyncState.run({ key, value: String(value) });
}

/**
 * Delete sync state value
 * @param {string} key - State key
 */
export function deleteSyncState(key) {
  statements.deleteSyncState.run(key);
}

/**
 * Get library statistics (cached for 30 seconds)
 * @returns {Object} Stats object
 */
export function getStats() {
  // Check cache first
  const cached = statsCache.get(STATS_CACHE_KEY);
  if (cached) {
    return cached;
  }
  
  // Query and cache the result
  const stats = statements.getStats.get();
  statsCache.set(STATS_CACHE_KEY, stats);
  return stats;
}

/**
 * Clean up old unmatched entries (older than specified days)
 * @param {number} daysOld - Delete entries older than this many days (default: 30)
 * @returns {number} Number of deleted entries
 */
export function cleanupOldUnmatched(daysOld = 30) {
  const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const result = statements.cleanupOldUnmatched.run(cutoff);
  if (result.changes > 0) {
    log.info({ deleted: result.changes, daysOld }, 'Cleaned up old unmatched entries');
  }
  return result.changes;
}

/**
 * Get all season packs that don't have files loaded yet
 * @returns {Array} Array of {rd_id} objects
 */
export function getSeasonPacksWithoutFiles() {
  return statements.getSeasonPacksWithoutFiles.all();
}

/**
 * Upsert watch progress for a title
 * @param {Object} progress - Progress data
 * @returns {Object} Result with id
 */
export function upsertWatchProgress(progress) {
  const now = Date.now();
  const result = statements.upsertWatchProgress.run({
    imdb_id: progress.imdb_id,
    type: progress.type,
    season: progress.season || null,
    episode: progress.episode || null,
    progress_seconds: progress.progress_seconds || 0,
    duration_seconds: progress.duration_seconds || null,
    percent_watched: progress.percent_watched || 0,
    is_completed: progress.is_completed ? 1 : 0,
    watch_count: progress.watch_count || 1,
    last_watched_at: now,
    created_at: progress.created_at || now,
  });
  return result;
}

/**
 * Get watch progress for a specific title
 * @param {string} imdbId - IMDB ID
 * @param {number|null} season - Season number (null for movies)
 * @param {number|null} episode - Episode number (null for movies)
 * @returns {Object|null} Watch progress or null
 */
export function getWatchProgress(imdbId, season = null, episode = null) {
  return statements.getWatchProgress.get({ imdb_id: imdbId, season, episode }) || null;
}

/**
 * Get Continue Watching catalog items
 * @param {string} type - 'movie' or 'series'
 * @param {number} skip - Items to skip
 * @param {number} limit - Max items
 * @returns {Array} Array of watch history items with title info
 */
export function getContinueWatching(type, skip = 0, limit = 50) {
  return statements.getContinueWatching.all({ type, skip, limit });
}

/**
 * Get watch history with filters
 * @param {Object} filters - Filter options
 * @param {string|null} filters.type - 'movie', 'series', or null for all
 * @param {boolean|null} filters.completed - true/false/null for all
 * @param {number} filters.skip - Items to skip
 * @param {number} filters.limit - Max items
 * @returns {Object} { items: Array, total: number }
 */
export function getWatchHistory(filters = {}) {
  const { type = null, completed = null, skip = 0, limit = 50 } = filters;
  const completedValue = completed === null ? null : (completed ? 1 : 0);

  const items = statements.getWatchHistory.all({ type, completed: completedValue, skip, limit });
  const { count: total } = statements.getWatchHistoryCount.get({ type, completed: completedValue });

  return { items, total };
}

/**
 * Mark a watch history item as completed
 * @param {number} id - Watch history ID
 * @returns {Object} Result
 */
export function markWatchCompleted(id) {
  return statements.markWatchCompleted.run(id);
}

/**
 * Mark all items above threshold as completed
 * @param {number} threshold - Percentage threshold (0.0 - 1.0)
 * @returns {number} Number of items marked completed
 */
export function markCompletedByThreshold(threshold) {
  const result = statements.markCompletedByThreshold.run({ threshold });
  return result.changes;
}

/**
 * Get watch statistics
 * @returns {Object} Stats object
 */
export function getWatchStats() {
  const stats = statements.getWatchStats.get();
  return {
    totalWatched: stats.total_watched || 0,
    totalMovies: stats.total_movies || 0,
    totalSeries: stats.total_series || 0,
    totalTimeSeconds: stats.total_time_seconds || 0,
    avgCompletion: stats.avg_completion || 0,
  };
}

/**
 * Clean up old completed watch history entries
 * @param {number} daysOld - Delete entries older than this many days
 * @returns {number} Number of deleted entries
 */
export function cleanupOldWatchHistory(daysOld = 90) {
  const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  const result = statements.cleanupOldWatchHistory.run(cutoff);
  if (result.changes > 0) {
    log.info({ deleted: result.changes, daysOld }, 'Cleaned up old watch history entries');
  }
  return result.changes;
}

/**
 * Get IMDB ID for a torrent by its RD ID
 * @param {string} rdId - RD torrent ID
 * @returns {string|null} IMDB ID or null
 */
export function getImdbIdByRdId(rdId) {
  const row = statements.getImdbIdByRdId.get(rdId);
  return row ? row.imdb_id : null;
}

/**
 * Delete watch progress for a specific title
 * @param {string} imdbId - IMDB ID
 * @param {number|null} season - Season number
 * @param {number|null} episode - Episode number
 * @returns {Object} Result
 */
export function deleteWatchProgress(imdbId, season = null, episode = null) {
  return statements.deleteWatchProgress.run({ imdb_id: imdbId, season, episode });
}

/**
 * Get low bandwidth mode for a client IP
 * @param {string} clientIp - Client IP address
 * @returns {boolean} True if low bandwidth mode is enabled
 */
export function getLowBandwidthMode(clientIp) {
  const row = statements.getLowBandwidthMode.get(clientIp);
  return row ? row.enabled === 1 : false;
}

/**
 * Set low bandwidth mode for a client IP
 * @param {string} clientIp - Client IP address
 * @param {boolean} enabled - Whether to enable low bandwidth mode
 */
export function setLowBandwidthMode(clientIp, enabled) {
  statements.setLowBandwidthMode.run({
    client_ip: clientIp,
    enabled: enabled ? 1 : 0,
    updated_at: Date.now(),
  });
  log.info({ clientIp, enabled }, 'Low bandwidth mode ' + (enabled ? 'enabled' : 'disabled'));
}

/**
 * Get a user setting value
 * @param {string} key - Setting key
 * @returns {string|null} Setting value or null if not set
 */
export function getUserSetting(key) {
  const row = statements.getUserSetting.get(key);
  return row ? row.value : null;
}

/**
 * Set a user setting value
 * @param {string} key - Setting key
 * @param {string} value - Setting value
 */
export function setUserSetting(key, value) {
  statements.setUserSetting.run({
    key,
    value: String(value),
    updated_at: Date.now(),
  });
  log.debug({ key }, 'User setting updated');
}

/**
 * Get all user settings as an object
 * @returns {Object} Object with key-value pairs
 */
export function getAllUserSettings() {
  const rows = statements.getAllUserSettings.all();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

/**
 * Close database connection
 */
export function close() {
  db.close();
  log.info('Database closed');
}

export default db;

