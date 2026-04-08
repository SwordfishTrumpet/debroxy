/**
 * Stremio addon handlers
 * Implements Stremio manifest, catalog, meta, and stream endpoints
 * @module stremio
 */

import { LRUCache } from 'lru-cache';
import * as db from './db.js';
import * as rd from './realdebrid.js';
import * as parser from './parser.js';
import { getCinemetaMeta, getStatus as getLibraryStatus } from './library.js';
import config from './config.js';
import { createLogger } from './logger.js';
import { validateRdId, validateGenre, validateYear, validateSort, VALID_GENRES, VALID_SORTS } from './validators.js';
import { VERSION } from './constants.js';

const log = createLogger('stremio');

/**
 * Pre-computed quality score Map for O(1) lookups
 * Maps normalized quality strings to scores
 */
const qualityScoreMap = new Map([
  // Resolution scores
  ['2160p', 100],
  ['4k', 100],
  ['uhd', 100],
  ['1440p', 90],
  ['1080p', 80],
  ['720p', 60],
  ['576p', 40],
  ['480p', 40],
  ['360p', 20],
  // Source quality bonuses
  ['bluray', 15],
  ['blu-ray', 15],
  ['web-dl', 12],
  ['webdl', 12],
  ['webrip', 10],
  ['hdtv', 8],
  ['dvd', 5],
]);

/**
 * Pre-computed codec score Map for O(1) lookups
 */
const codecScoreMap = new Map([
  ['av1', 12],
  ['x265', 10],
  ['hevc', 10],
  ['h.265', 10],
  ['x264', 8],
  ['avc', 8],
  ['h.264', 8],
  ['mpeg2', 2],
  ['mpeg-2', 2],
]);

/**
 * Pre-computed HDR score Map for O(1) lookups
 */
const hdrScoreMap = new Map([
  ['dv', 15],
  ['dolby vision', 15],
  ['hdr10+', 12],
  ['hdr10', 10],
  ['hdr', 8],
]);

/**
 * Quality hierarchy for minimum quality filtering
 */
const QUALITY_ORDER = ['360p', '480p', '576p', '720p', '1080p', '1440p', '2160p', '4k'];

/**
 * Quality tag mapping for Stremio's quality filter
 */
const QUALITY_TAGS = {
  '2160p': '4K',
  '4k': '4K',
  '1080p': '1080p',
  '720p': '720p',
};

/**
 * Pre-computed quality priorities for O(1)-style lookup
 * Ordered from highest to lowest score so we can return on first match
 */
const QUALITY_PRIORITY = [
  '2160p', '4k', 'uhd', '1440p', '1080p', '720p', '576p', '480p', '360p',
];

const SOURCE_PRIORITY = ['bluray', 'blu-ray', 'web-dl', 'webdl', 'webrip', 'hdtv', 'dvd'];

/**
 * Quality score for sorting (higher = better quality)
 * Uses priority array for early-exit on first match
 * @param {string} quality - Quality string (4K, 2160p, 1080p, etc.)
 * @returns {number} Quality score
 */
function getQualityScore(quality) {
  if (!quality) return 0;
  const q = quality.toLowerCase();
  
  let score = 0;
  
  // Resolution: return on first match (highest priority first)
  for (const key of QUALITY_PRIORITY) {
    if (q.includes(key)) {
      score = qualityScoreMap.get(key);
      break;
    }
  }
  
  // Source bonus: additive, return on first match
  for (const key of SOURCE_PRIORITY) {
    if (q.includes(key)) {
      score += qualityScoreMap.get(key);
      break;
    }
  }
  
  return score;
}

/**
 * Codec score for sorting within same quality
 * Uses pre-computed Map with early-exit on first match
 * @param {string} codec - Codec string (x264, x265, HEVC, etc.)
 * @returns {number} Codec preference score
 */
