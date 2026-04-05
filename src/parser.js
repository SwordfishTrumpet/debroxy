/**
 * Torrent name parser
 * Extracts metadata from torrent filenames
 * @module parser
 */

import { LRUCache } from 'lru-cache';

// Parser result cache (max 5000 entries, TTL 1 hour)
const parseCache = new LRUCache({
  max: 5000,
  ttl: 60 * 60 * 1000, // 1 hour
});

// Normalization mappings for quality metadata
const NORMALIZE_MAPS = {
  source: {
    pattern: /[\s\-]/g,
    values: {
      bluray: 'BluRay', bdrip: 'BluRay', brrip: 'BluRay',
      webdl: 'WEB-DL', webrip: 'WEBRip', web: 'WEB',
      hdtv: 'HDTV', hdrip: 'HDRip', dvdrip: 'DVDRip', dvd: 'DVD',
      hdcam: 'HDCAM', cam: 'CAM', ts: 'TS', telesync: 'TS',
      screener: 'SCR', scr: 'SCR', r5: 'R5',
    },
  },
  codec: {
    pattern: /[\.\s]/g,
    values: {
      x264: 'x264', h264: 'x264', avc: 'x264',
      x265: 'x265', h265: 'x265', hevc: 'x265',
      xvid: 'XviD', divx: 'DivX', av1: 'AV1',
    },
  },
  audio: {
    pattern: /[\.\s\-]/g,
    values: {
      aac: 'AAC', ac3: 'AC3', dts: 'DTS',
      dtshd: 'DTS-HD', dtshdma: 'DTS-HD MA',
      truehd: 'TrueHD', atmos: 'Atmos', flac: 'FLAC', mp3: 'MP3',
      dd51: 'DD5.1', dd71: 'DD7.1', eac3: 'EAC3', opus: 'Opus', lpcm: 'LPCM',
    },
  },
  hdr: {
    pattern: /[\.\s\-]/g,
    values: {
      'hdr10+': 'HDR10+', hdr10: 'HDR10', hdr: 'HDR',
      dv: 'DV', dolbyvision: 'DV', hlg: 'HLG', sdr: 'SDR',
    },
  },
};

/**
 * Normalize a value using a mapping table
 * @param {string} value - Raw value to normalize
 * @param {string} type - Type of normalization (source, codec, audio, hdr)
 * @returns {string} Normalized value
 */
function normalize(value, type) {
  const config = NORMALIZE_MAPS[type];
  if (!config) return value;
  const key = value.toLowerCase().replace(config.pattern, '');
  return config.values[key] || value.toUpperCase();
}

// Quality patterns
const QUALITY_PATTERNS = {
  resolution: /\b(2160p|4k|uhd|1080p|720p|480p|360p)\b/i,
  source: /\b(blu-?ray|bdrip|brrip|web-?dl|webrip|web|hdtv|hdrip|dvdrip|dvd|hdcam|cam|ts|telesync|screener|scr|r5)\b/i,
  codec: /\b(x264|x265|h\.?264|h\.?265|hevc|avc|xvid|divx|av1|mpeg[24]?)\b/i,
  audio: /\b(aac|ac3|dts(?:-?hd)?(?:-?ma)?|truehd|atmos|flac|mp3|dd5\.?1|dd7\.?1|eac3|opus|lpcm)\b/i,
  hdr: /\b(hdr10\+?|hdr|dv|dolby[\s\.-]?vision|hlg|sdr)\b/i,
};

// Season/episode patterns
const EPISODE_PATTERNS = [
  // S01E01, S1E1, S01E01E02, S01E01-E03
  /[Ss](\d{1,2})[Ee](\d{1,3})(?:[Ee-](\d{1,3}))?/,
  // 1x01, 1x01-03
  /(\d{1,2})x(\d{1,3})(?:-(\d{1,3}))?/,
  // Season 1 Episode 1
  /Season\s*(\d{1,2}).*?Episode\s*(\d{1,3})/i,
  // Season X (season pack without episode) - must be followed by separator or end
  // Handles: Season 1, Season.05, Season_10
  /Season[\s\._-]*(\d{1,2})\b(?![Ee]\d)/i,
  // S01 (season pack, no episode) - must be followed by separator or end
  // Use word boundary to avoid matching S01E01, but allow S02.1080p
  /[Ss](\d{1,2})\b(?!\d|[Ee]\d)/,
];

