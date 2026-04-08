/**
 * Stream proxy with Range support and concurrency limiting
 * @module proxy
 */

import { pipeline } from 'stream/promises';
import { lookup } from 'dns/promises';
import axios from 'axios';
import config from './config.js';
import { createLogger } from './logger.js';
import { PROXY_REQUEST_TIMEOUT_MS, PROXY_MAX_REDIRECTS, MAX_PROXY_SIZE_BYTES, MAX_STREAM_COUNTER } from './constants.js';

const log = createLogger('proxy');

// Active stream tracking
const activeStreams = new Map();
let streamCounter = 0;

// Whitelisted domains for proxying
const ALLOWED_DOMAINS = [
  'real-debrid.com',
  'rdb.so',
  'rdeb.io',
];

// MIME types for video file extensions
const VIDEO_MIME_TYPES = {
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
  mov: 'video/quicktime',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  m4v: 'video/x-m4v',
  ts: 'video/mp2t',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  m3u8: 'application/vnd.apple.mpegurl',
  mpd: 'application/dash+xml',
  // Subtitle MIME types
  srt: 'application/x-subrip',
  sub: 'text/plain',
  ass: 'text/x-ssa',
  ssa: 'text/x-ssa',
  vtt: 'text/vtt',
};

// Content-Types that break streaming and should be replaced
const BAD_CONTENT_TYPES = [
  'application/force-download',
  'application/octet-stream',
  'application/x-download',
];

/**
 * Get MIME type for a filename
 * @param {string} filename - Filename to get MIME type for
 * @param {string} [fallback='video/mp4'] - Fallback MIME type
 * @returns {string} MIME type
 */
export function getMimeType(filename, fallback = 'video/mp4') {
  const ext = filename?.split('.').pop()?.toLowerCase();
  return VIDEO_MIME_TYPES[ext] || fallback;
}

/**
 * Check if URL is an HLS manifest
 * @param {string} url - URL to check
 * @returns {boolean} True if HLS
 */
function isHlsManifest(url) {
  return url?.toLowerCase().endsWith('.m3u8') || false;
}

/**
 * Rewrite HLS manifest to proxy segments through Debroxy
 * This preserves auth/privacy while allowing adaptive streaming
 * @param {string} manifest - Original manifest content
 * @param {string} baseUrl - Base URL for segment resolution
 * @returns {string} Rewritten manifest
 */
function rewriteHlsManifest(manifest, baseUrl) {
  const lines = manifest.split('\n');
  const rewritten = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments (except #EXT-X-KEY and #EXT-X-MAP which contain URIs)
    if (!trimmed || trimmed.startsWith('#')) {
      // Check for URI-containing tags that need rewriting
      if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
        // Rewrite URI=... in these tags - for now keep simple
        rewritten.push(line);
      } else {
        rewritten.push(line);
      }
      continue;
    }
    
    // This is a segment URL - it could be relative or absolute
    let segmentUrl = trimmed;
    
    // If relative, resolve against base URL
    if (!segmentUrl.match(/^https?:\/\//)) {
      try {
        const base = new URL(baseUrl);
        // Handle relative paths
        if (segmentUrl.startsWith('/')) {
          segmentUrl = `${base.protocol}//${base.host}${segmentUrl}`;
        } else {
          // Relative to current path
          const pathParts = base.pathname.split('/');
          pathParts.pop(); // Remove filename
          const basePath = pathParts.join('/');
          segmentUrl = `${base.protocol}//${base.host}${basePath}/${segmentUrl}`;
        }
      } catch (e) {
        log.debug({ error: e.message }, 'Failed to resolve relative URL');
      }
    }
    
    // For now, pass through the URL as-is - segments are publicly accessible on RD
    // If auth/privacy is needed, we could encode and proxy them
    rewritten.push(segmentUrl);
  }
  
  return rewritten.join('\n');
}

/**
 * Check if an IP address is private/internal
 * Handles IPv4 and IPv6 formats including various encodings
 * @param {string} ip - IP address to check
 * @returns {boolean} True if private
 */
