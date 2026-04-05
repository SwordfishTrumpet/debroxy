/**
 * Express server with routes and security middleware
 * @module server
 */

import { createServer } from 'http';
import net from 'net';
import { createHash, timingSafeEqual, randomUUID } from 'crypto';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import { createLogger, createRequestLogger } from './logger.js';
import * as db from './db.js';
import * as rd from './realdebrid.js';
import * as library from './library.js';
import * as stremio from './stremio.js';
import * as proxy from './proxy.js';
import * as metrics from './metrics.js';
import { ErrorCode, createErrorResponse, getSafeMessage } from './errors.js';
import { 
  validateImdbId, 
  validateRdId, 
  validateMagnet, 
  validateLink, 
  validateStreamInfo,
  validateType,
  parseExtraParams,
} from './validators.js';
import { noCache } from './middleware.js';
import { API_TIMEOUT_MS, STREAM_TIMEOUT_MS } from './constants.js';
import { generateConfigurePage } from './configure.js';

const log = createLogger('server');

/** Whether metrics are enabled */
const METRICS_ENABLED = process.env.ENABLE_METRICS !== 'false';

const app = express();

// Track failed authentication attempts per IP
const failedAuthAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour
const AUTH_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Periodically clean up expired lockout entries to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - LOCKOUT_DURATION_MS;
  for (const [ip, data] of failedAuthAttempts) {
    // Clean up both expired lockouts AND old successful auth records
    if (data.lockedUntil < cutoff || data.lastAttempt < cutoff) {
      failedAuthAttempts.delete(ip);
    }
  }
}, AUTH_CLEANUP_INTERVAL_MS).unref(); // .unref() prevents this from keeping the process alive

// Trust proxy for correct IP detection behind reverse proxies
// Parse TRUSTED_PROXIES env var and validate each IP address
const TRUSTED_PROXIES = process.env.TRUSTED_PROXIES 
  ? process.env.TRUSTED_PROXIES.split(',')
    .map(ip => ip.trim())
    .filter(ip => {
      const isValid = net.isIP(ip) !== 0;
      if (!isValid && ip) {
        log.warn({ ip }, 'Invalid IP in TRUSTED_PROXIES, skipping');
      }
      return isValid;
    })
  : ['127.0.0.1', '::1'];

// Ensure we have at least loopback if all provided IPs were invalid
const finalProxies = TRUSTED_PROXIES.length > 0 ? TRUSTED_PROXIES : ['127.0.0.1', '::1'];

app.set('trust proxy', finalProxies);

if (config.isDev) {
  log.debug({ trustedProxies: finalProxies }, 'Trust proxy configured');
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      mediaSrc: ["'self'", 'https:'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'no-referrer' },
}));

// Compression middleware for JSON responses > 1KB
app.use(compression({
  filter: (req, res) => {
    // Only compress JSON and text responses
    const contentType = res.getHeader('Content-Type');
    if (typeof contentType === 'string') {
      return /json|text/.test(contentType);
    }
    return compression.filter(req, res);
  },
  threshold: 1024, // Only compress responses > 1KB
}));

// CORS headers required for Stremio addon
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Handle OPTIONS preflight requests globally (required for Stremio CORS)
app.options('*', (req, res) => {
  res.status(200).end();
});

// JSON parsing with size limits to prevent DoS
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Request timeout middleware factory
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Function} Express middleware
 */
function createTimeoutMiddleware(timeoutMs) {
  return (req, res, next) => {
    req.setTimeout(timeoutMs);
    
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ 
          error: 'Request timeout',
          error_code: 'REQUEST_TIMEOUT',
        });
      }
    }, timeoutMs);

    // Clear timeout when response finishes
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    
    next();
  };
}

// Apply default API timeout (streaming routes override this)
app.use(createTimeoutMiddleware(API_TIMEOUT_MS));

// Request ID middleware - generates UUID for each request
app.use((req, res, next) => {
  // Use existing request ID from header (for distributed tracing) or generate new one
  req.id = req.headers['x-request-id'] || randomUUID();
  // Attach request logger with request ID context
  req.log = createRequestLogger('request', req.id);
  // Send request ID in response header for debugging
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Metrics middleware - records HTTP request metrics
if (METRICS_ENABLED) {
  app.use(metrics.metricsMiddleware);
}

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Separate rate limiter for health endpoint (more permissive, but not unlimited)
const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute for monitoring systems
  message: { error: 'Health check rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply health limiter specifically to health endpoint
app.use('/health', healthLimiter);

app.use(authLimiter);

// Request logging with request ID
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const reqLog = req.log || log;
    reqLog.debug({
      method: req.method,
      url: req.url.replace(/\/[a-f0-9]{32,}/gi, '/:token'), // Hide token in logs
      status: res.statusCode,
      duration,
      reqId: req.id,
    });
  });
  next();
});