function getCodecScore(codec) {
  if (!codec) return 0;
  const c = codec.toLowerCase();
  return codecScoreMap.get(c) || 0;
}

/**
 * HDR score bonus
 * Uses pre-computed Map with early-exit on first match
 * @param {string} hdr - HDR string
 * @returns {number} HDR score bonus
 */
function getHdrScore(hdr) {
  if (!hdr) return 0;
  const h = hdr.toLowerCase();
  return hdrScoreMap.get(h) || 0;
}

/**
 * Format seconds as duration string (HH:MM:SS or MM:SS)
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate total stream score for sorting
 * Higher score = better quality, appears first
 * @param {Object} stream - Stream object with quality, codec, hdr
 * @returns {number} Total score
 */
function calculateStreamScore(stream) {
  let score = getQualityScore(stream.quality);
  score += getCodecScore(stream.codec);
  score += getHdrScore(stream.hdr);
  
  // Small bonus for size (larger = better quality, usually)
  if (stream.filesize && stream.filesize > 0) {
    // Normalize to GB and cap at 50GB to avoid overflow
    const sizeGB = Math.min(stream.filesize / (1024 * 1024 * 1024), 50);
    score += Math.min(sizeGB / 10, 5); // Max 5 point bonus for size
  }
  
  return score;
}

/**
 * Format file size for display
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${Math.round(mb)} MB`;
  }
  
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Format quality badge for stream display
 * @param {Object} qualityInfo - Quality info object
 * @returns {string} Formatted quality badge
 */
function formatQualityBadge(qualityInfo) {
  const parts = [];
  
  if (qualityInfo.quality) {
    parts.push(qualityInfo.quality.toUpperCase());
  }
  
  if (qualityInfo.hdr) {
    parts.push(qualityInfo.hdr.toUpperCase());
  }
  
  if (qualityInfo.codec) {
    parts.push(qualityInfo.codec.toUpperCase());
  }
  
  if (qualityInfo.source) {
    parts.push(qualityInfo.source.toUpperCase());
  }
  
  return parts.join(' · ');
}

/**
 * Get minimum quality threshold from config
 * @returns {string|null} Minimum quality or null if no filter
 */
function getMinQualityThreshold() {
  const minQuality = config.minStreamQuality;
  if (!minQuality) return null;
  return minQuality.toLowerCase();
}

/**
 * Check if quality meets minimum threshold
 * @param {string} quality - Quality string
 * @param {string} minQuality - Minimum quality required
 * @returns {boolean} True if quality meets threshold
 */
function meetsMinQuality(quality, minQuality) {
  if (!minQuality || !quality) return true;
  
  const q = quality.toLowerCase();
  const min = minQuality.toLowerCase();
  
  const qualityIndex = QUALITY_ORDER.findIndex(qs => q.includes(qs));
  const minIndex = QUALITY_ORDER.findIndex(qs => min.includes(qs));
  
  if (qualityIndex === -1 || minIndex === -1) return true; // Unknown quality, allow it
  
  return qualityIndex >= minIndex;
}

// LRU cache for unrestricted URLs (1 hour TTL, max 500 entries)
const urlCache = new LRUCache({
  max: 500,
  ttl: 60 * 60 * 1000, // 1 hour
});

// LRU cache for catalog queries (5 second TTL, max 100 entries)
const catalogCache = new LRUCache({
  max: 100,
  ttl: 5 * 1000, // 5 seconds
});

/**
 * Fetch and store files for a season pack (lazy loading)
 * @param {string} rdTorrentId - RD torrent ID
 * @returns {Promise<Array>} Array of file objects
 */