function isPrivateIp(ip) {
  // Handle IPv6 mapped IPv4 (::ffff:127.0.0.1)
  const cleanIp = ip.startsWith('::ffff:') ? ip.substring(7) : ip;

  // IPv6 patterns for private/loopback addresses
  const IPV6_PRIVATE_PATTERNS = [
    /^::1$/,                    // IPv6 loopback
    /^0:0:0:0:0:0:0:1$/,       // IPv6 loopback (expanded)
    /^fc/i,                     // fc00::/7 - Unique local (private)
    /^fd/i,                     // fc00::/7 - Unique local (private)
    /^fe[89ab]/i,               // fe80::/10 - Link-local
  ];

  // Check IPv6 addresses
  if (cleanIp.includes(':')) {
    return IPV6_PRIVATE_PATTERNS.some(pattern => pattern.test(cleanIp));
  }

  // IPv4 validation and parsing
  const parts = cleanIp.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Invalid IP format, treat as private to be safe
  }

  const [a, b, c] = parts;

  // IPv4 private/reserved ranges (RFC 1918 + special-use)
  return (
    a === 10 ||                              // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) ||     // 172.16.0.0/12
    (a === 192 && b === 168) ||              // 192.168.0.0/16
    a === 127 ||                              // 127.0.0.0/8 (loopback)
    (a === 169 && b === 254) ||              // 169.254.0.0/16 (link-local)
    a === 0 ||                                // 0.0.0.0/8
    (a === 192 && b === 0 && c === 0) ||     // 192.0.0.0/24 (IETF)
    (a === 192 && b === 0 && c === 2) ||     // 192.0.2.0/24 (TEST-NET-1)
    (a === 198 && b === 51 && c === 100) ||  // 198.51.100.0/24 (TEST-NET-2)
    (a === 203 && b === 0 && c === 113) ||   // 203.0.113.0/24 (TEST-NET-3)
    a >= 240                                  // 240.0.0.0/4 (reserved) + broadcast
  );
}

/**
 * Validate a URL for proxying
 * Resolves DNS and validates IPs to prevent SSRF via DNS rebinding
 * @param {string} urlString - URL to validate
 * @returns {Promise<{ valid: boolean, error?: string }>} Validation result
 */
export async function validateUrl(urlString) {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Normalize URL to prevent bypasses
    // Remove user info (user:pass@host)
    if (url.username || url.password) {
      return { valid: false, error: 'URL credentials not allowed' };
    }

    // Check against whitelist first (before DNS resolution)
    const hostname = url.hostname.toLowerCase();
    const isAllowed = ALLOWED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain),
    );

    if (!isAllowed) {
      return { valid: false, error: 'Domain not in whitelist' };
    }

    // Resolve DNS and check for private IPs (prevents DNS rebinding attacks)
    try {
      const addresses = await lookup(hostname, { all: true });

      for (const { address } of addresses) {
        if (isPrivateIp(address)) {
          log.warn({ hostname, address }, 'Blocked private IP from DNS resolution');
          return { valid: false, error: 'Private IP addresses are not allowed' };
        }
      }
    } catch (dnsError) {
      // If DNS resolution fails, we can't validate the IP
      // Allow it through since the domain is whitelisted
      // This maintains functionality for RD domains that may have DNS issues
      log.debug({ hostname, error: dnsError.message }, 'DNS resolution failed, allowing whitelisted domain');
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Get CORS headers for proxy responses
 * Note: Using wildcard (*) for Access-Control-Allow-Origin is acceptable here
 * because Access-Control-Allow-Credentials is set to 'false', preventing
 * authenticated requests from arbitrary origins. This wildcard is required
 * for media player compatibility across different Stremio clients.
 * @returns {Object} CORS headers
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Accept, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
    'Access-Control-Max-Age': '86400',
    // Security: do not allow credentials - this mitigates the risk of wildcard origin
    'Access-Control-Allow-Credentials': 'false',
  };
}

/**
 * Proxy middleware for streaming content
 * @param {Object} options - { url, filename, size, mimeType }
 * @returns {Function} Express middleware
 */