/**
 * Hash a token for logging (don't log actual tokens)
 * @param {string} token - Token to hash
 * @returns {string} Hashed token prefix
 */
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex').substring(0, 8);
}

/**
 * Constant-time token comparison
 * @param {string} a - First token
 * @param {string} b - Second token
 * @returns {boolean} True if equal
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Token authentication middleware
 * Supports both URL path token and Authorization: Bearer header
 * Implements failed-auth lockout to prevent brute force attacks
 * If authEnabled is false, authentication is skipped entirely
 */
function tokenAuth(req, res, next) {
  // Skip auth if disabled
  if (!config.authEnabled) {
    return next();
  }

  const clientIp = req.ip;

  // Check if IP is locked out due to failed attempts
  const attempts = failedAuthAttempts.get(clientIp);
  if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS) {
    const remainingMs = attempts.lockedUntil - Date.now();
    if (remainingMs > 0) {
      log.warn({ clientIp, remainingMinutes: Math.ceil(remainingMs / 60000) }, 'Auth locked out due to failed attempts');
      return res.status(429).json(createErrorResponse(
        429,
        'Too many failed authentication attempts. Please try again later.',
        ErrorCode.RATE_LIMITED,
        { retryAfter: Math.ceil(remainingMs / 1000) },
      ));
    }
    // Lockout expired, clear the entry
    failedAuthAttempts.delete(clientIp);
  }

  // Try Authorization header first (preferred for API calls)
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    // Fall back to URL path token
    token = req.params.token;
  }

  if (!token || !safeCompare(token, config.proxyToken)) {
    // Record failed attempt
    const currentAttempts = failedAuthAttempts.get(clientIp);
    const now = Date.now();
    const newCount = currentAttempts ? currentAttempts.count + 1 : 1;
    failedAuthAttempts.set(clientIp, {
      count: newCount,
      lockedUntil: now + LOCKOUT_DURATION_MS,
      lastAttempt: now,
    });

    log.warn({
      hashedToken: token ? hashToken(token) : 'none',
      clientIp,
      attempt: newCount,
    }, 'Invalid token');

    return res.status(401).json(createErrorResponse(401, 'Unauthorized', ErrorCode.UNAUTHORIZED));
  }

  // Successful auth - clear any failed attempts for this IP
  if (failedAuthAttempts.has(clientIp)) {
    failedAuthAttempts.delete(clientIp);
  }

  next();
}

// ==================
// PUBLIC ROUTES
// ==================

