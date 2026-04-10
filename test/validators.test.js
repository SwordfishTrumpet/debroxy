/**
 * Validators module unit tests
 * Tests for validation functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  VALID_TYPES,
  VALID_GENRES,
  VALID_SORTS,
  validateType,
  validateGenre,
  validateYear,
  validateSort,
  validateImdbId,
  validateRdId,
  validateMagnet,
  validateLink,
  validateStreamInfo,
  validatePagination,
  extractBaseId,
  parseExtraParams,
  validateProgressReport,
  validateWatchHistoryQuery,
} from '../src/validators.js';

describe('validators', () => {
  describe('constants', () => {
    it('should have VALID_TYPES', () => {
      assert.deepStrictEqual(VALID_TYPES, ['movie', 'series']);
    });

    it('should have VALID_GENRES', () => {
      assert.ok(VALID_GENRES.length > 0);
      assert.ok(VALID_GENRES.includes('Action'));
      assert.ok(VALID_GENRES.includes('Drama'));
    });

    it('should have VALID_SORTS', () => {
      assert.ok(VALID_SORTS.length > 0);
      assert.ok(VALID_SORTS.includes('added'));
      assert.ok(VALID_SORTS.includes('year_desc'));
    });
  });

  describe('validateType', () => {
    it('should accept valid types', () => {
      assert.strictEqual(validateType('movie'), true);
      assert.strictEqual(validateType('series'), true);
    });

    it('should reject invalid types', () => {
      assert.strictEqual(validateType(''), false);
      assert.strictEqual(validateType('invalid'), false);
      assert.strictEqual(validateType(null), false);
      assert.strictEqual(validateType(undefined), false);
      assert.strictEqual(validateType(123), false);
    });
  });

  describe('validateGenre', () => {
    it('should accept valid genres', () => {
      assert.strictEqual(validateGenre('Action'), true);
      assert.strictEqual(validateGenre('Drama'), true);
      assert.strictEqual(validateGenre('Science Fiction'), true);
    });

    it('should reject invalid genres', () => {
      assert.strictEqual(validateGenre(''), false);
      assert.strictEqual(validateGenre('NotAGenre'), false);
      assert.strictEqual(validateGenre(null), false);
      assert.strictEqual(validateGenre(undefined), false);
      assert.strictEqual(validateGenre(123), false);
    });

    it('should be case-sensitive', () => {
      assert.strictEqual(validateGenre('action'), false); // lowercase
      assert.strictEqual(validateGenre('ACTION'), false); // uppercase
    });
  });

  describe('validateYear', () => {
    it('should accept valid single year', () => {
      const result = validateYear('2023');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.min, 2023);
      assert.strictEqual(result.max, 2023);
    });

    it('should reject single year outside range', () => {
      assert.strictEqual(validateYear('1899').valid, false);
      assert.strictEqual(validateYear('2100').valid, false);
    });

    it('should accept valid year range', () => {
      const result = validateYear('2020-2023');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.min, 2020);
      assert.strictEqual(result.max, 2023);
    });

    it('should reject invalid year range', () => {
      assert.strictEqual(validateYear('2023-2020').valid, false); // min > max
      assert.strictEqual(validateYear('1899-2020').valid, false); // min out of range
      assert.strictEqual(validateYear('2020-2100').valid, false); // max out of range
    });

    it('should reject malformed year strings', () => {
      assert.strictEqual(validateYear('').valid, false);
      assert.strictEqual(validateYear('2023-').valid, false);
      assert.strictEqual(validateYear('2023-2020-2021').valid, false);
      assert.strictEqual(validateYear('abc').valid, false);
      assert.strictEqual(validateYear(null).valid, false);
      assert.strictEqual(validateYear(undefined).valid, false);
      assert.strictEqual(validateYear(2023).valid, false); // number
    });
  });

  describe('validateSort', () => {
    it('should accept valid sort options', () => {
      assert.strictEqual(validateSort('added'), true);
      assert.strictEqual(validateSort('year_desc'), true);
      assert.strictEqual(validateSort('year_asc'), true);
      assert.strictEqual(validateSort('name_asc'), true);
      assert.strictEqual(validateSort('rating_desc'), true);
    });

    it('should reject invalid sort options', () => {
      assert.strictEqual(validateSort(''), false);
      assert.strictEqual(validateSort('invalid'), false);
      assert.strictEqual(validateSort(null), false);
      assert.strictEqual(validateSort(undefined), false);
      assert.strictEqual(validateSort(123), false);
    });
  });

  describe('validateImdbId', () => {
    it('should accept valid IMDB IDs', () => {
      assert.strictEqual(validateImdbId('tt1234567'), true);
      assert.strictEqual(validateImdbId('tt12345678'), true);
      assert.strictEqual(validateImdbId('tt123456789'), true);
      assert.strictEqual(validateImdbId('tt1234567890'), true);
    });

    it('should reject invalid IMDB IDs', () => {
      assert.strictEqual(validateImdbId(''), false);
      assert.strictEqual(validateImdbId('tt123'), false); // too short
      assert.strictEqual(validateImdbId('tt12345678901'), false); // too long
      assert.strictEqual(validateImdbId('tt123456'), false); // 6 digits
      assert.strictEqual(validateImdbId('ttabcdefg'), false); // non-digits
      assert.strictEqual(validateImdbId('imdb1234567'), false); // missing tt
      assert.strictEqual(validateImdbId(null), false);
      assert.strictEqual(validateImdbId(undefined), false);
      assert.strictEqual(validateImdbId(123), false);
    });
  });

  describe('validateRdId', () => {
    it('should accept valid RD IDs', () => {
      assert.strictEqual(validateRdId('ABC123'), true);
      assert.strictEqual(validateRdId('abc123'), true);
      assert.strictEqual(validateRdId('12345'), true);
      assert.strictEqual(validateRdId('a'.repeat(50)), true); // max length
    });

    it('should reject invalid RD IDs', () => {
      assert.strictEqual(validateRdId(''), false);
      assert.strictEqual(validateRdId('1234'), false); // too short
      assert.strictEqual(validateRdId('a'.repeat(51)), false); // too long
      assert.strictEqual(validateRdId('abc/123'), false); // slash
      assert.strictEqual(validateRdId('abc\\123'), false); // backslash
      assert.strictEqual(validateRdId('abc.123'), false); // dot
      assert.strictEqual(validateRdId('abc 123'), false); // space
      assert.strictEqual(validateRdId('abc-123'), false); // hyphen (not in regex)
      assert.strictEqual(validateRdId(null), false);
      assert.strictEqual(validateRdId(undefined), false);
      assert.strictEqual(validateRdId(123), false);
    });
  });

  describe('validateMagnet', () => {
    it('should accept valid magnet URIs', () => {
      // Hex info hash (40 hex characters)
      assert.strictEqual(validateMagnet('magnet:?xt=urn:btih:abc123def4567890abc123def4567890abc12345'), true);
      // Base32 info hash (32 base32 characters: a-z2-7)
      assert.strictEqual(validateMagnet('magnet:?xt=urn:btih:abcd234567abcd234567abcd234567ab'), true);
    });

    it('should reject invalid magnet URIs', () => {
      assert.strictEqual(validateMagnet(''), false);
      assert.strictEqual(validateMagnet('magnet:'), false); // missing ?
      assert.strictEqual(validateMagnet('magnet:?'), false); // missing xt
      assert.strictEqual(validateMagnet('magnet:?xt=urn:btih:'), false); // empty hash
      assert.strictEqual(validateMagnet('magnet:?xt=urn:btih:abc123'), false); // too short
      assert.strictEqual(validateMagnet('magnet:?xt=urn:btih:abc123def4567890abc123def4567890abc123456'), false); // too long
      assert.strictEqual(validateMagnet('magnet:?xt=urn:btih:abc123def4567890abc123def4567890abc1234g'), false); // invalid hex char
      assert.strictEqual(validateMagnet('magnet:?xt=urn:btih:abc123def4567890abc123def4567890abc1234!'), false); // invalid base32 char
      assert.strictEqual(validateMagnet(null), false);
      assert.strictEqual(validateMagnet(undefined), false);
      assert.strictEqual(validateMagnet(123), false);
    });
  });

  describe('validateLink', () => {
    it('should accept valid links', () => {
      assert.strictEqual(validateLink('https://real-debrid.com/d/abc123'), true);
      assert.strictEqual(validateLink('http://example.com/file.mp4'), true);
    });

    it('should reject invalid links', () => {
      assert.strictEqual(validateLink(''), false);
      assert.strictEqual(validateLink('ftp://example.com/file'), false); // wrong protocol
      assert.strictEqual(validateLink('http://localhost/file'), false); // private IP
      assert.strictEqual(validateLink('http://127.0.0.1/file'), false);
      assert.strictEqual(validateLink('http://192.168.1.1/file'), false);
      assert.strictEqual(validateLink('http://10.0.0.1/file'), false);
      assert.strictEqual(validateLink('http://172.16.0.1/file'), false);
      assert.strictEqual(validateLink('http://169.254.0.1/file'), false);
      assert.strictEqual(validateLink('http://0.0.0.0/file'), false);
      assert.strictEqual(validateLink('http://user:pass@example.com/file'), false); // credentials
      assert.strictEqual(validateLink('not-a-url'), false);
      assert.strictEqual(validateLink(null), false);
      assert.strictEqual(validateLink(undefined), false);
      assert.strictEqual(validateLink(123), false);
    });
  });

  describe('validateStreamInfo', () => {
    it('should accept valid stream info', () => {
      const result = validateStreamInfo({ rdId: 'ABC123' });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should accept stream info with fileId', () => {
      const result = validateStreamInfo({ rdId: 'ABC123', fileId: 5 });
      assert.strictEqual(result.valid, true);
    });

    it('should reject missing rdId', () => {
      const result = validateStreamInfo({});
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid or missing rdId in stream info');
    });

    it('should reject invalid rdId type', () => {
      const result = validateStreamInfo({ rdId: 123 });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid or missing rdId in stream info');
    });

    it('should reject invalid fileId type', () => {
      const result = validateStreamInfo({ rdId: 'ABC123', fileId: 'five' });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid fileId in stream info');
    });

    it('should reject non-object input', () => {
      const result = validateStreamInfo(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid stream info');
      assert.strictEqual(validateStreamInfo('string').valid, false);
      assert.strictEqual(validateStreamInfo(123).valid, false);
    });
  });

  describe('validatePagination', () => {
    it('should normalize valid pagination', () => {
      const result = validatePagination(10, 50);
      assert.strictEqual(result.offset, 10);
      assert.strictEqual(result.limit, 50);
    });

    it('should handle string inputs', () => {
      const result = validatePagination('10', '50');
      assert.strictEqual(result.offset, 10);
      assert.strictEqual(result.limit, 50);
    });

    it('should clamp offset to minimum 0', () => {
      const result = validatePagination(-5, 10);
      assert.strictEqual(result.offset, 0);
    });

    it('should clamp limit to minimum 1', () => {
      const result = validatePagination(0, 0);
      assert.strictEqual(result.limit, 1);
    });

    it('should clamp limit to maximum 500', () => {
      const result = validatePagination(0, 1000);
      assert.strictEqual(result.limit, 500);
    });

    it('should handle invalid inputs', () => {
      const result = validatePagination('invalid', 'bad');
      assert.strictEqual(result.offset, 0);
      assert.strictEqual(result.limit, 100); // default limit when parseInt returns NaN
    });
  });

  describe('extractBaseId', () => {
    it('should extract base IMDB ID from composite', () => {
      assert.strictEqual(extractBaseId('tt1234567:1:2'), 'tt1234567');
      assert.strictEqual(extractBaseId('tt1234567'), 'tt1234567');
      assert.strictEqual(extractBaseId('tt1234567:'), 'tt1234567');
      assert.strictEqual(extractBaseId(''), '');
    });
  });

  describe('parseExtraParams', () => {
    it('should parse valid extra params', () => {
      const result = parseExtraParams('search=query&skip=20&genre=Action&sort=added&year=2023');
      assert.deepStrictEqual(result, {
        search: 'query',
        skip: '20',
        genre: 'Action',
        sort: 'added',
        year: '2023',
      });
    });

    it('should decode URL-encoded values', () => {
      const result = parseExtraParams('search=test%20query');
      assert.deepStrictEqual(result, { search: 'test query' });
    });

    it('should ignore unknown keys', () => {
      const result = parseExtraParams('search=query&unknown=value');
      assert.deepStrictEqual(result, { search: 'query' });
    });

    it('should ignore malformed parts', () => {
      const result = parseExtraParams('search=query&bad&skip=20');
      assert.deepStrictEqual(result, { search: 'query', skip: '20' });
    });

    it('should ignore excessively long keys/values', () => {
      const longKey = 'a'.repeat(51);
      const longValue = 'b'.repeat(501);
      const result = parseExtraParams(`${longKey}=value&search=short`);
      assert.deepStrictEqual(result, { search: 'short' });
    });

    it('should return empty object for invalid input', () => {
      assert.deepStrictEqual(parseExtraParams(''), {});
      assert.deepStrictEqual(parseExtraParams(null), {});
      assert.deepStrictEqual(parseExtraParams(undefined), {});
      assert.deepStrictEqual(parseExtraParams(123), {});
      assert.deepStrictEqual(parseExtraParams('a'.repeat(2001)), {});
    });
  });

  describe('validateProgressReport', () => {
    it('should accept valid movie progress report', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'movie',
        progressSeconds: 300,
        durationSeconds: 3600,
      });
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.data, {
        imdb_id: 'tt1234567',
        type: 'movie',
        season: null,
        episode: null,
        progress_seconds: 300,
        duration_seconds: 3600,
        percent_watched: 300 / 3600,
      });
    });

    it('should accept valid series progress report', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'series',
        season: 1,
        episode: 5,
        progressSeconds: 300,
        durationSeconds: 3600,
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.season, 1);
      assert.strictEqual(result.data.episode, 5);
    });

    it('should calculate percent_watched from progress/duration', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'movie',
        progressSeconds: 1800,
        durationSeconds: 3600,
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.percent_watched, 0.5);
    });

    it('should cap percent_watched at 1', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'movie',
        progressSeconds: 4000,
        durationSeconds: 3600,
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.percent_watched, 1);
    });

    it('should accept provided percent_watched', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'movie',
        progressSeconds: 300,
        percentWatched: 0.25,
      });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.percent_watched, 0.25);
    });

    it('should reject missing required fields', () => {
      assert.strictEqual(validateProgressReport({}).valid, false);
      assert.strictEqual(validateProgressReport({ imdbId: 'tt1234567' }).valid, false);
      assert.strictEqual(validateProgressReport({ imdbId: 'tt1234567', type: 'movie' }).valid, false);
    });

    it('should reject invalid IMDB ID', () => {
      const result = validateProgressReport({
        imdbId: 'invalid',
        type: 'movie',
        progressSeconds: 300,
      });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid IMDB ID format');
    });

    it('should reject invalid type', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'invalid',
        progressSeconds: 300,
      });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'type must be "movie" or "series"');
    });

    it('should reject invalid season/episode for series', () => {
      const result1 = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'series',
        season: 0,
        progressSeconds: 300,
      });
      assert.strictEqual(result1.valid, false);
      assert.strictEqual(result1.error, 'season must be a positive integer');

      const result2 = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'series',
        season: 1,
        episode: 0,
        progressSeconds: 300,
      });
      assert.strictEqual(result2.valid, false);
      assert.strictEqual(result2.error, 'episode must be a positive integer');
    });

    it('should reject invalid progressSeconds', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'movie',
        progressSeconds: -5,
      });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'progressSeconds must be a non-negative number');
    });

    it('should reject invalid durationSeconds', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'movie',
        progressSeconds: 300,
        durationSeconds: -5,
      });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'durationSeconds must be a positive number');
    });

    it('should reject invalid percentWatched', () => {
      const result = validateProgressReport({
        imdbId: 'tt1234567',
        type: 'movie',
        progressSeconds: 300,
        percentWatched: 1.5,
      });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'percentWatched must be between 0 and 1');
    });
  });

  describe('validateWatchHistoryQuery', () => {
    it('should accept valid query', () => {
      const result = validateWatchHistoryQuery({
        type: 'movie',
        completed: 'true',
        skip: '10',
        limit: '50',
      });
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.data, {
        type: 'movie',
        completed: true,
        skip: 10,
        limit: 50,
      });
    });

    it('should handle missing optional fields', () => {
      const result = validateWatchHistoryQuery({});
      assert.strictEqual(result.valid, true);
      assert.deepStrictEqual(result.data, {
        type: null,
        completed: null,
        skip: 0,
        limit: 100,
      });
    });

    it('should reject invalid type', () => {
      const result = validateWatchHistoryQuery({ type: 'invalid' });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'type must be "movie" or "series"');
    });

    it('should reject invalid completed value', () => {
      const result = validateWatchHistoryQuery({ completed: 'maybe' });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'completed must be "true" or "false"');
    });

    it('should normalize pagination', () => {
      const result = validateWatchHistoryQuery({ skip: '-5', limit: '1000' });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.data.skip, 0);
      assert.strictEqual(result.data.limit, 500);
    });
  });
});