/**
 * Structured logging with Pino
 * Supports pretty printing in dev, JSON in production, and optional file rotation
 * @module logger
 */

import pino from 'pino';
import config from './config.js';

// Log rotation settings from environment
const LOG_ROTATION = process.env.LOG_ROTATION === 'true';
const LOG_FILE = process.env.LOG_FILE || './logs/debroxy.log';
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '14', 10);
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '100m'; // 100MB per file
const LOG_FREQUENCY = process.env.LOG_FREQUENCY || 'daily'; // daily, hourly, or custom

/**
 * Build transport configuration based on environment
 * @returns {Object|undefined} Pino transport configuration
 */
function buildTransport() {
  // Development: pretty print to stdout
  if (config.isDev) {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  // Production with log rotation enabled
  if (LOG_ROTATION) {
    return {
      targets: [
        // Console output (for Docker/systemd to capture)
        {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
          level: config.logLevel,
        },
        // Rotating file output
        {
          target: 'pino-roll',
          options: {
            file: LOG_FILE,
            frequency: LOG_FREQUENCY,
            limit: { count: LOG_RETENTION_DAYS },
            size: LOG_MAX_SIZE,
            mkdir: true,
            dateFormat: 'yyyy-MM-dd',
          },
          level: config.logLevel,
        },
      ],
    };
  }

  // Production without rotation: plain JSON to stdout
  return undefined;
}

/**
 * Creates configured Pino logger instance
 * - Pretty prints in development
 * - JSON output in production
 * - Optional rotating file transport
 * - Redacts sensitive headers
 */
const logger = pino({
  level: config.logLevel,
  transport: buildTransport(),
  redact: {
    paths: [
      // Authorization headers (pino redact is case-insensitive)
      'req.headers.authorization',
      // Cookie headers (pino redact is case-insensitive)
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      // Generic sensitive fields (pino redact is case-insensitive)
      '*.apiKey',
      '*.api_key',
      '*.token',
      '*.password',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.ip || req.connection?.remoteAddress,
      reqId: req.id,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

// Log rotation config on startup (only in production with rotation)
if (LOG_ROTATION && !config.isDev) {
  logger.info({
    logFile: LOG_FILE,
    frequency: LOG_FREQUENCY,
    retentionDays: LOG_RETENTION_DAYS,
    maxSize: LOG_MAX_SIZE,
  }, 'Log rotation enabled');
}

/**
 * Creates a child logger with additional context
 * @param {string} name - Module name
 * @returns {pino.Logger} Child logger instance
 */
export function createLogger(name) {
  return logger.child({ module: name });
}

/**
 * Creates a child logger with request ID context
 * @param {string} name - Module name
 * @param {string} reqId - Request ID
 * @returns {pino.Logger} Child logger instance with request ID
 */
export function createRequestLogger(name, reqId) {
  return logger.child({ module: name, reqId });
}

export default logger;