// Health check (minimal public info, full stats with auth or when auth disabled)
app.get('/health', (req, res) => {
  // Check for Authorization header for full stats (or auth disabled = always full stats)
  const authHeader = req.headers.authorization;
  const hasAuth = !config.authEnabled || (authHeader && authHeader.startsWith('Bearer ') &&
    safeCompare(authHeader.substring(7), config.proxyToken));

  // Verify actual database connectivity
  let dbConnected = false;
  try {
    db.getStats(); // Attempt a real query
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  if (hasAuth) {
    // Return full stats for authenticated requests
    const stats = dbConnected ? db.getStats() : null;
    const streams = proxy.getActiveStreams();
    
    // Update metrics with current library stats
    if (METRICS_ENABLED && stats) {
      metrics.updateLibraryMetrics({
        ...stats,
        isComplete: library.getStatus().isComplete,
        lastSync: library.getStatus().lastSync,
      });
      metrics.activeStreams.set(streams.length);
    }

    res.json({
      status: dbConnected ? 'ok' : 'degraded',
      version: '1.1.0',
      uptime: process.uptime(),
      database: dbConnected ? 'connected' : 'disconnected',
      library: stats,
      streams: {
        active: streams.length,
        max: config.maxConcurrentStreams,
      },
    });
  } else {
    // Minimal public health check
    res.json({ status: dbConnected ? 'ok' : 'degraded' });
  }
});

// Prometheus metrics endpoint (requires auth)
app.get('/:token/metrics', tokenAuth, async (req, res) => {
  if (!METRICS_ENABLED) {
    return res.status(404).json(createErrorResponse(404, 'Metrics disabled', ErrorCode.NOT_FOUND));
  }
  
  try {
    // Update library metrics before returning
    const stats = db.getStats();
    const streams = proxy.getActiveStreams();
    metrics.updateLibraryMetrics({
      ...stats,
      isComplete: library.getStatus().isComplete,
      lastSync: library.getStatus().lastSync,
    });
    metrics.activeStreams.set(streams.length);
    
    res.set('Content-Type', metrics.getContentType());
    res.send(await metrics.getMetrics());
  } catch (error) {
    log.error({ error: error.message }, 'Failed to get metrics');
    res.status(500).json(createErrorResponse(500, 'Failed to get metrics', ErrorCode.INTERNAL_ERROR));
  }
});

// ==================
// STREMIO ADDON ROUTE HANDLERS
// ==================

/**
 * Manifest handler - returns addon manifest
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function manifestHandler(req, res) {
  res.json(stremio.getManifest());
}

/**
 * Catalog handler - returns catalog items
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function catalogHandler(req, res) {
  const { type, id } = req.params;
  
  if (!validateType(type)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid type. Must be "movie" or "series"', ErrorCode.VALIDATION_ERROR));
  }
  
  const extraParams = req.params.extra ? parseExtraParams(req.params.extra) : {};
  const result = stremio.handleCatalog(type, id, extraParams);
  
  // Prevent caching so new content appears immediately during sync
  noCache(req, res, () => res.json(result));
}

/**
 * Meta handler - returns metadata for a title
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
async function metaHandler(req, res, next) {
  try {
    const { type, id } = req.params;
    
    if (!validateType(type)) {
      return res.status(400).json(createErrorResponse(400, 'Invalid type. Must be "movie" or "series"', ErrorCode.VALIDATION_ERROR));
    }
    
    if (!validateImdbId(id)) {
      return res.status(400).json(createErrorResponse(400, 'Invalid IMDB ID format', ErrorCode.VALIDATION_ERROR));
    }
    
    const result = await stremio.handleMeta(type, id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Stream handler - returns available streams for a title
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
async function streamHandler(req, res) {
  const { type, id } = req.params;
  
  if (!validateType(type)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid type. Must be "movie" or "series"', ErrorCode.VALIDATION_ERROR));
  }
  
  const baseId = id.split(':')[0];
  if (!validateImdbId(baseId)) {
    return res.status(400).json(createErrorResponse(400, 'Invalid IMDB ID format', ErrorCode.VALIDATION_ERROR));
  }
  
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
async function streamPlayHandler(req, res) {
  try {
    const streamInfo = stremio.decodeStreamInfo(req.params.encoded);
    
    if (!streamInfo) {
      return res.status(400).json(createErrorResponse(400, 'Invalid stream info', ErrorCode.BAD_REQUEST));
    }

    const validation = validateStreamInfo(streamInfo);
    if (!validation.valid) {
      return res.status(400).json(createErrorResponse(400, validation.error, ErrorCode.VALIDATION_ERROR));
    }

    const urlInfo = await stremio.getStreamUrl(streamInfo);
    const handler = proxy.createProxyHandler(urlInfo);
    await handler(req, res);
  } catch (error) {
    log.error({ error: error.message }, 'Play error');
    if (!res.headersSent) {
      res.status(500).json(createErrorResponse(500, 'Stream error', ErrorCode.STREAM_ERROR));
    }
  }
}

// ==================
// STREMIO ADDON ROUTES
// ==================

/**
 * Configure page handler - returns HTML configuration page
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
function configureHandler(req, res) {
  const token = config.authEnabled ? req.params.token : null;
  const apiBase = config.authEnabled 
    ? `${config.externalUrl}/${token}` 
    : config.externalUrl;
  
  const html = generateConfigurePage({
    library: library.getStatus(),
    streams: {
      active: proxy.getActiveStreams().length,
      max: config.maxConcurrentStreams,
    },
    token: token,
    apiBase: apiBase,
  });
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// Route registration helper - applies auth middleware when enabled
const prefix = config.authEnabled ? '/:token' : '';
const authMiddleware = config.authEnabled ? [tokenAuth] : [];

// Stremio addon routes
app.get(`${prefix}/configure`, ...authMiddleware, configureHandler);
app.get(`${prefix}/manifest.json`, ...authMiddleware, manifestHandler);
app.get(`${prefix}/catalog/:type/:id.json`, ...authMiddleware, catalogHandler);
app.get(`${prefix}/catalog/:type/:id/:extra.json`, ...authMiddleware, catalogHandler);
app.get(`${prefix}/meta/:type/:id.json`, ...authMiddleware, metaHandler);
app.get(`${prefix}/stream/:type/:id.json`, ...authMiddleware, streamHandler);

// Stream play (proxy)
app.options(`${prefix}/stream/play/:encoded`, ...authMiddleware, proxy.handlePreflight);
app.get(`${prefix}/stream/play/:encoded`, ...authMiddleware, createTimeoutMiddleware(STREAM_TIMEOUT_MS), streamPlayHandler);

// ==================
// MANAGEMENT API ROUTES
// ==================

// RD user info
app.get('/:token/api/user', tokenAuth, async (req, res, next) => {
  try {
    const user = await rd.getUser();
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// List RD torrents
app.get('/:token/api/torrents', tokenAuth, async (req, res, next) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 100), 500);
    const torrents = await rd.listTorrents(offset, limit);
    res.json(torrents);
  } catch (error) {
    next(error);
  }
});

// Get torrent details
app.get('/:token/api/torrents/:id', tokenAuth, async (req, res, next) => {
  try {
    if (!validateRdId(req.params.id)) {
      return res.status(400).json(createErrorResponse(400, 'Invalid torrent ID format', ErrorCode.VALIDATION_ERROR));
    }
    const torrent = await rd.getTorrentInfo(req.params.id);
    res.json(torrent);
  } catch (error) {
    next(error);
  }
});

// Add magnet
app.post('/:token/api/magnet', tokenAuth, async (req, res, next) => {
  try {
    const { magnet } = req.body;
    if (!magnet) {
      return res.status(400).json(createErrorResponse(400, 'magnet is required', ErrorCode.VALIDATION_ERROR));
    }
    if (!validateMagnet(magnet)) {
      return res.status(400).json(createErrorResponse(400, 'Invalid magnet URI format', ErrorCode.VALIDATION_ERROR));
    }
    const result = await rd.addMagnet(magnet);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Unrestrict link
app.post('/:token/api/unrestrict', tokenAuth, async (req, res, next) => {
  try {
    const { link } = req.body;
    if (!link) {
      return res.status(400).json(createErrorResponse(400, 'link is required', ErrorCode.VALIDATION_ERROR));
    }
    if (!validateLink(link)) {
      return res.status(400).json(createErrorResponse(400, 'Invalid or unsafe link URL', ErrorCode.VALIDATION_ERROR));
    }
    const result = await rd.unrestrict(link);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// List downloads
app.get('/:token/api/downloads', tokenAuth, async (req, res, next) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 100), 500);
    const downloads = await rd.listDownloads(offset, limit);
    res.json(downloads);
  } catch (error) {
    next(error);
  }
});

// Proxy stream status
app.get('/:token/api/streams', tokenAuth, (req, res) => {
  res.json({
    active: proxy.getActiveStreams(),
    max: config.maxConcurrentStreams,
  });
});

// Generic URL proxy (for direct RD URLs) - with extended timeout for streaming
app.options('/:token/proxy/stream', tokenAuth, proxy.handlePreflight);

app.get('/:token/proxy/stream', tokenAuth, createTimeoutMiddleware(STREAM_TIMEOUT_MS), async (req, res, next) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json(createErrorResponse(400, 'url is required', ErrorCode.VALIDATION_ERROR));
    }

    const validation = await proxy.validateUrl(url);
    if (!validation.valid) {
      return res.status(403).json(createErrorResponse(403, validation.error, ErrorCode.FORBIDDEN));
    }

    const handler = proxy.createProxyHandler({ url, filename: 'stream' });
    await handler(req, res);
  } catch (error) {
    next(error);
  }
});

// Library stats
app.get('/:token/api/library', tokenAuth, (req, res) => {
  res.json(library.getStatus());
});

// Force resync
app.post('/:token/api/library/resync', tokenAuth, async (req, res, next) => {
  try {
    // Await resync completion and return status
    await library.resync();
    res.json({ status: 'resync_complete', ...library.getStatus() });
  } catch (error) {
    next(error);
  }
});

// Force immediate sync
app.post('/:token/api/library/sync', tokenAuth, async (req, res, next) => {
  try {
    await library.forceSync();
    res.json({ status: 'sync_complete', ...library.getStatus() });
  } catch (error) {
    next(error);
  }
});

// Get unmatched torrents
app.get('/:token/api/library/unmatched', tokenAuth, (req, res) => {
  const skip = Math.max(0, parseInt(req.query.skip) || 0);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 100), 500);
  
  res.json({
    count: db.getUnmatchedCount(),
    items: db.getUnmatched(skip, limit),
  });
});

// ==================
// ERROR HANDLING
// ==================

// 404 handler
app.use((req, res) => {
  res.status(404).json(createErrorResponse(404, 'Not found', ErrorCode.NOT_FOUND));
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Log full error details internally
  log.error({
    error: err.message,
    code: err.code,
    status: err.status,
    stack: config.isDev ? err.stack : undefined,
    reqId: req.id,
  });

  // Determine error code
  let errorCode = err.errorCode || ErrorCode.INTERNAL_ERROR;
  if (err.code === 'CIRCUIT_OPEN') {
    errorCode = ErrorCode.CIRCUIT_OPEN;
  } else if (err.status === 429) {
    errorCode = ErrorCode.RATE_LIMITED;
  } else if (err.status && err.status < 500) {
    errorCode = ErrorCode.BAD_REQUEST;
  }

  // Determine safe message for client
  const safeMessage = getSafeMessage(err, config.isDev);
  const status = err.status || 500;

  res.status(status).json(createErrorResponse(status, safeMessage, errorCode));
});

// ==================
// SERVER STARTUP
// ==================

const server = createServer(app);

/**
 * Start the server
 */
async function start() {
  try {
    // Verify RD API key
    log.info('Verifying Real-Debrid API key...');
    const user = await rd.getUser();
    log.info({ username: user.username, premium: user.premium > 0 }, 'RD API key valid');

    // Log auth warning if disabled (structured logging)
    if (config.authWarning) {
      log.warn({
        warning: config.authWarning,
        impact: 'Anyone with access can stream from your Real-Debrid library',
        solution: 'Set PROXY_TOKEN to enable authentication',
      }, 'Authentication disabled');
    }

    // Start HTTP server first (so manifest is available immediately)
    server.listen(config.port, () => {
      let addonUrl;
      let authInfo;

      if (config.authEnabled) {
        const maskedToken = config.proxyToken.substring(0, 4) + '****' + config.proxyToken.substring(config.proxyToken.length - 4);
        addonUrl = `${config.externalUrl}/${maskedToken}/manifest.json`;
        authInfo = `Token hash: ${hashToken(config.proxyToken)}`;
      } else {
        addonUrl = `${config.externalUrl}/manifest.json`;
        authInfo = 'AUTH DISABLED - No token required';
      }

      log.info(`
╔════════════════════════════════════════════════════════════════╗
║                         DEBROXY                                ║
║          Real-Debrid Stremio Addon & Stream Proxy              ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Server running on port ${String(config.port).padEnd(5)}                              ║
║                                                                ║
║  Stremio Install URL:                                          ║
║  ${addonUrl.substring(0, 60).padEnd(60)} ║
║                                                                ║
║  (${authInfo.padEnd(45)})  ║
║                                                                ║
║  Health check: http://localhost:${config.port}/health                   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
    });

    // Initialize library before marking server ready (ensures catalog is populated)
    log.info('Initializing library...');
    try {
      await library.initialize();
      log.info('Library initialized successfully');
    } catch (error) {
      log.error({ error: error.message }, 'Library initialization failed');
      // Don't exit - server can still function, just with empty catalog
    }

  } catch (error) {
    log.error({ error: error.message }, 'Failed to start server');
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  log.info('Shutting down...');

  // Stop sync timer
  library.stopSyncTimer();

  // Close HTTP server
  server.close(() => {
    log.info('HTTP server closed');
  });

  // Wait for active streams to finish (max 30s)
  const timeout = setTimeout(() => {
    log.warn('Shutdown timeout, forcing exit');
    db.close();
    process.exit(0);
  }, 30000);

  // Wait for streams to complete by polling
  const checkStreams = () => {
    const activeCount = proxy.getActiveStreams().length;
    if (activeCount === 0) {
      clearTimeout(timeout);
      db.close();
      log.info('Shutdown complete');
      process.exit(0);
    } else {
      log.debug({ activeStreams: activeCount }, 'Waiting for streams to complete');
      setTimeout(checkStreams, 1000);
    }
  };
  
  checkStreams();
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', async (error) => {
  log.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
  try {
    await db.close();
  } catch (err) {
    // Ignore close errors
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  log.error({ reason }, 'Unhandled rejection');
  try {
    await db.close();
  } catch (err) {
    // Ignore close errors
  }
  process.exit(1);
});

// Start server only when run directly (not when imported for testing)
if (process.env.NODE_ENV !== 'test') {
  start();
}

export { app, server, start, shutdown };
export default app;