async function fetchAndStoreSeasonPackFiles(rdTorrentId) {
  try {
    const info = await rd.getTorrentInfo(rdTorrentId);
    if (!info.files || info.files.length === 0) return [];

    const videoFiles = info.files.filter(f => 
      /\.(mkv|mp4|avi|mov|wmv)$/i.test(f.path),
    );

    const files = videoFiles.map((file) => {
      const episodeInfo = parser.parseEpisodeFromFilename(file.path);
      return {
        rd_file_id: file.id,
        filename: file.path,
        filesize: file.bytes,
        link: null, // Links are resolved at play time
        season: episodeInfo?.season || null,
        episode: episodeInfo?.episode || null,
      };
    });

    if (files.length > 0) {
      db.insertFiles(rdTorrentId, files);
      log.debug({ rdTorrentId, fileCount: files.length }, 'Lazy-loaded season pack files');
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
      log.debug({ rdTorrentId, subtitleCount: subs.length }, 'Lazy-loaded subtitle files');
    }

    return files;
  } catch (error) {
    log.debug({ rdTorrentId, error: error.message }, 'Failed to fetch season pack files');
    return [];
  }
}

/**
 * Get addon manifest
 * @returns {Object} Stremio manifest
 */
export function getManifest() {
  // Check if sync is in progress and library has content
  const libraryStatus = getLibraryStatus();
  const hasContent = libraryStatus.stats && (libraryStatus.stats.movies > 0 || libraryStatus.stats.series > 0);
  
  // Only show sync indicator if syncing AND no content yet
  const syncSuffix = (libraryStatus.isSyncing && !hasContent) || !libraryStatus.isComplete 
    ? ' (Syncing...)' 
    : '';
  
  return {
    id: 'com.debroxy.stremio',
    version: VERSION,
    name: `Debroxy${syncSuffix}`,
    description: 'Browse and stream your Real-Debrid torrent library with quality filtering, smart sorting, and enhanced metadata. Streams are proxied through your server for privacy.',
    catalogs: [
      {
        type: 'movie',
        id: 'debroxy-movies',
        name: `Debroxy Movies${syncSuffix}`,
        extra: [
          { name: 'skip' },
          { name: 'search' },
          { name: 'genre', options: VALID_GENRES },
          { name: 'year' },
          { name: 'sort', options: VALID_SORTS },
        ],
        extraSupported: ['skip', 'search', 'genre', 'year', 'sort'],
      },
      {
        type: 'series',
        id: 'debroxy-series',
        name: `Debroxy Series${syncSuffix}`,
        extra: [
          { name: 'skip' },
          { name: 'search' },
          { name: 'genre', options: VALID_GENRES },
          { name: 'year' },
          { name: 'sort', options: VALID_SORTS },
        ],
        extraSupported: ['skip', 'search', 'genre', 'year', 'sort'],
      },
      {
        type: 'movie',
        id: 'debroxy-continue-movies',
        name: 'Continue Watching Movies',
        extra: [{ name: 'skip' }],
        extraSupported: ['skip'],
      },
      {
        type: 'series',
        id: 'debroxy-continue-series',
        name: 'Continue Watching Series',
        extra: [{ name: 'skip' }],
        extraSupported: ['skip'],
      },
    ],
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
  };
}

/**
 * Handle catalog request (with caching)
 * @param {string} type - 'movie' or 'series'
 * @param {string} id - Catalog ID
 * @param {Object} extra - Extra params (search, skip, genre, year, sort)
 * @returns {Object} Catalog response
 */
