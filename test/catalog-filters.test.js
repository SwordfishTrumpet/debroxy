/**
 * Tests for catalog filter functionality
 * Tests genre, year, and sort filters for Stremio catalogs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateGenre,
  validateYear,
  validateSort,
  parseExtraParams,
  VALID_GENRES,
  VALID_SORTS,
} from '../src/validators.js';
import * as stremio from '../src/stremio.js';

describe('Catalog Filters', () => {
  describe('Genre Validation', () => {
    it('accepts valid genres', () => {
      assert.strictEqual(validateGenre('Action'), true);
      assert.strictEqual(validateGenre('Comedy'), true);
      assert.strictEqual(validateGenre('Science Fiction'), true);
      assert.strictEqual(validateGenre('Drama'), true);
    });

    it('rejects invalid genres', () => {
      assert.strictEqual(validateGenre('Invalid'), false);
      assert.strictEqual(validateGenre('action'), false); // case-sensitive
      assert.strictEqual(validateGenre(''), false);
      assert.strictEqual(validateGenre(null), false);
      assert.strictEqual(validateGenre(undefined), false);
      assert.strictEqual(validateGenre(123), false);
    });

    it('VALID_GENRES contains expected genres', () => {
      assert.ok(VALID_GENRES.includes('Action'));
      assert.ok(VALID_GENRES.includes('Comedy'));
      assert.ok(VALID_GENRES.includes('Drama'));
      assert.ok(VALID_GENRES.includes('Horror'));
      assert.ok(VALID_GENRES.includes('Science Fiction'));
      assert.ok(VALID_GENRES.includes('Thriller'));
      assert.strictEqual(VALID_GENRES.length, 18);
    });
  });

  describe('Year Validation', () => {
    it('accepts valid single years', () => {
      const result2023 = validateYear('2023');
      assert.strictEqual(result2023.valid, true);
      assert.strictEqual(result2023.min, 2023);
      assert.strictEqual(result2023.max, 2023);

      const result1999 = validateYear('1999');
      assert.strictEqual(result1999.valid, true);
      assert.strictEqual(result1999.min, 1999);
      assert.strictEqual(result1999.max, 1999);

      const result1900 = validateYear('1900');
      assert.strictEqual(result1900.valid, true);
    });

    it('accepts valid year ranges', () => {
      const result = validateYear('2020-2023');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.min, 2020);
      assert.strictEqual(result.max, 2023);

      const sameYear = validateYear('2022-2022');
      assert.strictEqual(sameYear.valid, true);
      assert.strictEqual(sameYear.min, 2022);
      assert.strictEqual(sameYear.max, 2022);
    });

    it('rejects invalid years', () => {
      assert.strictEqual(validateYear('1800').valid, false); // too old
      assert.strictEqual(validateYear('2100').valid, false); // too far future
      assert.strictEqual(validateYear('abc').valid, false);
      assert.strictEqual(validateYear('').valid, false);
      assert.strictEqual(validateYear(null).valid, false);
      assert.strictEqual(validateYear(undefined).valid, false);
    });

    it('rejects invalid year ranges', () => {
      assert.strictEqual(validateYear('2023-2020').valid, false); // min > max
      assert.strictEqual(validateYear('1800-2023').valid, false); // min too old
      assert.strictEqual(validateYear('2020-2100').valid, false); // max too far
      assert.strictEqual(validateYear('2020-').valid, false);
      assert.strictEqual(validateYear('-2023').valid, false);
    });
  });

  describe('Sort Validation', () => {
    it('accepts valid sort options', () => {
      assert.strictEqual(validateSort('added'), true);
      assert.strictEqual(validateSort('year_desc'), true);
      assert.strictEqual(validateSort('year_asc'), true);
      assert.strictEqual(validateSort('name_asc'), true);
      assert.strictEqual(validateSort('rating_desc'), true);
    });

    it('rejects invalid sort options', () => {
      assert.strictEqual(validateSort('invalid'), false);
      assert.strictEqual(validateSort('ADDED'), false); // case-sensitive
      assert.strictEqual(validateSort(''), false);
      assert.strictEqual(validateSort(null), false);
      assert.strictEqual(validateSort(undefined), false);
    });

    it('VALID_SORTS contains all expected options', () => {
      assert.deepStrictEqual(VALID_SORTS, ['added', 'year_desc', 'year_asc', 'name_asc', 'rating_desc']);
    });
  });

  describe('parseExtraParams', () => {
    it('parses genre parameter', () => {
      const result = parseExtraParams('genre=Action');
      assert.strictEqual(result.genre, 'Action');
    });

    it('parses year parameter', () => {
      const result = parseExtraParams('year=2023');
      assert.strictEqual(result.year, '2023');

      const rangeResult = parseExtraParams('year=2020-2023');
      assert.strictEqual(rangeResult.year, '2020-2023');
    });

    it('parses sort parameter', () => {
      const result = parseExtraParams('sort=rating_desc');
      assert.strictEqual(result.sort, 'rating_desc');
    });

    it('parses combined parameters', () => {
      const result = parseExtraParams('genre=Action&year=2023&sort=year_desc&search=test');
      assert.strictEqual(result.genre, 'Action');
      assert.strictEqual(result.year, '2023');
      assert.strictEqual(result.sort, 'year_desc');
      assert.strictEqual(result.search, 'test');
    });

    it('handles URL-encoded values', () => {
      const result = parseExtraParams('genre=Science%20Fiction');
      assert.strictEqual(result.genre, 'Science Fiction');
    });

    it('ignores unknown keys', () => {
      const result = parseExtraParams('genre=Action&unknown=value&sort=added');
      assert.strictEqual(result.genre, 'Action');
      assert.strictEqual(result.sort, 'added');
      assert.strictEqual(result.unknown, undefined);
    });
  });

  describe('Manifest', () => {
    it('includes genre, year, and sort in catalog extras', () => {
      const manifest = stremio.getManifest();
      
      // Check movie catalog
      const movieCatalog = manifest.catalogs.find(c => c.id === 'debroxy-movies');
      assert.ok(movieCatalog, 'Movie catalog should exist');
      
      const movieExtraNames = movieCatalog.extra.map(e => e.name);
      assert.ok(movieExtraNames.includes('genre'), 'Should have genre extra');
      assert.ok(movieExtraNames.includes('year'), 'Should have year extra');
      assert.ok(movieExtraNames.includes('sort'), 'Should have sort extra');
      
      assert.ok(movieCatalog.extraSupported.includes('genre'), 'Should support genre');
      assert.ok(movieCatalog.extraSupported.includes('year'), 'Should support year');
      assert.ok(movieCatalog.extraSupported.includes('sort'), 'Should support sort');

      // Check genre has options
      const genreExtra = movieCatalog.extra.find(e => e.name === 'genre');
      assert.ok(genreExtra.options, 'Genre should have options');
      assert.ok(genreExtra.options.includes('Action'), 'Genre options should include Action');

      // Check sort has options
      const sortExtra = movieCatalog.extra.find(e => e.name === 'sort');
      assert.ok(sortExtra.options, 'Sort should have options');
      assert.deepStrictEqual(sortExtra.options, VALID_SORTS);

      // Check series catalog has same structure
      const seriesCatalog = manifest.catalogs.find(c => c.id === 'debroxy-series');
      assert.ok(seriesCatalog, 'Series catalog should exist');
      assert.ok(seriesCatalog.extraSupported.includes('genre'));
      assert.ok(seriesCatalog.extraSupported.includes('year'));
      assert.ok(seriesCatalog.extraSupported.includes('sort'));
    });
  });

  describe('handleCatalog', () => {
    it('handles catalog request with no filters', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', {});
      assert.ok(result.metas, 'Should return metas array');
      assert.ok(Array.isArray(result.metas), 'metas should be an array');
    });

    it('handles catalog request with genre filter', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', { genre: 'Action' });
      assert.ok(result.metas, 'Should return metas array');
    });

    it('handles catalog request with year filter', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', { year: '2023' });
      assert.ok(result.metas, 'Should return metas array');
    });

    it('handles catalog request with year range filter', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', { year: '2020-2023' });
      assert.ok(result.metas, 'Should return metas array');
    });

    it('handles catalog request with sort option', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', { sort: 'rating_desc' });
      assert.ok(result.metas, 'Should return metas array');
    });

    it('handles catalog request with combined filters', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', {
        genre: 'Action',
        year: '2020-2023',
        sort: 'year_desc',
        search: 'test',
      });
      assert.ok(result.metas, 'Should return metas array');
    });

    it('ignores invalid genre filter', () => {
      // Should not throw, just ignore invalid filter
      const result = stremio.handleCatalog('movie', 'debroxy-movies', { genre: 'InvalidGenre' });
      assert.ok(result.metas, 'Should return metas array');
    });

    it('ignores invalid year filter', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', { year: 'invalid' });
      assert.ok(result.metas, 'Should return metas array');
    });

    it('ignores invalid sort option and defaults to added', () => {
      const result = stremio.handleCatalog('movie', 'debroxy-movies', { sort: 'invalid' });
      assert.ok(result.metas, 'Should return metas array');
    });
  });
});
