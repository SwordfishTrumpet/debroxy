/**
 * Configure module unit tests
 * Tests for configure page generation
 */

// Setup test environment BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.PROXY_TOKEN = 'test-token-1234567890abcdef1234567890abcdef';
process.env.RD_API_KEY = 'test-rd-api-key-1234567890';
process.env.EXTERNAL_URL = 'http://localhost:9999';
process.env.PORT = '8888';
process.env.MAX_CONCURRENT_STREAMS = '3';
process.env.SYNC_INTERVAL_MIN = '15';
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import configure after environment is set up
const { generateConfigurePage } = await import('../src/configure.js');

describe('configure', () => {
  describe('generateConfigurePage', () => {
    it('should generate HTML with title', () => {
      const data = {
        library: {
          isSyncing: false,
          isComplete: true,
          lastSync: String(Date.now()),
          stats: {
            movies: 5,
            series: 10,
            torrents: 15,
            unmatched: 2,
            files: 100,
            subtitles: 50,
            watch_history: 30,
          },
        },
        streams: {
          active: 0,
          max: 3,
        },
        token: 'test-token',
        apiBase: '/api',
        lowBandwidthMode: false,
      };

      const html = generateConfigurePage(data);
      assert(html.includes('Debroxy - Configuration'), 'Should contain title');
      assert(html.includes('<!DOCTYPE html>'), 'Should be HTML document');
      assert(html.includes('<html lang="en">'), 'Should have html tag');
    });

    it('should handle missing stats with defaults', () => {
      const data = {
        library: {
          isSyncing: false,
          isComplete: false,
          lastSync: null,
          stats: null,
        },
        streams: {
          active: 0,
          max: 3,
        },
        token: null,
        apiBase: '/api',
        lowBandwidthMode: false,
      };

      const html = generateConfigurePage(data);
      // Should not throw
      assert(typeof html === 'string');
      // Should contain default stats elements
      assert(html.includes('stat-movies'), 'Should contain movies stat element');
      assert(html.includes('stat-series'), 'Should contain series stat element');
      assert(html.includes('stat-torrents'), 'Should contain torrents stat element');
    });

    it('should display sync status correctly', () => {
      const dataSyncing = {
        library: {
          isSyncing: true,
          isComplete: false,
          lastSync: String(Date.now() - 60000),
          stats: { movies: 1, series: 2, torrents: 3, unmatched: 0, files: 0, subtitles: 0, watch_history: 0 },
        },
        streams: { active: 0, max: 3 },
        token: 'test',
        apiBase: '/api',
        lowBandwidthMode: false,
      };

      const htmlSyncing = generateConfigurePage(dataSyncing);
      assert(htmlSyncing.includes('Syncing'), 'Should indicate syncing status');

      const dataComplete = {
        ...dataSyncing,
        library: { ...dataSyncing.library, isSyncing: false, isComplete: true },
      };
      const htmlComplete = generateConfigurePage(dataComplete);
      assert(htmlComplete.includes('Complete'), 'Should indicate complete status');

      const dataPending = {
        ...dataSyncing,
        library: { ...dataSyncing.library, isSyncing: false, isComplete: false },
      };
      const htmlPending = generateConfigurePage(dataPending);
      assert(htmlPending.includes('Pending'), 'Should indicate pending status');
    });

    it('should include token info when auth enabled', () => {
      const dataWithToken = {
        library: {
          isSyncing: false,
          isComplete: true,
          lastSync: String(Date.now()),
          stats: { movies: 1, series: 0, torrents: 1, unmatched: 0, files: 0, subtitles: 0, watch_history: 0 },
        },
        streams: { active: 0, max: 3 },
        token: 'test-token-123',
        apiBase: '/api',
        lowBandwidthMode: false,
      };

      const html = generateConfigurePage(dataWithToken);
      // Should include token display (masked)
      assert(html.includes('test-token-123'), 'Should include token');
    });

    it('should handle null token (auth disabled)', () => {
      const dataNoToken = {
        library: {
          isSyncing: false,
          isComplete: true,
          lastSync: String(Date.now()),
          stats: { movies: 1, series: 0, torrents: 1, unmatched: 0, files: 0, subtitles: 0, watch_history: 0 },
        },
        streams: { active: 0, max: 3 },
        token: null,
        apiBase: '/api',
        lowBandwidthMode: false,
      };

      const html = generateConfigurePage(dataNoToken);
      // Should not crash
      assert(typeof html === 'string');
      // Should still contain authentication info
      assert(html.includes('Authentication'), 'Should contain authentication section');
    });

    it('should include active streams information', () => {
      const dataWithStreams = {
        library: {
          isSyncing: false,
          isComplete: true,
          lastSync: String(Date.now()),
          stats: { movies: 5, series: 5, torrents: 10, unmatched: 0, files: 0, subtitles: 0, watch_history: 0 },
        },
        streams: {
          active: 2,
          max: 3,
        },
        token: 'test',
        apiBase: '/api',
        lowBandwidthMode: false,
      };

      const html = generateConfigurePage(dataWithStreams);
      // Should display active streams count
      assert(html.includes('2 / 3'), 'Should include active/max streams');
    });

    it('should include low bandwidth mode indicator', () => {
      const dataLowBandwidth = {
        library: {
          isSyncing: false,
          isComplete: true,
          lastSync: String(Date.now()),
          stats: { movies: 1, series: 0, torrents: 1, unmatched: 0, files: 0, subtitles: 0, watch_history: 0 },
        },
        streams: { active: 0, max: 3 },
        token: 'test',
        apiBase: '/api',
        lowBandwidthMode: true,
      };

      const html = generateConfigurePage(dataLowBandwidth);
      assert(html.includes('Low bandwidth mode'), 'Should indicate low bandwidth mode');
    });
  });
});