export function handleCatalog(type, id, extra = {}) {
  const skip = parseInt(extra.skip) || 0;
  const search = extra.search || null;
  const limit = 100;

  // Handle Continue Watching catalogs
  if (id === 'debroxy-continue-movies' || id === 'debroxy-continue-series') {
    const catalogType = id === 'debroxy-continue-movies' ? 'movie' : 'series';
    const items = db.getContinueWatching(catalogType, skip, limit);
    
    const metas = items.map(item => {
      const meta = {
        id: item.imdb_id,
        type: item.type,
        name: item.name,
      };
      
      if (item.poster) meta.poster = item.poster;
      if (item.year) meta.year = item.year;
      
      // Add progress info to description
      const progressPercent = Math.round(item.percent_watched * 100);
      const progressTime = formatDuration(item.progress_seconds);
      meta.description = `Continue watching: ${progressPercent}% complete (${progressTime})`;
      
      // For series episodes, include season/episode in name
      if (item.type === 'series' && item.season && item.episode) {
        meta.name = `${item.name} S${item.season}E${item.episode}`;
        meta.id = `${item.imdb_id}:${item.season}:${item.episode}`;
      }
      
      return meta;
    });
    
    return { metas };
  }

  // Validate and extract genre filter
  const genre = extra.genre && validateGenre(extra.genre) ? extra.genre : null;
  
  // Validate and parse year filter
  let yearMin = null;
  let yearMax = null;
  if (extra.year) {
    const yearResult = validateYear(extra.year);
    if (yearResult.valid) {
      yearMin = yearResult.min;
      yearMax = yearResult.max;
    }
  }
  
  // Validate sort option (default to 'added')
  const sort = extra.sort && validateSort(extra.sort) ? extra.sort : 'added';

  // Generate cache key including all filter params
  const cacheKey = `catalog:${type}:${id}:${skip}:${search || 'none'}:${genre || 'none'}:${yearMin || 'none'}-${yearMax || 'none'}:${sort}`;
  
  // Check cache first
  const cached = catalogCache.get(cacheKey);
  if (cached) {
    log.debug({ type, search, skip, genre, yearMin, yearMax, sort, cacheKey }, 'Catalog cache hit');
    return cached;
  }

  const titles = db.getCatalog(type, {
    search,
    genre,
    yearMin,
    yearMax,
    sort,
    skip,
    limit,
  });

  // Filter out orphaned titles (no linked torrents) and map to meta objects
  const metas = titles
    .filter(title => title.torrent_count > 0)
    .map(title => {
      // Build meta object excluding null/undefined values
      const meta = {
        id: title.imdb_id,
        type: title.type,
        name: title.name,
      };

      if (title.poster) meta.poster = title.poster;
      if (title.year) meta.year = title.year;
      if (title.description) meta.description = title.description;
      if (title.imdb_rating) meta.imdbRating = String(title.imdb_rating);
      if (title.genres) {
        try {
          meta.genres = JSON.parse(title.genres);
        } catch {
          // Ignore parse errors
        }
      }

      return meta;
    });

  const result = { metas };
  
  // Cache the result
  catalogCache.set(cacheKey, result);
  log.debug({ type, search, skip, genre, yearMin, yearMax, sort, count: metas.length, cacheKey }, 'Catalog request (cached)');

  return result;
}

/**
 * Handle meta request
 * @param {string} type - 'movie' or 'series'
 * @param {string} id - IMDB ID
 * @returns {Promise<Object>} Meta response
 */
export async function handleMeta(type, id) {
  // Try Cinemeta first for rich metadata
  const cinemeta = await getCinemetaMeta(id, type);
  
  if (cinemeta) {
    return {
      meta: {
        id: cinemeta.imdb_id || cinemeta.id,
        type: cinemeta.type,
        name: cinemeta.name,
        poster: cinemeta.poster,
        background: cinemeta.background,
        description: cinemeta.description,
        year: cinemeta.year,
        imdbRating: cinemeta.imdbRating,
        genres: cinemeta.genres,
        cast: cinemeta.cast,
        director: cinemeta.director,
        runtime: cinemeta.runtime,
        trailers: cinemeta.trailers,
        videos: cinemeta.videos,
      },
    };
  }

  // Fall back to local data
  const title = db.getTitleByImdb(id);
  
  if (!title) {
    return { meta: null };
  }

  return {
    meta: {
      id: title.imdb_id,
      type: title.type,
      name: title.name,
      poster: title.poster,
      background: title.background,
      description: title.description,
      year: title.year,
      imdbRating: title.imdb_rating ? String(title.imdb_rating) : undefined,
      genres: title.genres ? JSON.parse(title.genres) : undefined,
    },
  };
}

