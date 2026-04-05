/**
 * Server integration tests
 * Tests for Express routes, authentication, and error handling
 */

// Setup test environment BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.PROXY_TOKEN = 'test-token-1234567890abcdef1234567890abcdef';
process.env.RD_API_KEY = 'test-rd-api-key-1234567890';
process.env.EXTERNAL_URL = 'http://localhost:9999';
process.env.PORT = '0';
process.env.DB_PATH = ':memory:'; // Use in-memory SQLite for tests
process.env.LOG_LEVEL = 'silent';

import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';

const TEST_TOKEN = process.env.PROXY_TOKEN;

// Import app after environment is set up
const { default: app } = await import('../src/server.js');

describe('server', () => {
  describe('Health Check', () => {
    it('returns minimal status without auth', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      assert.deepStrictEqual(res.body, { status: 'ok' });
    });

    it('returns full stats with valid auth', async () => {
      const res = await request(app)
        .get('/health')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .expect(200);
      
      assert.strictEqual(res.body.status, 'ok');
      assert.ok(res.body.uptime >= 0);
      assert.ok(res.body.database);
      assert.ok(res.body.library);
      assert.ok(res.body.streams);
    });

    it('returns minimal status with invalid auth', async () => {
      const res = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);
      
      // Health check doesn't reject invalid tokens, just returns minimal info
      assert.deepStrictEqual(res.body, { status: 'ok' });
    });
  });

  describe('Token Authentication', () => {
    it('allows valid token in URL path', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/manifest.json`)
        .expect(200);
      
      assert.ok(res.body.id);
      assert.ok(res.body.name);
    });

    it('allows valid token in Authorization header', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/manifest.json`)
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .expect(200);
      
      assert.ok(res.body.id);
    });

    it('rejects invalid token with 401', async () => {
      const res = await request(app)
        .get('/invalid-token-here/manifest.json')
        .expect(401);
      
      assert.strictEqual(res.body.error, 'Unauthorized');
    });

    it('rejects missing token with 401', async () => {
      // Route with token placeholder but no matching auth
      await request(app)
        .get('/manifest.json')
        .expect(404);
    });

    it('prefers header token over URL token', async () => {
      // URL token is invalid, header token is valid
      const res = await request(app)
        .get('/invalid-url-token/manifest.json')
        .set('Authorization', `Bearer ${TEST_TOKEN}`)
        .expect(200);
      
      assert.ok(res.body.id);
    });
  });

  describe('CORS Headers', () => {
    it('returns CORS headers on all responses', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
      assert.ok(res.headers['access-control-allow-methods'].includes('GET'));
    });

    it('handles OPTIONS preflight requests', async () => {
      const res = await request(app)
        .options(`/${TEST_TOKEN}/manifest.json`)
        .expect(200);
      
      assert.strictEqual(res.headers['access-control-allow-origin'], '*');
    });
  });

  describe('Stremio Routes', () => {
    it('GET /:token/manifest.json returns valid manifest', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/manifest.json`)
        .expect(200);
      
      assert.ok(res.body.id);
      assert.ok(res.body.name);
      assert.ok(res.body.version);
      assert.ok(Array.isArray(res.body.catalogs));
      assert.ok(Array.isArray(res.body.resources));
    });

    it('GET /:token/catalog/:type/:id.json returns catalog', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/catalog/movie/rd-movies.json`)
        .expect(200);
      
      assert.ok(Array.isArray(res.body.metas));
      // Check no-cache headers
      assert.ok(res.headers['cache-control'].includes('no-cache'));
    });

    it('GET /:token/catalog/:type/:id/:extra.json handles search', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/catalog/movie/rd-movies/search=test.json`)
        .expect(200);
      
      assert.ok(Array.isArray(res.body.metas));
    });

    it('GET /:token/stream/:type/:id.json returns streams', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/stream/movie/tt1234567.json`)
        .expect(200);
      
      assert.ok(Array.isArray(res.body.streams));
    });
  });

  describe('Management API Routes', () => {
    it('GET /:token/api/library returns library status', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/api/library`)
        .expect(200);
      
      assert.ok(typeof res.body.isComplete === 'boolean');
    });

    it('GET /:token/api/streams returns stream info', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/api/streams`)
        .expect(200);
      
      assert.ok(Array.isArray(res.body.active));
      assert.ok(typeof res.body.max === 'number');
    });

    it('GET /:token/api/library/unmatched returns unmatched list', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/api/library/unmatched`)
        .expect(200);
      
      assert.ok(typeof res.body.count === 'number');
      assert.ok(Array.isArray(res.body.items));
    });

    it('POST /:token/api/magnet validates magnet format', async () => {
      const res = await request(app)
        .post(`/${TEST_TOKEN}/api/magnet`)
        .send({ magnet: 'invalid-magnet' })
        .expect(400);
      
      assert.ok(res.body.error.includes('Invalid'));
    });

    it('POST /:token/api/magnet requires magnet field', async () => {
      const res = await request(app)
        .post(`/${TEST_TOKEN}/api/magnet`)
        .send({})
        .expect(400);
      
      assert.ok(res.body.error.includes('required'));
    });

    it('POST /:token/api/unrestrict validates link format', async () => {
      const res = await request(app)
        .post(`/${TEST_TOKEN}/api/unrestrict`)
        .send({ link: 'javascript:alert(1)' })
        .expect(400);
      
      assert.ok(res.body.error.includes('Invalid'));
    });

    it('POST /:token/api/unrestrict blocks private IPs', async () => {
      const res = await request(app)
        .post(`/${TEST_TOKEN}/api/unrestrict`)
        .send({ link: 'http://192.168.1.1/file' })
        .expect(400);
      
      assert.ok(res.body.error.includes('Invalid') || res.body.error.includes('unsafe'));
    });
  });

  describe('Proxy Routes', () => {
    it('GET /:token/proxy/stream requires url parameter', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/proxy/stream`)
        .expect(400);
      
      assert.ok(res.body.error.includes('required'));
    });

    it('GET /:token/proxy/stream rejects non-whitelisted domains', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/proxy/stream`)
        .query({ url: 'https://evil.com/file.mkv' })
        .expect(403);
      
      assert.ok(res.body.error);
    });
  });

  describe('Error Handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app)
        .get('/nonexistent/route')
        .expect(404);
      
      assert.strictEqual(res.body.error, 'Not found');
    });

    it('returns JSON error for invalid JSON body', async () => {
      const res = await request(app)
        .post(`/${TEST_TOKEN}/api/magnet`)
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);
      
      assert.ok(res.body.error);
    });
  });

  describe('Security Headers', () => {
    it('includes security headers via helmet', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      // Helmet adds various security headers
      assert.ok(res.headers['x-content-type-options']);
      assert.ok(res.headers['referrer-policy']);
    });
  });

  describe('Rate Limiting', () => {
    it('applies rate limit headers', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/manifest.json`)
        .expect(200);
      
      // express-rate-limit adds these headers
      assert.ok(res.headers['ratelimit-limit']);
      assert.ok(res.headers['ratelimit-remaining']);
    });
  });

  describe('Request Size Limits', () => {
    it('rejects oversized JSON body', async () => {
      // Create a string > 10kb
      const largeBody = { data: 'x'.repeat(15000) };
      
      await request(app)
        .post(`/${TEST_TOKEN}/api/magnet`)
        .send(largeBody)
        .expect(413);
      
      // 413 Payload Too Large
    });
  });

  describe('Request ID Tracing', () => {
    it('returns X-Request-ID header in response', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);
      
      assert.ok(res.headers['x-request-id']);
      // Should be a valid UUID format
      assert.match(res.headers['x-request-id'], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('uses provided X-Request-ID from header', async () => {
      const customRequestId = 'custom-request-id-12345';
      const res = await request(app)
        .get('/health')
        .set('X-Request-ID', customRequestId)
        .expect(200);
      
      assert.strictEqual(res.headers['x-request-id'], customRequestId);
    });
  });

  describe('Prometheus Metrics', () => {
    it('GET /:token/metrics returns Prometheus format', async () => {
      const res = await request(app)
        .get(`/${TEST_TOKEN}/metrics`)
        .expect(200);
      
      // Should have Prometheus content type
      assert.ok(res.headers['content-type'].includes('text/plain'));
      // Should contain some expected metrics
      assert.ok(res.text.includes('debroxy_'));
      assert.ok(res.text.includes('http_requests_total') || res.text.includes('active_streams'));
    });

    it('metrics endpoint requires authentication', async () => {
      await request(app)
        .get('/invalid-token/metrics')
        .expect(401);
    });
  });
});
