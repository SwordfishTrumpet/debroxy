/**
 * Centralized configuration with validation
 * @module config
 */

import 'dotenv/config';

/**
 * Validates required environment variables and returns frozen config object
 * @returns {Object} Frozen configuration object
 * @throws {Error} If required variables are missing
 */
function loadConfig() {
  const required = ['RD_API_KEY', 'EXTERNAL_URL'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please check your .env file or environment configuration.');
    process.exit(1);
  }

  const config = {
    // Required
    rdApiKey: process.env.RD_API_KEY,
    proxyToken: process.env.PROXY_TOKEN || null, // Optional - null means auth disabled
    authEnabled: !!process.env.PROXY_TOKEN, // Auth disabled by default
    externalUrl: process.env.EXTERNAL_URL.replace(/\/$/, ''), // Remove trailing slash

    // Optional with defaults
    port: parseInt(process.env.PORT, 10) || 8888,
    maxConcurrentStreams: parseInt(process.env.MAX_CONCURRENT_STREAMS, 10) || 3,
    dbPath: process.env.DB_PATH || './data/debroxy.db',
    syncIntervalMin: parseInt(process.env.SYNC_INTERVAL_MIN, 10) || 15,
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // Stream quality filter (optional): 2160p, 1440p, 1080p, 720p, 480p, 360p
    // Only streams at or above this quality will be shown
    minStreamQuality: process.env.MIN_STREAM_QUALITY || null,

    // Watch history settings
    watchCompletionThreshold: parseFloat(process.env.WATCH_COMPLETION_THRESHOLD || '0.90'),

    // Transcoding settings - use Real-Debrid HLS transcoding when available
    transcodingEnabled: process.env.TRANSCODING_ENABLED !== 'false', // Default true
    transcodingPreferHls: process.env.TRANSCODING_PREFER_HLS !== 'false', // Default true
    transcodingCacheTtl: parseInt(process.env.TRANSCODING_CACHE_TTL, 10) || 3600, // 1 hour

    // Derived
    isDev: process.env.NODE_ENV !== 'production',
  };

  // Validate numeric values
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    console.error('PORT must be a valid port number (1-65535)');
    process.exit(1);
  }

  if (isNaN(config.maxConcurrentStreams) || config.maxConcurrentStreams < 1) {
    console.error('MAX_CONCURRENT_STREAMS must be a positive integer');
    process.exit(1);
  }

  if (isNaN(config.syncIntervalMin) || config.syncIntervalMin < 1) {
    console.error('SYNC_INTERVAL_MIN must be a positive integer');
    process.exit(1);
  }

  // Validate watch completion threshold
  if (isNaN(config.watchCompletionThreshold) || config.watchCompletionThreshold < 0.5 || config.watchCompletionThreshold > 0.99) {
    console.error('WATCH_COMPLETION_THRESHOLD must be between 0.5 and 0.99');
    process.exit(1);
  }

  // Validate transcoding cache TTL
  if (isNaN(config.transcodingCacheTtl) || config.transcodingCacheTtl < 60 || config.transcodingCacheTtl > 86400) {
    console.error('TRANSCODING_CACHE_TTL must be between 60 and 86400 seconds');
    process.exit(1);
  }

  // Validate external URL format
  try {
    new URL(config.externalUrl);
  } catch {
    console.error('EXTERNAL_URL must be a valid URL');
    process.exit(1);
  }

  // Enforce HTTPS in production (case-insensitive check to prevent bypass)
  if (!config.isDev && !config.externalUrl.toLowerCase().startsWith('https://')) {
    console.error('EXTERNAL_URL must use HTTPS in production mode');
    console.error('Current URL:', config.externalUrl);
    console.error('Set EXTERNAL_URL to an HTTPS URL or use NODE_ENV=development for HTTP');
    process.exit(1);
  }

  // Validate token length for security (minimum 32 characters) if auth is enabled
  // Skip validation in test environment
  if (config.authEnabled && process.env.NODE_ENV !== 'test' && config.proxyToken.length < 32) {
    console.error('PROXY_TOKEN must be at least 32 characters for security.');
    console.error(`Current length: ${config.proxyToken.length} characters.`);
    console.error('Generate a secure token with: openssl rand -hex 32');
    process.exit(1);
  }

  // Warn if auth is disabled in production (logging done in server.js)
  if (!config.authEnabled && process.env.NODE_ENV === 'production') {
    config.authWarning = 'PROXY_TOKEN not set. Authentication is DISABLED.';
  }

  return Object.freeze(config);
}

export const config = loadConfig();
export default config;