/**
 * Create a stream entry for Stremio response
 * @param {Object} params - Stream entry parameters
 * @param {string} params.rdId - Real-Debrid torrent ID
 * @param {string} params.filename - File name
 * @param {number} params.filesize - File size in bytes
 * @param {string} params.urlPrefix - URL prefix for the stream
 * @param {Object} params.torrent - Torrent metadata (quality, codec, hdr, source, audio)
 * @param {number} params.score - Stream score for sorting
 * @param {number} [params.fileId] - Optional file ID for multi-file torrents
 * @returns {Object} Stream entry object
 */
function createStreamEntry({ rdId, filename, filesize, urlPrefix, torrent, score, fileId, subtitles }) {
  const streamInfo = encodeStreamInfo({
    rdId,
    fileId,
    filename,
  });

  const sizeStr = formatFileSize(filesize);
  const qualityBadge = formatQualityBadge({
    quality: torrent.quality,
    codec: torrent.codec,
    hdr: torrent.hdr,
    source: torrent.source,
  });
  
  // Build descriptive title with all available info
  let title = qualityBadge;
  if (title) title += '\n';
  title += filename;
  if (sizeStr) title += `\n📦 ${sizeStr}`;
  if (torrent.audio) title += `\n🔊 ${torrent.audio.toUpperCase()}`;

  const streamEntry = {
    name: 'Debroxy',
    title: title,
    url: `${urlPrefix}/stream/play/${streamInfo}`,
    behaviorHints: {
      bingeGroup: `debroxy-${rdId}`,
      notWebReady: false,
      filename: filename,
      videoSize: filesize || undefined,
    },
    subtitles: subtitles || [],
  };

  // Add quality tag for Stremio's quality filter
  if (torrent.quality) {
    const q = torrent.quality.toLowerCase();
    for (const [key, tag] of Object.entries(QUALITY_TAGS)) {
      if (q.includes(key)) {
        streamEntry.quality = tag;
        break;
      }
    }
  }

  // Store score for sorting
  streamEntry._score = score;
  
  return streamEntry;
}

/**
 * Handle stream request
 * @param {string} type - 'movie' or 'series'
 * @param {string} id - IMDB ID (format: tt1234567 or tt1234567:1:2 for series)
 * @param {string} token - Auth token for URL generation (use '_' when auth disabled)
 * @returns {Promise<Object>} Stream response
 */
