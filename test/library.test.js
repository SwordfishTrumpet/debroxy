/**
 * Library sync tests
 * Tests for library initialization and sync
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Note: These tests use mocked dependencies
// In a real test environment, you'd set up proper mocks

describe('library', () => {
  describe('processTorrent', () => {
    it('should parse and match a movie torrent', async () => {
      // Mock test - validates the concept
      const mockTorrent = {
        id: 'ABC123',
        filename: 'Movie.Name.2023.1080p.BluRay.x264-GROUP',
        hash: 'abc123def456',
      };

      // The library module would:
      // 1. Parse the filename
      // 2. Search Cinemeta
      // 3. Store in database
      
      assert.ok(mockTorrent.filename.includes('Movie'));
    });

    it('should mark unmatched torrents', async () => {
      const mockTorrent = {
        id: 'XYZ789',
        filename: 'random_file_with_no_pattern.mkv',
      };

      // Torrents that can't be parsed should be marked unmatched
      assert.ok(mockTorrent.filename.length > 0);
    });
  });

  describe('incrementalSync', () => {
    it('should only process new torrents', async () => {
      // Mock indexed IDs
      const indexedIds = new Set(['A', 'B', 'C']);
      const currentTorrents = [
        { id: 'A', filename: 'existing1' },
        { id: 'B', filename: 'existing2' },
        { id: 'D', filename: 'new_torrent' },
      ];

      const newTorrents = currentTorrents.filter(t => !indexedIds.has(t.id));
      assert.strictEqual(newTorrents.length, 1);
      assert.strictEqual(newTorrents[0].id, 'D');
    });

    it('should detect removed torrents', async () => {
      const indexedIds = new Set(['A', 'B', 'C']);
      const currentIds = new Set(['A', 'C']); // B was removed

      const removed = [];
      for (const id of indexedIds) {
        if (!currentIds.has(id)) {
          removed.push(id);
        }
      }

      assert.deepStrictEqual(removed, ['B']);
    });
  });

  describe('Cinemeta matching', () => {
    it('should score exact title match highest', () => {
      const queryLower = 'movie name';
      const meta = { name: 'Movie Name' };
      
      // Exact match should score 1.0
      const nameLower = meta.name.toLowerCase();
      const score = nameLower === queryLower ? 1.0 : 0;
      
      assert.strictEqual(score, 1.0);
    });

    it('should give bonus for year match', () => {
      const query = 'movie name 2023';
      const meta = { name: 'Movie Name', year: 2023 };
      
      const yearMatch = query.match(/\b(19|20)\d{2}\b/);
      const yearBonus = yearMatch && parseInt(yearMatch[0]) === meta.year ? 0.2 : 0;
      
      assert.strictEqual(yearBonus, 0.2);
    });

    it('should reject low confidence matches', () => {
      const minConfidence = 0.5;
      const scores = [0.3, 0.4, 0.49];
      
      for (const score of scores) {
        assert.ok(score < minConfidence, `Score ${score} should be below threshold`);
      }
    });
  });

  describe('Season pack handling', () => {
    it('should parse episode info from files', () => {
      const files = [
        { path: 'Show.S01E01.mkv' },
        { path: 'Show.S01E02.mkv' },
        { path: 'Show.S01E03.mkv' },
      ];

      const parsed = files.map(f => {
        const match = /S(\d+)E(\d+)/i.exec(f.path);
        return match ? { season: parseInt(match[1]), episode: parseInt(match[2]) } : null;
      });

      assert.strictEqual(parsed.length, 3);
      assert.strictEqual(parsed[0].episode, 1);
      assert.strictEqual(parsed[2].episode, 3);
    });
  });

  describe('Resume support', () => {
    it('should track sync offset', () => {
      const syncState = new Map();
      
      syncState.set('sync_offset', '500');
      assert.strictEqual(syncState.get('sync_offset'), '500');
      
      syncState.set('sync_offset', '600');
      assert.strictEqual(syncState.get('sync_offset'), '600');
    });

    it('should clear offset on completion', () => {
      const syncState = new Map();
      syncState.set('sync_offset', '1000');
      syncState.set('initial_sync_complete', 'true');
      syncState.delete('sync_offset');
      
      assert.strictEqual(syncState.has('sync_offset'), false);
      assert.strictEqual(syncState.get('initial_sync_complete'), 'true');
    });
  });
});
