/**
 * Centralized validation functions
 * All input validation helpers in one place for consistency
 * @module validators
 */

/** Valid content types for Stremio */
export const VALID_TYPES = ['movie', 'series'];

/** Valid genres for catalog filtering (based on common Cinemeta genres) */
export const VALID_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western',
];

/** Valid sort options for catalog */
export const VALID_SORTS = ['added', 'year_desc', 'year_asc', 'name_asc', 'rating_desc'];

/**
 * Validate content type
 * @param {string} type - Type to validate
 * @returns {boolean} True if valid
 */
export function validateType(type) {
  return VALID_TYPES.includes(type);
}

/**
 * Validate genre for catalog filtering
 * @param {string} genre - Genre to validate
 * @returns {boolean} True if valid
 */
export function validateGenre(genre) {
  if (!genre || typeof genre !== 'string') return false;
  return VALID_GENRES.includes(genre);
}

/**
 * Validate and parse year filter
 * Supports single year (2023) or range (2020-2023)
 * @param {string} year - Year string to validate
 * @returns {{ valid: boolean, min?: number, max?: number }} Validation result with parsed values
 */
export function validateYear(year) {
  if (!year || typeof year !== 'string') return { valid: false };
  
  // Single year: 1900-2099
  const singleYearMatch = year.match(/^(\d{4})$/);
  if (singleYearMatch) {
    const y = parseInt(singleYearMatch[1], 10);
    if (y >= 1900 && y <= 2099) {
      return { valid: true, min: y, max: y };
    }
    return { valid: false };
  }
  
  // Year range: YYYY-YYYY
  const rangeMatch = year.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    if (min >= 1900 && max <= 2099 && min <= max) {
      return { valid: true, min, max };
    }
    return { valid: false };
  }
  
  return { valid: false };
}

/**
 * Validate sort option for catalog
 * @param {string} sort - Sort option to validate
 * @returns {boolean} True if valid
 */
export function validateSort(sort) {
  if (!sort || typeof sort !== 'string') return false;
  return VALID_SORTS.includes(sort);
}

/**
 * Validate IMDB ID format
 * @param {string} id - IMDB ID to validate
 * @returns {boolean} True if valid
 */
export function validateImdbId(id) {
  if (!id || typeof id !== 'string') return false;
  // IMDB IDs start with 'tt' followed by 7-10 digits
  return /^tt\d{7,10}$/.test(id);
}

/**
 * Validate Real-Debrid torrent ID format
 * @param {string} id - RD torrent ID to validate
 * @returns {boolean} True if valid
 */
export function validateRdId(id) {
  if (!id || typeof id !== 'string') return false;
  // RD IDs are alphanumeric, typically 5-50 characters
  // Also reject any with path traversal or special chars
  if (/[\/\\.]/.test(id)) return false;
  return /^[a-zA-Z0-9]{5,50}$/.test(id);
}

/**
 * Validate magnet URI format
 * @param {string} magnet - Magnet URI to validate
 * @returns {boolean} True if valid
 */
