/**
 * Metrics unit tests
 * Tests for Prometheus metrics module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeRoute, updateLibraryMetrics, getMetrics, getContentType } from '../src/metrics.js';

describe('metrics', () => {
  describe('normalizeRoute', () => {
    it('should replace 32+ hex token in path', () => {
      // Token MUST be hex-only (a-f, 0-9) - 32+ characters
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/manifest.json');
      assert.strictEqual(result, '/:token/manifest.json');
    });

    it('should replace IMDB IDs in path', () => {
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/meta/movie/tt1234567.json');
      assert.strictEqual(result, '/:token/meta/movie/:imdb_id.json');
    });

    it('should replace longer IMDB IDs', () => {
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/stream/movie/tt12345678.json');
      assert.strictEqual(result, '/:token/stream/movie/:imdb_id.json');
    });

    it('should replace series IDs with season and episode', () => {
      // IMDB ID with :season:episode - only the tt part is replaced
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/stream/series/tt1234567:1:2.json');
      assert.strictEqual(result, '/:token/stream/series/:imdb_id:1:2.json');
    });

    it('should replace base64 encoded segments (20+ chars) with :encoded', () => {
      // Base64url encoded stream info (alphanumeric with _ and -, 20+ chars)
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/play/eyJyZElkIjoiYWJjMTIzIn0aaa');
      assert.strictEqual(result, '/:token/play/:encoded');
    });

    it('should handle manifest path with hex token', () => {
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/manifest.json');
      assert.strictEqual(result, '/:token/manifest.json');
    });

    it('should handle catalog paths', () => {
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/catalog/movie/rd-movies.json');
      assert.strictEqual(result, '/:token/catalog/movie/rd-movies.json');
    });

    it('should not modify health endpoint', () => {
      const result = normalizeRoute('/health');
      assert.strictEqual(result, '/health');
    });

    it('should handle API paths', () => {
      const result = normalizeRoute('/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4/api/library');
      assert.strictEqual(result, '/:token/api/library');
    });

    it('should replace numeric IDs', () => {
      const result = normalizeRoute('/api/items/12345');
      assert.strictEqual(result, '/api/items/:id');
    });

    it('should fall back to :encoded for non-hex long tokens', () => {
      // Token with non-hex characters (g, h, i, etc.) - will be :encoded, not :token
      const result = normalizeRoute('/abc123def456ghij7890klmnopqrstuv/manifest.json');
      assert.strictEqual(result, '/:encoded/manifest.json');
    });
  });

  describe('updateLibraryMetrics', () => {
    it('should handle null stats without throwing', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        updateLibraryMetrics(null);
      });
    });

    it('should handle undefined stats without throwing', () => {
      assert.doesNotThrow(() => {
        updateLibraryMetrics(undefined);
      });
    });

    it('should handle empty object without throwing', () => {
      assert.doesNotThrow(() => {
        updateLibraryMetrics({});
      });
    });

    it('should handle partial stats', () => {
      assert.doesNotThrow(() => {
        updateLibraryMetrics({ movies: 10 });
      });
    });

    it('should handle complete stats', () => {
      assert.doesNotThrow(() => {
        updateLibraryMetrics({
          movies: 100,
          series: 50,
          torrents: 200,
          unmatched: 10,
          isComplete: true,
          lastSync: Date.now(),
        });
      });
    });

    it('should handle invalid lastSync gracefully', () => {
      assert.doesNotThrow(() => {
        updateLibraryMetrics({
          movies: 10,
          lastSync: 'invalid-date',
        });
      });
    });

    it('should handle NaN values in stats', () => {
      assert.doesNotThrow(() => {
        updateLibraryMetrics({
          movies: NaN,
          series: undefined,
          torrents: null,
        });
      });
    });
  });

  describe('getMetrics', () => {
    it('should return metrics in Prometheus format', async () => {
      const metrics = await getMetrics();
      
      assert.strictEqual(typeof metrics, 'string');
      // Should contain standard metric types
      assert.ok(metrics.includes('# TYPE'));
      assert.ok(metrics.includes('# HELP'));
    });
  });

  describe('getContentType', () => {
    it('should return Prometheus content type', () => {
      const contentType = getContentType();
      
      assert.strictEqual(typeof contentType, 'string');
      assert.ok(contentType.includes('text/plain'));
    });
  });
});
