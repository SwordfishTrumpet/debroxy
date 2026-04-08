/**
 * Express server - thin entry point
 * @module server
 */

import { createServer } from 'http';
import net from 'net';
import { randomUUID } from 'crypto';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import { createLogger, createRequestLogger } from './logger.js';
import * as db from './db.js';
import * as rd from './realdebrid.js';
import * as library from './library.js';
import * as proxy from './proxy.js';
import * as metrics from './metrics.js';
import { ErrorCode, createErrorResponse, getSafeMessage } from './errors.js';
import { tokenAuth, hashToken } from './security.js';
import { API_TIMEOUT_MS, STREAM_TIMEOUT_MS } from './constants.js';
import { registerStremioRoutes } from './routes/stremio.js';
import { registerApiRoutes } from './routes/api.js';
import { registerSystemRoutes } from './routes/system.js';

const log = createLogger('server');
const METRICS_ENABLED = process.env.ENABLE_METRICS !== 'false';

const app = express();

// Trust proxy for correct IP detection behind reverse proxies
const TRUSTED_PROXIES = process.env.TRUSTED_PROXIES
  ? process.env.TRUSTED_PROXIES.split(',')
    .map(ip => ip.trim())
    .filter(ip => {
      const isValid = net.isIP(ip) !== 0;
      if (!isValid && ip) log.warn({ ip }, 'Invalid IP in TRUSTED_PROXIES, skipping');
      return isValid;
    })
  : ['127.0.0.1', '::1'];

const finalProxies = TRUSTED_PROXIES.length > 0 ? TRUSTED_PROXIES : ['127.0.0.1', '::1'];
app.set('trust proxy', finalProxies);

if (config.isDev) log.debug({ trustedProxies: finalProxies }, 'Trust proxy configured');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
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
    const contentType = res.getHeader('Content-Type');
    if (typeof contentType === 'string') return /json|text/.test(contentType);
    return compression.filter(req, res);
  },
  threshold: 1024,
}));

// CORS headers required for Stremio addon
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

app.options('*', (req, res) => res.status(200).end());

// JSON parsing with size limits to prevent DoS
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Request timeout middleware factory
 */
function createTimeoutMiddleware(timeoutMs) {
  return (req, res, next) => {
    req.setTimeout(timeoutMs);
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout', error_code: 'REQUEST_TIMEOUT' });
      }
    }, timeoutMs);
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

// Apply default API timeout (streaming routes override this)
app.use(createTimeoutMiddleware(API_TIMEOUT_MS));

// Request ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  req.log = createRequestLogger('request', req.id);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Metrics middleware
if (METRICS_ENABLED) app.use(metrics.metricsMiddleware);

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { error: 'Health check rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/health', healthLimiter);
app.use(authLimiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const reqLog = req.log || log;
    reqLog.debug({
      method: req.method,
      url: req.url.replace(/\/[a-f0-9]{32,}/gi, '/:token'),
      status: res.statusCode,
      duration,
      reqId: req.id,
    });
  });
  next();
});

// Route registration helper
const prefix = config.authEnabled ? '/:token' : '';
const authMiddleware = config.authEnabled ? [tokenAuth] : [];

// Register routes
registerStremioRoutes(app, { prefix, authMiddleware, createTimeoutMiddleware });
registerApiRoutes(app, { prefix, tokenAuth, createTimeoutMiddleware: (ms) => createTimeoutMiddleware(ms || STREAM_TIMEOUT_MS) });
registerSystemRoutes(app, { prefix, healthLimiter, tokenAuth });

// 404 handler
app.use((req, res) => {
  res.status(404).json(createErrorResponse(404, 'Not found', ErrorCode.NOT_FOUND));
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  log.error({
    error: err.message,
    code: err.code,
    status: err.status,
    stack: config.isDev ? err.stack : undefined,
    reqId: req.id,
  });

  let errorCode = err.errorCode || ErrorCode.INTERNAL_ERROR;
  if (err.code === 'CIRCUIT_OPEN') errorCode = ErrorCode.CIRCUIT_OPEN;
  else if (err.status === 429) errorCode = ErrorCode.RATE_LIMITED;
  else if (err.status && err.status < 500) errorCode = ErrorCode.BAD_REQUEST;

  const safeMessage = getSafeMessage(err, config.isDev);
  const status = err.status || 500;

  res.status(status).json(createErrorResponse(status, safeMessage, errorCode));
});

// Server startup
const server = createServer(app);

async function start() {
  try {
    log.info('Verifying Real-Debrid API key...');
    const user = await rd.getUser();
    log.info({ username: user.username, premium: user.premium > 0 }, 'RD API key valid');

    if (config.authWarning) {
      log.warn({
        warning: config.authWarning,
        impact: 'Anyone with access can stream from your Real-Debrid library',
        solution: 'Set PROXY_TOKEN to enable authentication',
      }, 'Authentication disabled');
    }

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

    log.info('Initializing library...');
    try {
      await library.initialize();
      log.info('Library initialized successfully');
    } catch (error) {
      log.error({ error: error.message }, 'Library initialization failed');
    }

  } catch (error) {
    log.error({ error: error.message }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown() {
  log.info('Shutting down...');
  library.stopSyncTimer();
  server.close(() => log.info('HTTP server closed'));

  const timeout = setTimeout(() => {
    log.warn('Shutdown timeout, forcing exit');
    db.close();
    process.exit(0);
  }, 30000);

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

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', async (error) => {
  log.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
  try { await db.close(); } catch { /* ignore */ }
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  log.error({ reason }, 'Unhandled rejection');
  try { await db.close(); } catch { /* ignore */ }
  process.exit(1);
});

if (process.env.NODE_ENV !== 'test') start();

export { app, server, start, shutdown };
export default app;
