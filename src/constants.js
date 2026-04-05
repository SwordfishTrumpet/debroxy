/**
 * Centralized constants for timeouts and configuration
 * @module constants
 */

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

/** Maximum proxy request size in bytes (default 10GB for streaming) */
export const MAX_PROXY_SIZE_BYTES = parseInt(process.env.MAX_PROXY_SIZE_MB || '10240', 10) * 1024 * 1024;

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

/** Initial retry delay in milliseconds */
export const INITIAL_RETRY_DELAY_MS = 1000;

/** Maximum stream counter before reset */
export const MAX_STREAM_COUNTER = Number.MAX_SAFE_INTEGER - 1;