export async function handleStream(type, id, token) {
  // Generate URL path: with token prefix when auth enabled, without when disabled
  const urlPrefix = config.authEnabled ? `${config.externalUrl}/${token}` : config.externalUrl;
  // Parse ID for series (tt1234567:1:2 = season 1 episode 2)
  const [imdbId, seasonStr, episodeStr] = id.split(':');
  const season = seasonStr && /^\d+$/.test(seasonStr) ? parseInt(seasonStr, 10) : null;
  const episode = episodeStr && /^\d+$/.test(episodeStr) ? parseInt(episodeStr, 10) : null;

  // Validate season/episode ranges (return empty for invalid, Stremio compatibility)
  if (season !== null && (isNaN(season) || season < 1 || season > 100)) {
    log.warn({ season, imdbId }, 'Invalid season number');
    return { streams: [] };
  }

  if (episode !== null && (isNaN(episode) || episode < 1 || episode > 1000)) {
    log.warn({ episode, imdbId }, 'Invalid episode number');
    return { streams: [] };
  }

  const streams = db.getStreamsForTitle(imdbId, season, episode);

  if (streams.length === 0) {
    log.debug({ imdbId, season, episode }, 'No streams found');
    return { streams: [] };
  }

  // Group by torrent and deduplicate
  const torrentMap = new Map();
  
  for (const stream of streams) {
    if (!torrentMap.has(stream.rd_id)) {
      torrentMap.set(stream.rd_id, {
        torrent: stream,
        files: [],
        score: calculateStreamScore(stream),
        isSeasonPack: stream.season !== null && stream.episode === null,
      });
    }
    
    if (stream.file_id) {
      torrentMap.get(stream.rd_id).files.push({
        id: stream.file_id,
        rd_file_id: stream.rd_file_id,
        filename: stream.file_name,
        filesize: stream.filesize,
        link: stream.link,
        season: stream.file_season,
        episode: stream.file_episode,
        score: calculateStreamScore(stream),
      });
    }
  }

  // Lazy-load files for season packs that don't have files yet
  if (type === 'series' && season !== null) {
    for (const [rdId, data] of torrentMap) {
      if (data.isSeasonPack && data.files.length === 0) {
        try {
          const files = await fetchAndStoreSeasonPackFiles(rdId);
          if (files && files.length > 0) {
            data.files = files.map(f => ({
              id: f.id,
              rd_file_id: f.rd_file_id,
              filename: f.filename,
              filesize: f.filesize,
              link: f.link,
              season: f.season,
              episode: f.episode,
              score: calculateStreamScore(data.torrent),
            }));
          }
        } catch (error) {
          log.debug({ rdId, error: error.message }, 'Failed to lazy-load season pack files');
        }
      }
    }
  }

  const result = [];
  const minQuality = getMinQualityThreshold();

  // Query subtitles for this title/episode and group by torrent
  const allSubtitles = db.getSubtitlesForTitle(imdbId, season, episode);
  const subtitlesByTorrent = new Map();
  for (const sub of allSubtitles) {
    if (!subtitlesByTorrent.has(sub.rd_torrent_id)) {
      subtitlesByTorrent.set(sub.rd_torrent_id, []);
    }
    subtitlesByTorrent.get(sub.rd_torrent_id).push(sub);
  }

  for (const [rdId, data] of torrentMap) {
    const { torrent, files } = data;
    
    // Check if torrent meets minimum quality threshold
    if (!meetsMinQuality(torrent.quality, minQuality)) {
      log.debug({ rdId, quality: torrent.quality, minQuality }, 'Stream filtered by minimum quality');
      continue;
    }

    // Build subtitle entries for this torrent
    const torrentSubs = subtitlesByTorrent.get(rdId) || [];
    const subtitles = torrentSubs.map(sub => ({
      id: `debroxy-sub-${sub.id}`,
      url: `${urlPrefix}/subtitle/serve/${encodeStreamInfo({ rdId, subtitleFileId: sub.rd_file_id, filename: sub.filename })}`,
      lang: sub.language || sub.language_code || 'Unknown',
    }));

    // For season packs, create stream for each matching episode file
    if (files.length > 0 && type === 'series') {
      const matchingFiles = files.filter(f => 
        (season === null || f.season === season) &&
        (episode === null || f.episode === episode),
      );

      for (const file of matchingFiles) {
        const streamEntry = createStreamEntry({
          rdId,
          filename: file.filename,
          filesize: file.filesize,
          urlPrefix,
          torrent,
          score: file.score,
          fileId: file.rd_file_id,
          subtitles,
        });
        result.push(streamEntry);
      }
    } else {
      // Single file or movie
      const streamEntry = createStreamEntry({
        rdId,
        filename: torrent.filename,
        filesize: torrent.filesize,
        urlPrefix,
        torrent,
        score: data.score,
        subtitles,
      });
      result.push(streamEntry);
    }
  }

  // Sort by score (highest first) and remove score property
  result.sort((a, b) => b._score - a._score);
  result.forEach(s => delete s._score);

  // Add resume hints to stream titles if watch progress exists
  const watchProgress = db.getWatchProgress(imdbId, season, episode);
  if (watchProgress && !watchProgress.is_completed && watchProgress.percent_watched > 0.01) {
    const resumeTime = formatDuration(watchProgress.progress_seconds);
    const progressPercent = Math.round(watchProgress.percent_watched * 100);
    
    for (const stream of result) {
      stream.title = `▶ Resume from ${resumeTime} (${progressPercent}%)\n${stream.title}`;
    }
  }

  log.debug({ imdbId, season, episode, count: result.length, filtered: streams.length - result.length }, 'Streams found');

  return { streams: result };
}

