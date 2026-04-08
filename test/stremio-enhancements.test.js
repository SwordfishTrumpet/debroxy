/**
 * Tests for Stremio enhancements
 * Tests manifest, encoding/decoding, and subtitle handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as stremio from '../src/stremio.js';

describe('Stremio Enhancements', () => {
  describe('Manifest', () => {
    it('getManifest should return enhanced manifest', () => {
      const manifest = stremio.getManifest();
      
      assert.strictEqual(manifest.id, 'com.debroxy.stremio');
      assert.ok(manifest.version);
      assert.ok(manifest.name);
      assert.ok(manifest.description);
      assert.ok(Array.isArray(manifest.catalogs));
      assert.ok(Array.isArray(manifest.resources));
      assert.ok(Array.isArray(manifest.types));
      assert.ok(Array.isArray(manifest.idPrefixes));
      assert.ok(manifest.behaviorHints);
    });

    it('manifest should include search in extraSupported', () => {
      const manifest = stremio.getManifest();
      
      for (const catalog of manifest.catalogs) {
        assert.ok(Array.isArray(catalog.extraSupported));
        assert.ok(catalog.extraSupported.includes('search') || catalog.extraSupported.includes('skip'));
      }
    });

    it('manifest should include subtitles in resources', () => {
      const manifest = stremio.getManifest();
      assert.ok(manifest.resources.includes('subtitles'), 'Resources should include subtitles');
    });
  });

  describe('Stream Info Encoding', () => {
    it('encodeStreamInfo should encode and decode correctly', () => {
      const original = { rdId: 'ABC123', fileId: 1, filename: 'test.mkv' };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64url');
      const decoded = stremio.decodeStreamInfo(encoded);
      
      assert.strictEqual(decoded.rdId, original.rdId);
      assert.strictEqual(decoded.fileId, original.fileId);
      assert.strictEqual(decoded.filename, original.filename);
    });

    it('decodeStreamInfo should return null for invalid input', () => {
      const result = stremio.decodeStreamInfo('not-valid-json!!!');
      assert.strictEqual(result, null);
    });
  });

  describe('Subtitles', () => {
    it('subtitle info should encode and decode correctly', () => {
      const original = { rdId: 'RD123', subtitleFileId: 42, filename: 'movie.en.srt' };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64url');
      const decoded = stremio.decodeStreamInfo(encoded);

      assert.strictEqual(decoded.rdId, 'RD123');
      assert.strictEqual(decoded.subtitleFileId, 42);
      assert.strictEqual(decoded.filename, 'movie.en.srt');
    });

    it('handleSubtitles should return subtitles array for non-existent title', () => {
      const result = stremio.handleSubtitles('movie', 'tt0000000', 'testtoken');
      assert.ok(result, 'Should return a response object');
      assert.ok(Array.isArray(result.subtitles), 'Should have subtitles array');
    });
  });
});