// Anime episode pattern: [Group] Title - 01 [1080p]
const ANIME_PATTERN = /^\[([^\]]+)\]\s*(.+?)\s*-\s*(\d{1,4})\s*(?:\[|\(|$)/;

// Year patterns
const YEAR_PATTERNS = [
  /[\(\[](\d{4})[\)\]]/,           // (2023) or [2023]
  /[\.\_\-\s](\d{4})[\.\_\-\s]/,   // .2023. or _2023_ or -2023- or spaces
  /[\.\_\-\s](\d{4})$/,             // ends with .2023 or _2023
];

// File extensions to strip
const VIDEO_EXTENSIONS = /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|mpg|mpeg|ts|m2ts)$/i;

// Characters to normalize
const SEPARATORS = /[\.\_\-]/g;

// Common title prefixes to strip
const NOISE_PATTERNS = [
  /^\[([^\]]+)\]\s*/,              // [Group] prefix
  /\s*[\(\[]?(?:proper|repack|internal|limited|extended|unrated|directors\.?cut|theatrical|imax|3d)[\)\]]?\s*/gi,
  /\s*-\s*[a-zA-Z0-9]+$/,          // -GROUP suffix
  /\s+$/,                          // trailing spaces
];

/**
 * Parse a torrent filename into structured metadata (with caching)
 * @param {string} filename - Torrent filename
 * @returns {Object} Parsed metadata
 */
export function parse(filename) {
  if (!filename || typeof filename !== 'string') {
    return { title: '', type: 'movie' };
  }

  // ReDoS protection: limit filename length
  const MAX_FILENAME_LENGTH = 1000;
  let workingName = filename.trim();
  if (workingName.length > MAX_FILENAME_LENGTH) {
    workingName = workingName.substring(0, MAX_FILENAME_LENGTH);
  }
  
  // Normalize for cache key (lowercase, trimmed, truncated)
  const cacheKey = workingName.toLowerCase();
  
  // Check cache first
  const cached = parseCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  // Strip video extension
  workingName = workingName.replace(VIDEO_EXTENSIONS, '');

  const result = {
    title: '',
    year: null,
    season: null,
    episode: null,
    endEpisode: null,
    quality: null,
    source: null,
    codec: null,
    audio: null,
    hdr: null,
    type: 'movie',
    group: null,
  };

  // Check for anime pattern first
  const animeMatch = ANIME_PATTERN.exec(workingName);
  if (animeMatch) {
    result.group = animeMatch[1];
    result.title = cleanTitle(animeMatch[2]);
    result.episode = parseInt(animeMatch[3], 10);
    result.season = 1; // Anime typically uses absolute numbering
    result.type = 'series';
    
    // Extract quality from remainder
    extractQuality(filename, result);
    
    // Cache and return
    parseCache.set(cacheKey, result);
    return result;
  }

  // Extract year from original filename first (before truncation by season marker)
  // This handles cases like "Show.S01.2019.1080p" where year comes AFTER season
  const currentYear = new Date().getFullYear();
  const filenameWithoutExt = workingName; // Already has extension stripped
  for (const pattern of YEAR_PATTERNS) {
    const match = pattern.exec(filenameWithoutExt);
    if (match) {
      const yearNum = parseInt(match[1], 10);
      // Validate year is reasonable (1880 to current year + 1 for upcoming releases)
      if (yearNum >= 1880 && yearNum <= currentYear + 1) {
        result.year = yearNum;
        break;
      }
    }
  }

  // Handle (YEAR) at start of filename pattern: "(2000) Title Name"
  // Strip the year prefix from workingName so title extraction works
  const yearAtStartMatch = workingName.match(/^\((\d{4})\)\s*/);
  if (yearAtStartMatch) {
    const yearNum = parseInt(yearAtStartMatch[1], 10);
    if (yearNum >= 1880 && yearNum <= currentYear + 1) {
      result.year = yearNum;
      workingName = workingName.slice(yearAtStartMatch[0].length);
    }
  }

  // Extract season/episode info
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.exec(workingName);
    if (match) {
      result.season = parseInt(match[1], 10);
      if (match[2] && !/^[Ss]\d+$/.test(match[0])) {
        result.episode = parseInt(match[2], 10);
        if (match[3]) {
          result.endEpisode = parseInt(match[3], 10);
        }
      }
      result.type = 'series';
      
      // Title extraction: prefer content before marker, but handle episode-first patterns
      const titleBefore = workingName.slice(0, match.index).trim();
      
      // Check if "titleBefore" is just a group prefix like [Prof] or similar noise
      const strippedBefore = titleBefore
        .replace(/^\[([^\]]+)\]\s*/, '')  // [Group] prefix
        .replace(/^\(([^\)]+)\)\s*/, '')  // (Year) or (Info) prefix
        .trim();
      
      if (strippedBefore) {
        // Normal case: meaningful title content before the season/episode marker
        workingName = titleBefore;
      } else {
        // Episode-first pattern or only noise before marker
        // Extract title from AFTER the marker (e.g., "S01E11 - See-Saw" → "See-Saw")
        const afterMarker = workingName.slice(match.index + match[0].length);
        // Clean leading separators and extract until quality markers
        const cleanedAfter = afterMarker.replace(/^[\.\s\-_]+/, '');
        if (cleanedAfter) {
          workingName = cleanedAfter;
          // Preserve group if we found one in titleBefore
          const groupMatch = titleBefore.match(/^\[([^\]]+)\]/);
          if (groupMatch && !result.group) {
            result.group = groupMatch[1];
          }
        } else {
          workingName = titleBefore || '';
        }
      }
      break;
    }
  }

  // Remove year from workingName for title extraction (if found earlier)
  if (result.year) {
    for (const pattern of YEAR_PATTERNS) {
      const match = pattern.exec(workingName);
      if (match && parseInt(match[1], 10) === result.year) {
        workingName = workingName.slice(0, match.index);
        break;
      }
    }
  }

  // Extract quality info from original filename
  extractQuality(filename, result);

  // Clean up and extract title
  result.title = cleanTitle(workingName);

  // Cache the result
  parseCache.set(cacheKey, result);
  
  return result;
}

