/**
 * Library sync unit tests
 * 
 * Note: Library functions (initialize, sync, resync) require a live RD API connection.
 * For integration testing with mocked DB, see library.integration.test.js.
 * These tests validate pure logic that can be tested without external dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as parser from '../src/parser.js';

describe('library', () => {
  describe('torrent processing pipeline (parser stage)', () => {
    it('should parse a movie torrent filename', () => {
      const parsed = parser.parse('Movie.Name.2023.1080p.BluRay.x264-GROUP');
      
      assert.strictEqual(parsed.title, 'Movie Name');
      assert.strictEqual(parsed.year, 2023);
      assert.ok(parsed.quality, 'should have quality');
      assert.ok(parsed.source, 'should have source');
      assert.ok(parsed.codec, 'should have codec');
    });

    it('should parse a series torrent filename with season/episode', () => {
      const parsed = parser.parse('Show.Name.S02E05.720p.WEB-DL.x265-GROUP');
      
      assert.strictEqual(parsed.title, 'Show Name');
      assert.strictEqual(parsed.season, 2);
      assert.strictEqual(parsed.episode, 5);
      assert.ok(parsed.quality, 'should have quality');
    });

    it('should detect season packs', () => {
      const parsed = parser.parse('Show.Name.S03.COMPLETE.1080p.BluRay.x264');
      
      assert.strictEqual(parsed.season, 3);
      assert.strictEqual(parsed.episode, null);
    });

    it('should build search query with year', () => {
      const parsed = parser.parse('Movie.Name.2023.1080p.BluRay.x264-GROUP');
      const query = parser.buildSearchQuery(parsed);
      
      assert.ok(query.includes('Movie Name'));
      assert.ok(query.includes('2023'));
    });

    it('should return falsy title for unparseable filenames', () => {
      const parsed = parser.parse('');
      assert.ok(!parsed.title, 'title should be falsy for empty input');
    });
  });

  describe('season pack file detection', () => {
    it('should parse episode info from filenames', () => {
      const result = parser.parseEpisodeFromFilename('Show.S01E03.720p.mkv');
      
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, 3);
    });

    it('should return null for non-episode files', () => {
      const result = parser.parseEpisodeFromFilename('random_file.mkv');
      assert.strictEqual(result, null);
    });
  });

  describe('subtitle detection', () => {
    it('should detect subtitle files', () => {
      assert.strictEqual(parser.isSubtitleFile('movie.en.srt'), true);
      assert.strictEqual(parser.isSubtitleFile('movie.vtt'), true);
      assert.strictEqual(parser.isSubtitleFile('movie.ass'), true);
      assert.strictEqual(parser.isSubtitleFile('movie.mkv'), false);
    });

    it('should parse subtitle language info', () => {
      const info = parser.parseSubtitleInfo('movie.english.srt');
      assert.ok(info.format);
    });
  });
});
