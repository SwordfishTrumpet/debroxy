/**
 * Library integration tests
 * Tests the actual library module with mocked dependencies
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { setupTestEnv } from './helpers.js';

// Setup test environment before importing modules
setupTestEnv();

// Now import modules
const db = await import('../src/db.js');
const library = await import('../src/library.js');
const parser = await import('../src/parser.js');

describe('library integration', () => {
  // Clean state before each test
  before(() => {
    // Clean up any existing test data
    try {
      const stats = db.getStats();
      if (stats.torrents > 0 || stats.unmatched > 0) {
        // Get all torrent IDs and remove them
        const allIds = db.getAllTorrentIds();
        for (const id of allIds) {
          db.removeTorrent(id, null);
          db.removeUnmatched(id);
        }
      }
      // Reset sync state
      db.deleteSyncState('initial_sync_complete');
      db.deleteSyncState('sync_offset');
      db.deleteSyncState('last_sync');
    } catch {
      // Ignore errors during cleanup
    }
  });

  after(() => {
    // Stop any running sync timer
    library.stopSyncTimer();
  });

  describe('parser integration', () => {
    it('should parse movie torrents correctly', () => {
      const testCases = [
        {
          filename: 'Movie.Name.2023.1080p.BluRay.x264-GROUP.mkv',
          expected: {
            title: 'Movie Name',
            year: 2023,
            type: 'movie',
            quality: '1080p',
            source: 'BluRay',
            codec: 'x264',
          },
        },
        {
          filename: 'Another.Movie.2022.2160p.WEB-DL.DDP5.1.HDR.HEVC-GROUP.mp4',
          expected: {
            title: 'Another Movie',
            year: 2022,
            type: 'movie',
            quality: '2160p',
            source: 'WEB-DL',
            codec: 'x265',
            hdr: 'HDR',
          },
        },
      ];

      for (const { filename, expected } of testCases) {
        const parsed = parser.parse(filename);
        assert.ok(parsed.title, `Should extract title from ${filename}`);
        assert.strictEqual(parsed.type, expected.type, `Should detect movie type for ${filename}`);
        if (expected.year) {
          assert.strictEqual(parsed.year, expected.year, `Should extract year from ${filename}`);
        }
      }
    });

    it('should parse series torrents correctly', () => {
      const testCases = [
        {
          filename: 'Show.Name.S01E05.1080p.WEBRip.x264-GROUP.mkv',
          expected: {
            title: 'Show Name',
            type: 'series',
            season: 1,
            episode: 5,
            quality: '1080p',
          },
        },
        {
          filename: 'Another.Show.S02.1080p.BluRay.x264-GROUP.mkv',
          expected: {
            title: 'Another Show',
            type: 'series',
            season: 2,
            episode: null, // Season pack
          },
        },
      ];

      for (const { filename, expected } of testCases) {
        const parsed = parser.parse(filename);
        assert.strictEqual(parsed.type, expected.type, `Should detect series type for ${filename}`);
        assert.strictEqual(parsed.season, expected.season, `Should extract season from ${filename}`);
      }
    });

    it('should build search queries from parsed metadata', () => {
      const parsed = {
        title: 'Movie Name',
        year: 2023,
        type: 'movie',
      };
      const query = parser.buildSearchQuery(parsed);
      assert.ok(query.includes('Movie Name'), 'Query should include title');
      assert.ok(query.includes('2023'), 'Query should include year');
    });
  });

  describe('database operations', () => {
    it('should store and retrieve titles', () => {
      const title = {
        imdb_id: 'tt1234567',
        type: 'movie',
        name: 'Test Movie',
        year: 2023,
        poster: 'https://example.com/poster.jpg',
        description: 'A test movie',
        genres: ['Action', 'Sci-Fi'],
        imdb_rating: 7.5,
      };

      db.upsertTitle(title);
      const retrieved = db.getTitleByImdb('tt1234567');
      
      assert.ok(retrieved, 'Should retrieve stored title');
      assert.strictEqual(retrieved.name, 'Test Movie', 'Should store name correctly');
      assert.strictEqual(retrieved.year, 2023, 'Should store year correctly');
    });

    it('should store and retrieve torrents', () => {
      const torrent = {
        rd_id: 'RD123456',
        imdb_id: 'tt1234567',
        hash: 'abc123def456',
        filename: 'Test.Movie.2023.1080p.BluRay.x264-GROUP.mkv',
        quality: '1080p',
        source: 'BluRay',
        codec: 'x264',
        audio: 'AAC',
        hdr: null,
        season: null,
        episode: null,
      };

      db.upsertTorrent(torrent);
      
      // Check if indexed
      assert.ok(db.isIndexed('RD123456'), 'Should mark torrent as indexed');
      
      // Get streams for title
      const streams = db.getStreamsForTitle('tt1234567');
      assert.ok(streams.length > 0, 'Should retrieve streams for title');
    });

    it('should handle unmatched torrents', () => {
      const rdId = 'UNMATCHED001';
      const filename = 'random_unparsable_file.xyz';
      
      db.markUnmatched({
        rd_id: rdId,
        filename,
        reason: 'parse_failed',
      });
      
      assert.ok(db.isIndexed(rdId), 'Should mark unmatched as indexed');
      
      const unmatched = db.getUnmatched(0, 100);
      const found = unmatched.find(u => u.rd_id === rdId);
      assert.ok(found, 'Should retrieve unmatched torrent');
      assert.strictEqual(found.reason, 'parse_failed', 'Should store reason correctly');
      
      // Clean up
      db.removeUnmatched(rdId);
    });

    it('should update titles on conflict', () => {
      const imdbId = 'tt9999999';
      
      // First insert
      db.upsertTitle({
        imdb_id: imdbId,
        type: 'movie',
        name: 'Original Name',
        year: 2020,
      });
      
      // Update with new name
      db.upsertTitle({
        imdb_id: imdbId,
        type: 'movie',
        name: 'Updated Name',
        year: 2021,
      });
      
      const retrieved = db.getTitleByImdb(imdbId);
      assert.strictEqual(retrieved.name, 'Updated Name', 'Should update name on conflict');
      assert.strictEqual(retrieved.year, 2021, 'Should update year on conflict');
    });
  });

  describe('sync state management', () => {
    it('should store and retrieve sync state', () => {
      db.setSyncState('test_key', 'test_value');
      const value = db.getSyncState('test_key');
      assert.strictEqual(value, 'test_value', 'Should store and retrieve sync state');
      
      db.deleteSyncState('test_key');
      const deleted = db.getSyncState('test_key');
      assert.strictEqual(deleted, null, 'Should delete sync state');
    });

    it('should track sync completion', () => {
      db.setSyncState('initial_sync_complete', 'true');
      db.setSyncState('last_sync', String(Date.now()));
      
      const isComplete = db.getSyncState('initial_sync_complete') === 'true';
      const lastSync = db.getSyncState('last_sync');
      
      assert.ok(isComplete, 'Should track sync completion');
      assert.ok(lastSync, 'Should track last sync time');
      assert.ok(parseInt(lastSync) > 0, 'Last sync should be valid timestamp');
      
      // Clean up
      db.deleteSyncState('initial_sync_complete');
      db.deleteSyncState('last_sync');
    });
  });

  describe('catalog queries', () => {
    before(() => {
      // Insert test data
      db.upsertTitle({
        imdb_id: 'tt1000001',
        type: 'movie',
        name: 'Action Movie',
        year: 2023,
      });
      db.upsertTitle({
        imdb_id: 'tt1000002',
        type: 'movie',
        name: 'Comedy Movie',
        year: 2022,
      });
      db.upsertTitle({
        imdb_id: 'tt1000003',
        type: 'series',
        name: 'Drama Series',
        year: 2021,
      });
    });

    it('should retrieve movie catalog', () => {
      const movies = db.getCatalog('movie', { limit: 100 });
      assert.ok(movies.length >= 2, 'Should retrieve movies');
      
      const movieIds = movies.map(m => m.imdb_id);
      assert.ok(movieIds.includes('tt1000001') || movieIds.includes('tt1000002'), 
        'Should include test movies');
    });

    it('should retrieve series catalog', () => {
      const series = db.getCatalog('series', { limit: 100 });
      assert.ok(series.length >= 1, 'Should retrieve series');
      
      const seriesIds = series.map(s => s.imdb_id);
      assert.ok(seriesIds.includes('tt1000003'), 'Should include test series');
    });

    it('should search catalog by name', () => {
      const results = db.getCatalog('movie', { search: 'Action', limit: 100 });
      assert.ok(results.length >= 1, 'Should find movies by search');
      
      const found = results.find(r => r.name === 'Action Movie');
      assert.ok(found, 'Should find specific movie by name search');
    });
  });

  describe('library status', () => {
    it('should return library status', () => {
      const status = library.getStatus();
      
      assert.ok(typeof status.isSyncing === 'boolean', 'Should report syncing status');
      assert.ok(typeof status.isComplete === 'boolean', 'Should report completion status');
      assert.ok(status.stats, 'Should include stats');
      assert.ok(typeof status.stats.movies === 'number', 'Should include movie count');
      assert.ok(typeof status.stats.series === 'number', 'Should include series count');
      assert.ok(typeof status.stats.torrents === 'number', 'Should include torrent count');
    });
  });

  describe('cleanup operations', () => {
    it('should clean up old unmatched entries', () => {
      // Insert old unmatched entry with timestamp in the past
      const oldRdId = 'OLD_UNMATCHED_001';
      const pastTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      
      // Use direct SQL via db module's prepared statement
      const dbModule = db.default || db;
      const insertStmt = dbModule.prepare?.('INSERT INTO unmatched (rd_id, filename, reason, added_at) VALUES (?, ?, ?, ?)');
      
      if (insertStmt) {
        insertStmt.run(oldRdId, 'old_file.mkv', 'test_old', pastTimestamp);
        
        // Clean up entries older than 1 day (should remove our 25-hour-old entry)
        const deleted = db.cleanupOldUnmatched(1);
        assert.ok(deleted >= 1, 'Should delete old unmatched entries');
        
        // Verify deletion
        const remaining = db.getUnmatched(0, 100);
        const found = remaining.find(u => u.rd_id === oldRdId);
        assert.ok(!found, 'Should remove old unmatched entry');
      } else {
        // Fallback: just verify the function exists and returns a number
        const result = db.cleanupOldUnmatched(30);
        assert.ok(typeof result === 'number', 'cleanupOldUnmatched should return a number');
      }
    });
  });
});
