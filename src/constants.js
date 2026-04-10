/**
 * Centralized constants for timeouts and configuration
 * @module constants
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

/** Application version (sourced from package.json) */
export const VERSION = pkg.version;

/** API request timeout in milliseconds (30 seconds) */
export const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '30000', 10);

/** Stream proxy timeout in milliseconds (5 minutes) */
export const STREAM_TIMEOUT_MS = parseInt(process.env.STREAM_TIMEOUT_MS || '300000', 10);

/** Cinemeta API timeout in milliseconds (10 seconds) */
export const CINEMETA_TIMEOUT_MS = 10000;

/** Real-Debrid API timeout in milliseconds (30 seconds) */
export const RD_API_TIMEOUT_MS = 30000;

/** Proxy request timeout in milliseconds (30 seconds) */
export const PROXY_REQUEST_TIMEOUT_MS = 30000;

/** Maximum redirects to follow for proxy requests */
export const PROXY_MAX_REDIRECTS = 5;

/** Cinemeta API base URL */
export const CINEMETA_BASE_URL = 'https://v3-cinemeta.strem.io';

/** Real-Debrid API base URL */
export const RD_BASE_URL = 'https://api.real-debrid.com/rest/1.0';

/** Page size for RD API pagination (RD supports up to 5000) */
export const RD_PAGE_SIZE = 5000;

/** Initial offset for RD API (returns 0 results at offset 0) */
export const RD_INITIAL_OFFSET = 1;

/** Cinemeta request concurrency limit */
export const CINEMETA_CONCURRENCY = 5;

/** RD API request concurrency limit */
export const RD_CONCURRENCY = 2;

/** Processing batch size for initial sync (limits concurrent processTorrent calls) */
export const SYNC_BATCH_SIZE = 10;

/** Maximum retries for API requests */
export const MAX_RETRIES = 3;

/** Cinemeta API queue size (limits concurrent pending requests) */
export const CINEMETA_QUEUE_SIZE = parseInt(process.env.CINEMETA_QUEUE_SIZE || '1000', 10);

/** Maximum sync iterations to prevent infinite loops */
export const MAX_SYNC_ITERATIONS = parseInt(process.env.MAX_SYNC_ITERATIONS || '10000', 10);

/** Incremental sync batch size (torrents per batch) */
export const INCREMENTAL_BATCH_SIZE = parseInt(process.env.INCREMENTAL_BATCH_SIZE || '50', 10);

/** Maximum retries for Cinemeta API requests */
export const CINEMETA_MAX_RETRIES = parseInt(process.env.CINEMETA_MAX_RETRIES || '3', 10);

/** Minimum Cinemeta match score (0-1) */
export const MIN_CINEMETA_SCORE = 0.4;

/** Cinemeta cache maximum entries */
export const CINEMETA_CACHE_MAX = 1000;

/** Cinemeta cache TTL in milliseconds (24 hours) */
export const CINEMETA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Initial retry delay in milliseconds */
export const INITIAL_RETRY_DELAY_MS = 1000;

/** Maximum stream counter before reset */
export const MAX_STREAM_COUNTER = Number.MAX_SAFE_INTEGER - 1;

/** Subtitle file extension regex */
export const SUBTITLE_EXTENSIONS = /\.(srt|sub|ass|ssa|vtt)$/i;

/** MIME types for subtitle file extensions */
export const SUBTITLE_MIME_TYPES = {
  srt: 'application/x-subrip',
  sub: 'text/plain',
  ass: 'text/x-ssa',
  ssa: 'text/x-ssa',
  vtt: 'text/vtt',
};

/** ISO 639-1/2 language code to English name mapping */
export const LANGUAGE_CODES = {
  // ISO 639-1 (2-letter)
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  pl: 'Polish',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  tr: 'Turkish',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  // ISO 639-2 (3-letter)
  eng: 'English',
  spa: 'Spanish',
  fre: 'French',
  fra: 'French',
  ger: 'German',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  rus: 'Russian',
  jpn: 'Japanese',
  kor: 'Korean',
  chi: 'Chinese',
  zho: 'Chinese',
  ara: 'Arabic',
  hin: 'Hindi',
  dut: 'Dutch',
  nld: 'Dutch',
  swe: 'Swedish',
  nor: 'Norwegian',
  dan: 'Danish',
  fin: 'Finnish',
  pol: 'Polish',
  cze: 'Czech',
  ces: 'Czech',
  hun: 'Hungarian',
  rum: 'Romanian',
  ron: 'Romanian',
  tur: 'Turkish',
  gre: 'Greek',
  ell: 'Greek',
  heb: 'Hebrew',
  tha: 'Thai',
  vie: 'Vietnamese',
  ind: 'Indonesian',
  may: 'Malay',
  msa: 'Malay',
  ukr: 'Ukrainian',
  bul: 'Bulgarian',
  hrv: 'Croatian',
  srp: 'Serbian',
  slk: 'Slovak',
  slv: 'Slovenian',
  est: 'Estonian',
  lav: 'Latvian',
  lit: 'Lithuanian',
  // Common full-name variants (lowercase for matching)
  english: 'English',
  spanish: 'Spanish',
  french: 'French',
  german: 'German',
  italian: 'Italian',
  portuguese: 'Portuguese',
  russian: 'Russian',
  japanese: 'Japanese',
  korean: 'Korean',
  chinese: 'Chinese',
  arabic: 'Arabic',
  hindi: 'Hindi',
  dutch: 'Dutch',
  swedish: 'Swedish',
  norwegian: 'Norwegian',
  danish: 'Danish',
  finnish: 'Finnish',
  polish: 'Polish',
  czech: 'Czech',
  hungarian: 'Hungarian',
  romanian: 'Romanian',
  turkish: 'Turkish',
  greek: 'Greek',
  hebrew: 'Hebrew',
  thai: 'Thai',
  vietnamese: 'Vietnamese',
  indonesian: 'Indonesian',
  malay: 'Malay',
  ukrainian: 'Ukrainian',
  bulgarian: 'Bulgarian',
  croatian: 'Croatian',
  serbian: 'Serbian',
  slovak: 'Slovak',
  slovenian: 'Slovenian',
  estonian: 'Estonian',
  latvian: 'Latvian',
  lithuanian: 'Lithuanian',
};

