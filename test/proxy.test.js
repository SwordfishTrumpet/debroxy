/**
 * Proxy tests
 * Tests for stream proxy functionality
 */

// Setup test environment BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.PROXY_TOKEN = 'test-token-1234567890abcdef1234567890abcdef';
process.env.RD_API_KEY = 'test-rd-api-key-1234567890';
process.env.EXTERNAL_URL = 'http://localhost:9999';
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateUrl, getActiveStreams, getStreamCount, getMimeType } from '../src/proxy.js';

describe('proxy', () => {
  describe('validateUrl', () => {
    it('accepts valid HTTPS RD URL', async () => {
      const result = await validateUrl('https://download.real-debrid.com/d/ABC123/file.mkv');
      assert.strictEqual(result.valid, true);
    });

    it('accepts rdb.so domain', async () => {
      const result = await validateUrl('https://rdb.so/d/ABC123');
      assert.strictEqual(result.valid, true);
    });

    it('accepts rdeb.io domain', async () => {
      const result = await validateUrl('https://rdeb.io/stream/123');
      assert.strictEqual(result.valid, true);
    });

    it('accepts subdomain of whitelisted domain', async () => {
      const result = await validateUrl('https://cdn1.real-debrid.com/file.mkv');
      assert.strictEqual(result.valid, true);
    });

    it('rejects HTTP URLs', async () => {
      const result = await validateUrl('http://real-debrid.com/file.mkv');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('HTTPS'));
    });

    it('rejects non-whitelisted domains', async () => {
      const result = await validateUrl('https://evil.com/file.mkv');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('whitelist'));
    });

    it('rejects private IP 10.x.x.x', async () => {
      const result = await validateUrl('https://10.0.0.1/file.mkv');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('whitelist') || result.error.includes('Private'));
    });

    it('rejects private IP 172.16.x.x', async () => {
      const result = await validateUrl('https://172.16.0.1/file.mkv');
      assert.strictEqual(result.valid, false);
    });

    it('rejects private IP 192.168.x.x', async () => {
      const result = await validateUrl('https://192.168.1.1/file.mkv');
      assert.strictEqual(result.valid, false);
    });

    it('rejects localhost', async () => {
      const result = await validateUrl('https://localhost/file.mkv');
      assert.strictEqual(result.valid, false);
    });

    it('rejects 127.0.0.1', async () => {
      const result = await validateUrl('https://127.0.0.1/file.mkv');
      assert.strictEqual(result.valid, false);
    });

    it('rejects metadata IP 169.254.x.x', async () => {
      const result = await validateUrl('https://169.254.169.254/latest/meta-data/');
      assert.strictEqual(result.valid, false);
    });

    it('rejects URLs with credentials', async () => {
      const result = await validateUrl('https://user:pass@real-debrid.com/file.mkv');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('credentials'));
    });

    it('rejects invalid URL format', async () => {
      const result = await validateUrl('not-a-url');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('Invalid'));
    });

    it('rejects empty string', async () => {
      const result = await validateUrl('');
      assert.strictEqual(result.valid, false);
    });

    it('handles URL with query params', async () => {
      const result = await validateUrl('https://download.real-debrid.com/d/ABC?token=xyz');
      assert.strictEqual(result.valid, true);
    });

    it('handles URL with port', async () => {
      const result = await validateUrl('https://real-debrid.com:443/file.mkv');
      assert.strictEqual(result.valid, true);
    });
  });

  describe('concurrency limiting', () => {
    it('getActiveStreams returns array', () => {
      const streams = getActiveStreams();
      assert.ok(Array.isArray(streams));
    });

    it('getStreamCount returns number', () => {
      const count = getStreamCount();
      assert.strictEqual(typeof count, 'number');
      assert.ok(count >= 0);
    });
  });

  describe('MIME type detection', () => {
    it('returns application/x-subrip for .srt files', () => {
      assert.strictEqual(getMimeType('movie.en.srt'), 'application/x-subrip');
    });

    it('returns text/vtt for .vtt files', () => {
      assert.strictEqual(getMimeType('subs.vtt'), 'text/vtt');
    });

    it('returns text/x-ssa for .ass files', () => {
      assert.strictEqual(getMimeType('movie.ass'), 'text/x-ssa');
    });

    it('returns text/x-ssa for .ssa files', () => {
      assert.strictEqual(getMimeType('movie.ssa'), 'text/x-ssa');
    });

    it('returns text/plain for .sub files', () => {
      assert.strictEqual(getMimeType('movie.sub'), 'text/plain');
    });

    it('returns video/mp4 for .mp4 files (regression)', () => {
      assert.strictEqual(getMimeType('movie.mp4'), 'video/mp4');
    });

    it('returns video/x-matroska for .mkv files (regression)', () => {
      assert.strictEqual(getMimeType('movie.mkv'), 'video/x-matroska');
    });

    it('returns video/x-msvideo for .avi files (regression)', () => {
      assert.strictEqual(getMimeType('movie.avi'), 'video/x-msvideo');
    });

    it('returns fallback for unknown extensions', () => {
      assert.strictEqual(getMimeType('file.xyz'), 'video/mp4');
    });
  });

  describe('settings integration', () => {
    it('should use settings module for configuration', async () => {
      // Import settings to verify it can be loaded
      const settings = await import('../src/settings.js');
      assert.strictEqual(typeof settings.get, 'function');

      // Verify maxConcurrentStreams is accessible
      const maxStreams = settings.get('maxConcurrentStreams');
      assert.strictEqual(typeof maxStreams, 'number');
      assert.ok(maxStreams >= 1 && maxStreams <= 20);
    });
  });
});