/**
 * Encode stream info to base64url
 * @param {Object} info - Stream info
 * @returns {string} Encoded string
 */
function encodeStreamInfo(info) {
  const json = JSON.stringify(info);
  return Buffer.from(json).toString('base64url');
}

/**
 * Decode stream info from base64url
 * @param {string} encoded - Encoded string
 * @returns {Object|null} Stream info or null
 */
export function decodeStreamInfo(encoded) {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Get unrestricted download URL for a stream
 * @param {Object} streamInfo - Decoded stream info
 * @returns {Promise<Object>} { url, filename, size }
 */
export async function getStreamUrl(streamInfo) {
  // Validate RD ID format
  if (!streamInfo?.rdId || !validateRdId(streamInfo.rdId)) {
    throw Object.assign(new Error('Invalid RD torrent ID'), { 
      status: 400, 
      errorCode: 'VALIDATION_ERROR',
    });
  }

  const cacheKey = `${streamInfo.rdId}:${streamInfo.fileId || 'main'}`;
  
  // Check cache first
  const cached = urlCache.get(cacheKey);
  if (cached) {
    log.debug({ cacheKey }, 'Using cached unrestricted URL');
    return cached;
  }

  // Get torrent info to find the link
  const torrent = await rd.getTorrentInfo(streamInfo.rdId);
  
  if (!torrent || !torrent.links || torrent.links.length === 0) {
    throw new Error('No links available for this torrent');
  }

  // Find the correct link
  let link;
  if (streamInfo.fileId && torrent.files) {
    // Find the requested file in the files array
    const file = torrent.files.find(f => f.id === streamInfo.fileId);
    if (!file) {
      throw new Error(`File ${streamInfo.fileId} not found in torrent`);
    }
    // Find index among SELECTED files only (links[] matches selected files, not all files)
    const selectedFiles = torrent.files.filter(f => f.selected === 1);
    const selectedIndex = selectedFiles.findIndex(f => f.id === streamInfo.fileId);
    if (selectedIndex === -1) {
      throw new Error(`File ${streamInfo.fileId} exists but was not selected for download`);
    }
    link = torrent.links[selectedIndex];
    if (!link) {
      throw new Error(`No link available for file at selected index ${selectedIndex}`);
    }
  } else {
    link = torrent.links[0];
  }

  // Unrestrict the link
  const unrestricted = await rd.unrestrict(link);

  const result = {
    url: unrestricted.download,
    filename: unrestricted.filename,
    size: unrestricted.filesize,
    mimeType: unrestricted.mimeType,
  };

  // Cache the result
  urlCache.set(cacheKey, result);
  log.debug({ cacheKey, filename: result.filename }, 'URL unrestricted and cached');

  return result;
}

/**
 * Handle subtitles resource request (Stremio subtitles protocol)
 * @param {string} type - 'movie' or 'series'
 * @param {string} id - IMDB ID (format: tt1234567 or tt1234567:1:2 for series)
 * @param {string} token - Auth token for URL generation (use '_' when auth disabled)
 * @returns {Object} Subtitles response { subtitles: [...] }
 */
export function handleSubtitles(type, id, token) {
  const urlPrefix = config.authEnabled ? `${config.externalUrl}/${token}` : config.externalUrl;
  const [imdbId, seasonStr, episodeStr] = id.split(':');
  const season = seasonStr && /^\d+$/.test(seasonStr) ? parseInt(seasonStr, 10) : null;
  const episode = episodeStr && /^\d+$/.test(episodeStr) ? parseInt(episodeStr, 10) : null;

  const allSubtitles = db.getSubtitlesForTitle(imdbId, season, episode);

  const subtitles = allSubtitles.map(sub => ({
    id: `debroxy-sub-${sub.id}`,
    url: `${urlPrefix}/subtitle/serve/${encodeStreamInfo({ rdId: sub.rd_torrent_id, subtitleFileId: sub.rd_file_id, filename: sub.filename })}`,
    lang: sub.language || sub.language_code || 'Unknown',
  }));

  log.debug({ imdbId, season, episode, count: subtitles.length }, 'Subtitles request');

  return { subtitles };
}

/**
 * Get unrestricted download URL for a subtitle file
 * Applies the same selected-file filtering as getStreamUrl.
 * Returns null gracefully if the subtitle file was not selected in RD.
 * @param {Object} subtitleInfo - Decoded subtitle info { rdId, subtitleFileId, filename }
 * @returns {Promise<Object|null>} { url, filename, mimeType } or null if not available
 */
export async function getSubtitleUrl(subtitleInfo) {
  if (!subtitleInfo?.rdId || !validateRdId(subtitleInfo.rdId)) {
    throw Object.assign(new Error('Invalid RD torrent ID'), {
      status: 400,
      errorCode: 'VALIDATION_ERROR',
    });
  }

  if (!subtitleInfo.subtitleFileId) {
    throw Object.assign(new Error('Missing subtitle file ID'), {
      status: 400,
      errorCode: 'VALIDATION_ERROR',
    });
  }

  const cacheKey = `sub:${subtitleInfo.rdId}:${subtitleInfo.subtitleFileId}`;

  // Check cache first
  const cached = urlCache.get(cacheKey);
  if (cached) {
    log.debug({ cacheKey }, 'Using cached subtitle URL');
    return cached;
  }

  // Get torrent info to find the link
  const torrent = await rd.getTorrentInfo(subtitleInfo.rdId);

  if (!torrent || !torrent.links || torrent.links.length === 0) {
    return null; // No links available, graceful return
  }

  if (!torrent.files) {
    return null;
  }

  // Find the subtitle file in the files array
  const file = torrent.files.find(f => f.id === subtitleInfo.subtitleFileId);
  if (!file) {
    log.debug({ rdId: subtitleInfo.rdId, fileId: subtitleInfo.subtitleFileId }, 'Subtitle file not found in torrent');
    return null;
  }

  // Find index among SELECTED files only (links[] matches selected files, not all files)
  const selectedFiles = torrent.files.filter(f => f.selected === 1);
  const selectedIndex = selectedFiles.findIndex(f => f.id === subtitleInfo.subtitleFileId);
  if (selectedIndex === -1) {
    // Subtitle file was not selected for download in RD — graceful null return
    log.debug({ rdId: subtitleInfo.rdId, fileId: subtitleInfo.subtitleFileId }, 'Subtitle file not selected in RD');
    return null;
  }

  const link = torrent.links[selectedIndex];
  if (!link) {
    log.debug({ rdId: subtitleInfo.rdId, selectedIndex }, 'No link for subtitle at selected index');
    return null;
  }

  // Unrestrict the link
  const unrestricted = await rd.unrestrict(link);

  const result = {
    url: unrestricted.download,
    filename: unrestricted.filename,
    mimeType: unrestricted.mimeType,
  };

  // Cache the result
  urlCache.set(cacheKey, result);
  log.debug({ cacheKey, filename: result.filename }, 'Subtitle URL unrestricted and cached');

  return result;
}

export default {
  getManifest,
  handleCatalog,
  handleMeta,
  handleStream,
  handleSubtitles,
  decodeStreamInfo,
  getStreamUrl,
  getSubtitleUrl,
};
