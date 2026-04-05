/**
 * Test helper functions
 * Provides utilities for integration testing
 */

import { createServer } from 'http';

/** Test token - at least 32 chars for security checks */
export const TEST_TOKEN = 'test-token-1234567890abcdef1234567890abcdef';

/** Test RD API key */
export const TEST_RD_API_KEY = 'test-rd-api-key-1234567890';

/** Test external URL */
export const TEST_EXTERNAL_URL = 'http://localhost:9999';

/**
 * Setup test environment variables
 * Must be called before importing server modules
 */
export function setupTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.PROXY_TOKEN = TEST_TOKEN;
  process.env.RD_API_KEY = TEST_RD_API_KEY;
  process.env.EXTERNAL_URL = TEST_EXTERNAL_URL;
  process.env.PORT = '0'; // Random available port
  process.env.DB_PATH = ':memory:'; // In-memory SQLite for tests
  process.env.LOG_LEVEL = 'silent';
}

/**
 * Get a random available port
 * @returns {Promise<number>} Available port number
 */
export function getRandomPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Create authenticated request headers
 * @param {string} token - Auth token (defaults to TEST_TOKEN)
 * @returns {Object} Headers object with Authorization
 */
export function authHeaders(token = TEST_TOKEN) {
  return {
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Wait for a condition with timeout
 * @param {Function} condition - Function returning boolean
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} intervalMs - Check interval in milliseconds
 * @returns {Promise<boolean>}
 */
export async function waitFor(condition, timeoutMs = 5000, intervalMs = 50) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Mock Real-Debrid API responses
 */
export const mockRdResponses = {
  user: {
    id: 123,
    username: 'testuser',
    email: 'test@example.com',
    premium: 1,
    expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  
  torrent: {
    id: 'ABC123',
    filename: 'Test.Movie.2023.1080p.BluRay.x264-GROUP',
    hash: 'abc123def456',
    bytes: 1073741824,
    host: 'real-debrid.com',
    status: 'downloaded',
    added: new Date().toISOString(),
    links: ['https://real-debrid.com/d/xyz789'],
    files: [
      { id: 1, path: '/Test.Movie.2023.1080p.BluRay.x264-GROUP/movie.mkv', bytes: 1073741824, selected: 1 },
    ],
  },
  
  torrents: [],
  
  unrestrict: {
    id: 'UNR123',
    filename: 'movie.mkv',
    filesize: 1073741824,
    link: 'https://real-debrid.com/d/abc123',
    host: 'real-debrid.com',
    chunks: 1,
    download: 'https://download.real-debrid.com/d/xyz789/movie.mkv',
    streamable: 1,
  },
};
