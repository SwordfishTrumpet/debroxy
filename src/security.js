/**
 * Security module - authentication, authorization, and security utilities
 * @module security
 */

import { createHash, timingSafeEqual } from 'crypto';
import config from './config.js';
import { ErrorCode, createErrorResponse } from './errors.js';
import { createLogger } from './logger.js';

const log = createLogger('security');

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

/**
 * Hash a token for logging (don't log actual tokens)
 * @param {string} token - Token to hash
 * @returns {string} Hashed token prefix
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex').substring(0, 8);
}

/**
 * Constant-time token comparison
 * @param {string} a - First token
 * @param {string} b - Second token
 * @returns {boolean} True if equal
 */
export function safeCompare(a, b) {
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
export function tokenAuth(req, res, next) {
  // Skip auth if disabled
  if (!config.authEnabled) {
    return next();
  }

  const clientIp = req.ip;

  // Check if IP is locked out due to failed attempts
  const attempts = failedAuthAttempts.get(clientIp);
  if (attempts && attempts.count >= MAX_FAILED_ATTEMPTS && attempts.lockedUntil) {
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