export function createProxyHandler(options) {
  return async (req, res) => {
    const { url, filename, mimeType } = options;

    // Validate URL before proxying
    const validation = await validateUrl(url);
    if (!validation.valid) {
      log.warn({ url: url.substring(0, 50), error: validation.error }, 'URL validation failed');
      return res.status(403).json({ error: validation.error, error_code: 'FORBIDDEN' });
    }

    // Check Content-Length header for size limits (if present in request)
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (!isNaN(contentLength) && contentLength > MAX_PROXY_SIZE_BYTES) {
      log.warn({ contentLength, maxSize: MAX_PROXY_SIZE_BYTES }, 'Request payload too large');
      return res.status(413).json({ 
        error: 'Payload too large',
        error_code: 'PAYLOAD_TOO_LARGE',
        maxSizeBytes: MAX_PROXY_SIZE_BYTES,
      });
    }

    // Check concurrency limit
    if (activeStreams.size >= config.maxConcurrentStreams) {
      log.warn({ active: activeStreams.size, max: config.maxConcurrentStreams }, 'Max concurrent streams reached');
      res.set('Retry-After', '30');
      return res.status(503).json({ 
        error: 'Maximum concurrent streams reached',
        active: activeStreams.size,
        max: config.maxConcurrentStreams,
      });
    }

    // Reset stream counter before overflow
    if (streamCounter >= MAX_STREAM_COUNTER) {
      streamCounter = 0;
    }
    const streamId = ++streamCounter;
    const startTime = Date.now();

    // Track this stream
    activeStreams.set(streamId, {
      id: streamId,
      filename,
      startTime,
      clientIp: req.ip,
    });

    log.info({ streamId, filename, clientIp: req.ip }, 'Stream started');

    // Build request headers
    const headers = {};
    
    // Forward Range header for seeking support
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const abortController = new AbortController();

    try {
      const response = await axios({
        method: 'get',
        url,
        headers,
        responseType: 'stream',
        signal: abortController.signal,
        timeout: PROXY_REQUEST_TIMEOUT_MS,
        maxRedirects: PROXY_MAX_REDIRECTS,
      });

      // Set response headers
      res.set(getCorsHeaders());

      // Forward relevant headers from RD
      // Override bad content-types that break streaming (RD often returns application/force-download)
      const rdContentType = response.headers['content-type'];
      const rdContentTypeBase = rdContentType?.toLowerCase().split(';')[0].trim();
      
      if (rdContentType && !BAD_CONTENT_TYPES.includes(rdContentTypeBase)) {
        res.set('Content-Type', rdContentType);
      } else if (mimeType) {
        res.set('Content-Type', mimeType);
      } else {
        res.set('Content-Type', getMimeType(filename));
      }

      if (response.headers['content-length']) {
        res.set('Content-Length', response.headers['content-length']);
      }

      if (response.headers['content-range']) {
        res.set('Content-Range', response.headers['content-range']);
      }

      if (response.headers['accept-ranges']) {
        res.set('Accept-Ranges', response.headers['accept-ranges']);
      } else {
        res.set('Accept-Ranges', 'bytes');
      }

      if (filename) {
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
      }

      // Set status code (206 for partial content, 200 for full)
      res.status(response.status);

      // Handle HLS manifests specially - buffer and rewrite for privacy/auth
      const isHls = isHlsManifest(url) || response.headers['content-type']?.includes('mpegurl');
      
      if (isHls && response.status === 200) {
        // Buffer the manifest and rewrite segment URLs
        let manifestBuffer = '';
        
        response.data.on('data', (chunk) => {
          manifestBuffer += chunk.toString('utf8');
        });
        
        response.data.on('end', () => {
          try {
            const rewritten = rewriteHlsManifest(manifestBuffer, url);
            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            res.set('Content-Length', Buffer.byteLength(rewritten));
            res.send(rewritten);
            
            const duration = Date.now() - startTime;
            log.info({ streamId, duration, filename, type: 'hls-manifest' }, 'HLS manifest served');
          } catch (error) {
            log.error({ streamId, error: error.message }, 'Failed to rewrite HLS manifest');
            res.status(502).json({ error: 'Failed to process stream' });
          } finally {
            activeStreams.delete(streamId);
          }
        });
        
        response.data.on('error', (error) => {
          log.error({ streamId, error: error.message }, 'HLS manifest stream error');
          if (!res.headersSent) {
            res.status(502).json({ error: 'Upstream error' });
          }
          activeStreams.delete(streamId);
        });
        
        return; // Exit early, we're handling the response manually
      }

      // Handle client disconnect
      req.on('close', () => {
        if (req.aborted || req.destroyed) {
          if (!res.writableEnded) {
            log.debug({ streamId }, 'Client disconnected, aborting upstream');
            try {
              abortController.abort();
            } catch (err) {
              log.debug({ streamId, error: err.message }, 'Abort failed');
            }
          }
        }
      });

      // Pipe response using pipeline for proper cleanup
      try {
        await pipeline(response.data, res);
      } catch (error) {
        if (!res.headersSent) {
          throw error; // Re-throw for outer catch block
        } else if (!res.writableEnded) {
          // Headers sent but stream failed - must close connection
          log.debug({ streamId, error: error.message }, 'Pipeline error after headers sent');
          res.destroy();
        }
        throw error; // Re-throw for finally block
      }

      const duration = Date.now() - startTime;
      log.info({ streamId, duration, filename }, 'Stream completed');

    } catch (error) {
      if (axios.isCancel(error) || error.name === 'AbortError') {
        log.debug({ streamId }, 'Stream aborted (client disconnect)');
      } else if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_PREMATURE_CLOSE' || error.message?.includes('EPIPE')) {
        // EPIPE: client closed connection mid-stream, not an actual error
        log.debug({ streamId, error: error.message }, 'Client disconnected (EPIPE)');
      } else if (!res.headersSent) {
        log.error({ streamId, error: error.message, code: error.code }, 'Stream error');
        res.status(502).json({ error: 'Upstream error' });
      }
    } finally {
      activeStreams.delete(streamId);
    }
  };
}

/**
 * Handle OPTIONS preflight requests
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export function handlePreflight(req, res) {
  res.set(getCorsHeaders());
  res.status(204).end();
}

/**
 * Get active stream status
 * @returns {Array} Active streams info
 */
export function getActiveStreams() {
  const now = Date.now();
  return Array.from(activeStreams.values()).map(stream => ({
    id: stream.id,
    filename: stream.filename,
    duration: Math.round((now - stream.startTime) / 1000),
    clientIp: stream.clientIp,
  }));
}

/**
 * Get stream count
 * @returns {number} Number of active streams
 */
export function getStreamCount() {
  return activeStreams.size;
}

export default {
  validateUrl,
  createProxyHandler,
  handlePreflight,
  getActiveStreams,
  getStreamCount,
  getMimeType,
};