export function validateMagnet(magnet) {
  try {
    // Must start with magnet:?
    if (!magnet || typeof magnet !== 'string') return false;
    if (!magnet.startsWith('magnet:?')) return false;

    // Extract and validate info hash (40 hex chars or 32 base32 chars)
    // Hash must be followed by & (next parameter) or end of string
    const xtMatch = magnet.match(/xt=urn:btih:([a-f0-9]{40}|[a-z2-7]{32})(?=&|$)/i);
    if (!xtMatch) return false;

    // Validate info hash characters
    const hash = xtMatch[1].toLowerCase();
    if (hash.length === 40) {
      // Hex format
      return /^[a-f0-9]{40}$/.test(hash);
    } else if (hash.length === 32) {
      // Base32 format
      return /^[a-z2-7]{32}$/.test(hash);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Validate unrestricted link format
 * @param {string} link - Link to validate
 * @returns {boolean} True if valid
 */
export function validateLink(link) {
  try {
    if (!link || typeof link !== 'string') return false;

    const url = new URL(link);

    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) return false;

    // Block private IPs (basic check - full SSRF protection in proxy.js)
    const hostname = url.hostname.toLowerCase();
    const privateIpRegex = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|0\.0\.0\.0|localhost|\[::1\]|\[::ffff:)/i;
    if (privateIpRegex.test(hostname)) return false;

    // Block URLs with credentials
    if (url.username || url.password) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Validate stream info properties after decoding
 * @param {Object} streamInfo - Decoded stream info
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateStreamInfo(streamInfo) {
  if (!streamInfo || typeof streamInfo !== 'object') {
    return { valid: false, error: 'Invalid stream info' };
  }

  // rdId is required and must be a string
  if (!streamInfo.rdId || typeof streamInfo.rdId !== 'string') {
    return { valid: false, error: 'Invalid or missing rdId in stream info' };
  }

  // fileId is optional but if present must be a number
  if (streamInfo.fileId !== undefined && typeof streamInfo.fileId !== 'number') {
    return { valid: false, error: 'Invalid fileId in stream info' };
  }

  return { valid: true };
}

/**
 * Validate pagination parameters
 * @param {number} offset - Offset value
 * @param {number} limit - Limit value
 * @returns {{ offset: number, limit: number }} Normalized values
 */
export function validatePagination(offset, limit) {
  const parsedOffset = parseInt(offset);
  const parsedLimit = parseInt(limit);
  return {
    offset: Math.max(0, isNaN(parsedOffset) ? 0 : parsedOffset),
    limit: Math.min(Math.max(1, isNaN(parsedLimit) ? 100 : parsedLimit), 500),
  };
}

/**
 * Extract the base IMDB ID from a composite ID (e.g., "tt1234567:1:2" → "tt1234567")
 * @param {string} id - Composite ID
 * @returns {string} Base IMDB ID
 */
export function extractBaseId(id) {
  return id.split(':')[0];
}

/**
 * Parse extra params from Stremio catalog requests
 * @param {string} extra - Extra params string (e.g., "search=query&skip=20")
 * @returns {Object} Parsed params object
 */
export function parseExtraParams(extra) {
  const extraParams = {};
  const MAX_KEY_LENGTH = 50;
  const MAX_VALUE_LENGTH = 500;
  const MAX_EXTRA_LENGTH = 2000;
  const VALID_KEYS = ['search', 'skip', 'genre', 'sort', 'year'];

  if (!extra || typeof extra !== 'string') return extraParams;
  if (extra.length > MAX_EXTRA_LENGTH) return extraParams; // Reject overly long params

  for (const part of extra.split('&')) {
    const [key, value] = part.split('=');
    if (!key || !value) continue;
    if (key.length > MAX_KEY_LENGTH || value.length > MAX_VALUE_LENGTH) continue;

    // Only allow known keys
    if (!VALID_KEYS.includes(key)) continue;

    try {
      extraParams[key] = decodeURIComponent(value);
    } catch {
      // Invalid encoding, skip
    }
  }
  return extraParams;
}

/**
 * Validate progress report payload
 * @param {Object} body - Request body
 * @returns {{ valid: boolean, error?: string, data?: Object }} Validation result with normalized data
 */
export function validateProgressReport(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  // Validate IMDB ID
  if (!body.imdbId || typeof body.imdbId !== 'string') {
    return { valid: false, error: 'imdbId is required' };
  }
  if (!validateImdbId(body.imdbId)) {
    return { valid: false, error: 'Invalid IMDB ID format' };
  }

  // Validate type
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return { valid: false, error: 'type must be "movie" or "series"' };
  }

  // Validate season/episode for series
  let season = null;
  let episode = null;
  if (body.type === 'series') {
    if (body.season !== undefined && body.season !== null) {
      season = parseInt(body.season, 10);
      if (isNaN(season) || season < 1) {
        return { valid: false, error: 'season must be a positive integer' };
      }
    }
    if (body.episode !== undefined && body.episode !== null) {
      episode = parseInt(body.episode, 10);
      if (isNaN(episode) || episode < 1) {
        return { valid: false, error: 'episode must be a positive integer' };
      }
    }
  }

  // Validate progressSeconds
  if (body.progressSeconds === undefined || body.progressSeconds === null) {
    return { valid: false, error: 'progressSeconds is required' };
  }
  const progressSeconds = parseFloat(body.progressSeconds);
  if (isNaN(progressSeconds) || progressSeconds < 0) {
    return { valid: false, error: 'progressSeconds must be a non-negative number' };
  }

  // Validate durationSeconds (optional)
  let durationSeconds = null;
  if (body.durationSeconds !== undefined && body.durationSeconds !== null) {
    durationSeconds = parseFloat(body.durationSeconds);
    if (isNaN(durationSeconds) || durationSeconds <= 0) {
      return { valid: false, error: 'durationSeconds must be a positive number' };
    }
  }

  // Validate or calculate percentWatched
  let percentWatched = body.percentWatched;
  if (percentWatched !== undefined && percentWatched !== null) {
    percentWatched = parseFloat(percentWatched);
    if (isNaN(percentWatched) || percentWatched < 0 || percentWatched > 1) {
      return { valid: false, error: 'percentWatched must be between 0 and 1' };
    }
  } else if (durationSeconds && durationSeconds > 0) {
    // Calculate from progress and duration
    percentWatched = Math.min(progressSeconds / durationSeconds, 1);
  } else {
    percentWatched = 0;
  }

  return {
    valid: true,
    data: {
      imdb_id: body.imdbId,
      type: body.type,
      season,
      episode,
      progress_seconds: progressSeconds,
      duration_seconds: durationSeconds,
      percent_watched: percentWatched,
    },
  };
}

/**
 * Validate watch history query parameters
 * @param {Object} query - Query parameters
 * @returns {{ valid: boolean, error?: string, data?: Object }} Validation result with normalized data
 */
export function validateWatchHistoryQuery(query) {
  const data = {};

  // Validate type filter (optional)
  if (query.type !== undefined && query.type !== null) {
    if (!VALID_TYPES.includes(query.type)) {
      return { valid: false, error: 'type must be "movie" or "series"' };
    }
    data.type = query.type;
  } else {
    data.type = null;
  }

  // Validate completed filter (optional)
  if (query.completed !== undefined && query.completed !== null) {
    if (query.completed === 'true' || query.completed === true) {
      data.completed = true;
    } else if (query.completed === 'false' || query.completed === false) {
      data.completed = false;
    } else {
      return { valid: false, error: 'completed must be "true" or "false"' };
    }
  } else {
    data.completed = null;
  }

  // Validate pagination
  const { offset, limit } = validatePagination(query.skip, query.limit);
  data.skip = offset;
  data.limit = limit;

  return { valid: true, data };
}