/**
 * Extract quality metadata from filename
 * @param {string} filename - Original filename
 * @param {Object} result - Result object to modify
 */
function extractQuality(filename, result) {
  const resMatch = QUALITY_PATTERNS.resolution.exec(filename);
  if (resMatch) {
    result.quality = resMatch[1].toUpperCase();
    if (result.quality === '4K' || result.quality === 'UHD') {
      result.quality = '2160p';
    }
  }

  const sourceMatch = QUALITY_PATTERNS.source.exec(filename);
  if (sourceMatch) {
    result.source = normalize(sourceMatch[1], 'source');
  }

  const codecMatch = QUALITY_PATTERNS.codec.exec(filename);
  if (codecMatch) {
    result.codec = normalize(codecMatch[1], 'codec');
  }

  const audioMatch = QUALITY_PATTERNS.audio.exec(filename);
  if (audioMatch) {
    result.audio = normalize(audioMatch[1], 'audio');
  }

  const hdrMatch = QUALITY_PATTERNS.hdr.exec(filename);
  if (hdrMatch) {
    result.hdr = normalize(hdrMatch[1], 'hdr');
  }
}

/**
 * Clean and normalize a title string
 * @param {string} title - Raw title string
 * @returns {string} Cleaned title
 */
function cleanTitle(title) {
  if (!title) return '';

  let cleaned = title;

  // Replace separators with spaces
  cleaned = cleaned.replace(SEPARATORS, ' ');

  // Remove noise patterns
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Remove quality indicators that might be in title area
  cleaned = cleaned.replace(QUALITY_PATTERNS.resolution, ' ');
  cleaned = cleaned.replace(QUALITY_PATTERNS.source, ' ');
  cleaned = cleaned.replace(QUALITY_PATTERNS.codec, ' ');

  // Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Capitalize first letter of each word for display
  cleaned = cleaned.replace(/\b\w/g, c => c.toUpperCase());

  return cleaned;
}

/**
 * Parse episode number from a filename within a season pack
 * @param {string} filename - Individual file name
 * @returns {Object|null} { season, episode } or null
 */
export function parseEpisodeFromFilename(filename) {
  if (!filename) return null;

  // Standard S01E01 patterns
  for (const pattern of EPISODE_PATTERNS.slice(0, 3)) {
    const match = pattern.exec(filename);
    if (match && match[2]) {
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10),
        endEpisode: match[3] ? parseInt(match[3], 10) : null,
      };
    }
  }

  // Anime pattern: - 01, - 001, E01
  const animeMatch = /[-Ee\s](\d{1,4})(?:\s|\[|\(|\.mkv|\.mp4|$)/.exec(filename);
  if (animeMatch) {
    return {
      season: 1,
      episode: parseInt(animeMatch[1], 10),
      endEpisode: null,
    };
  }

  return null;
}

/**
 * Format quality metadata as a human-readable string
 * @param {Object} parsed - Parsed metadata object
 * @returns {string} Formatted quality string
 */
export function formatQualityTag(parsed) {
  const parts = [];

  if (parsed.quality) parts.push(parsed.quality);
  if (parsed.hdr && parsed.hdr !== 'SDR') parts.push(parsed.hdr);
  if (parsed.source) parts.push(parsed.source);
  if (parsed.codec) parts.push(parsed.codec);
  if (parsed.audio) parts.push(parsed.audio);

  return parts.join(' · ') || 'Unknown';
}

/**
 * Build a search query from parsed metadata
 * @param {Object} parsed - Parsed metadata
 * @returns {string} Search query
 */
export function buildSearchQuery(parsed) {
  let query = parsed.title;
  if (parsed.year) {
    query += ` ${parsed.year}`;
  }
  return query;
}

export default {
  parse,
  parseEpisodeFromFilename,
  formatQualityTag,
  buildSearchQuery,
};
