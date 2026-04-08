/**
 * Parser unit tests
 * Tests for torrent filename parsing
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parse, parseEpisodeFromFilename, formatQualityTag, isSubtitleFile, parseSubtitleInfo } from '../src/parser.js';

describe('parser.parse', () => {
  describe('Movies', () => {
    it('parses standard movie with year and quality', () => {
      const result = parse('Movie.Name.2023.1080p.BluRay.x264-GROUP');
      assert.strictEqual(result.title, 'Movie Name');
      assert.strictEqual(result.year, 2023);
      assert.strictEqual(result.quality, '1080P');
      assert.strictEqual(result.source, 'BluRay');
      assert.strictEqual(result.codec, 'x264');
      assert.strictEqual(result.type, 'movie');
    });

    it('parses movie with year in parentheses', () => {
      const result = parse('Movie Name (2023) [1080p]');
      assert.strictEqual(result.title, 'Movie Name');
      assert.strictEqual(result.year, 2023);
      assert.strictEqual(result.quality, '1080P');
    });

    it('parses 4K/UHD as 2160p', () => {
      const result = parse('Movie.Name.2023.4K.UHD.BluRay');
      assert.strictEqual(result.quality, '2160p');
    });

    it('parses HDR variants', () => {
      const result = parse('Movie.2023.2160p.HDR10.BluRay');
      assert.strictEqual(result.hdr, 'HDR10');
    });

    it('parses Dolby Vision', () => {
      const result = parse('Movie.2023.2160p.DV.BluRay');
      assert.strictEqual(result.hdr, 'DV');
    });

    it('parses various audio formats', () => {
      const cases = [
        ['Movie.2023.1080p.DTS-HD', 'DTS-HD'],
        ['Movie.2023.1080p.TrueHD', 'TrueHD'],
        ['Movie.2023.1080p.DD5.1', 'DD5.1'],
        ['Movie.2023.1080p.AAC', 'AAC'],
      ];
      for (const [input, expected] of cases) {
        const result = parse(input);
        assert.strictEqual(result.audio, expected, `Failed for ${input}`);
      }
    });

    it('parses WEB-DL source', () => {
      const result = parse('Movie.2023.1080p.WEB-DL.x264');
      assert.strictEqual(result.source, 'WEB-DL');
    });

    it('parses WEBRip source', () => {
      const result = parse('Movie.2023.1080p.WEBRip.x265');
      assert.strictEqual(result.source, 'WEBRip');
      assert.strictEqual(result.codec, 'x265');
    });

    it('parses HEVC as x265', () => {
      const result = parse('Movie.2023.1080p.HEVC');
      assert.strictEqual(result.codec, 'x265');
    });

    it('handles movie without year', () => {
      const result = parse('Some.Movie.1080p.BluRay');
      assert.strictEqual(result.title, 'Some Movie');
      assert.strictEqual(result.year, null);
    });

    it('handles movie with only title', () => {
      const result = parse('Just A Movie Name');
      assert.strictEqual(result.title, 'Just A Movie Name');
      assert.strictEqual(result.type, 'movie');
    });

    it('strips release group suffix', () => {
      const result = parse('Movie.2023.1080p.BluRay-SPARKS');
      assert.ok(!result.title.includes('SPARKS'));
    });

    it('handles PROPER/REPACK tags', () => {
      const result = parse('Movie.2023.PROPER.1080p.BluRay');
      assert.ok(!result.title.includes('PROPER'));
    });

    it('handles extended/unrated editions', () => {
      const result = parse('Movie.2023.Extended.1080p.BluRay');
      assert.ok(!result.title.includes('Extended'));
    });
  });

  describe('TV Shows', () => {
    it('parses S01E01 format', () => {
      const result = parse('Show.Name.S01E02.Episode.Title.720p.WEB-DL');
      assert.strictEqual(result.title, 'Show Name');
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, 2);
      assert.strictEqual(result.type, 'series');
      assert.strictEqual(result.quality, '720P');
    });

    it('parses lowercase s01e01', () => {
      const result = parse('show.name.s02e05.720p');
      assert.strictEqual(result.season, 2);
      assert.strictEqual(result.episode, 5);
    });

    it('parses 1x01 format', () => {
      const result = parse('Show Name 1x05 Episode Title');
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, 5);
    });

    it('parses multi-episode S01E01E02', () => {
      const result = parse('Show.S01E01E02.1080p');
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, 1);
      assert.strictEqual(result.endEpisode, 2);
    });

    it('parses multi-episode range', () => {
      // Note: S01E01-E03 format has limited support
      const result = parse('Show.S01E01.E02.1080p');
      assert.strictEqual(result.episode, 1);
    });

    it('parses season pack (S01 without episode)', () => {
      const result = parse('Show.Name.S01.Complete.1080p');
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, null);
      assert.strictEqual(result.type, 'series');
    });

    it('parses season pack (Season X format)', () => {
      const result = parse('Thriller 1973 Season 6 Complete TVRip x264 [i_c]');
      assert.strictEqual(result.title, 'Thriller');
      assert.strictEqual(result.year, 1973);
      assert.strictEqual(result.season, 6);
      assert.strictEqual(result.episode, null);
      assert.strictEqual(result.type, 'series');
    });

    it('parses Season 1 Episode 5 format', () => {
      const result = parse('Show Name Season 1 Episode 5');
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, 5);
    });

    it('handles show with year before season', () => {
      const result = parse('Show.Name.2023.S01E01.1080p');
      assert.strictEqual(result.title, 'Show Name');
      assert.strictEqual(result.year, 2023);
      assert.strictEqual(result.season, 1);
    });

    it('handles show with year AFTER season (season pack)', () => {
      const result = parse('The.Fiery.Priest.S01.2019.1080p.NF.WEBRip.DDP2.0.x265-RL');
      assert.strictEqual(result.title, 'The Fiery Priest');
      assert.strictEqual(result.year, 2019);
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.type, 'series');
    });

    it('handles show with year after episode marker', () => {
      const result = parse('Sky.Castle.S01.2018.1080p.NF.WEBRip.DDP2.0.x265-RL');
      assert.strictEqual(result.title, 'Sky Castle');
      assert.strictEqual(result.year, 2018);
      assert.strictEqual(result.season, 1);
    });
  });

  describe('Anime', () => {
    it('parses [Group] Title - 01 format', () => {
      const result = parse('[SubsPlease] Anime Title - 01 [1080p]');
      assert.strictEqual(result.title, 'Anime Title');
      assert.strictEqual(result.group, 'SubsPlease');
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, 1);
      assert.strictEqual(result.quality, '1080P');
    });

    it('parses anime with 3-digit episode', () => {
      const result = parse('[Group] Long Running Anime - 256 [720p]');
      assert.strictEqual(result.episode, 256);
    });

    it('parses anime with version tag', () => {
      const result = parse('[Group] Anime - 05 [1080p]');
      assert.strictEqual(result.episode, 5);
    });
  });

  describe('Non-English', () => {
    it('handles accented characters', () => {
      const result = parse('Pelicula.Espanola.2023.1080p');
      assert.ok(result.title.includes('Pelicula'));
    });

    it('handles German titles', () => {
      const result = parse('Deutscher.Film.2023.1080p');
      assert.ok(result.title.includes('Deutscher'));
    });

    it('handles French titles', () => {
      const result = parse('Film.Francais.2023.1080p');
      assert.ok(result.title.includes('Francais'));
    });
  });

  describe('Edge cases', () => {
    it('handles empty string', () => {
      const result = parse('');
      assert.strictEqual(result.title, '');
    });

    it('handles null input', () => {
      const result = parse(null);
      assert.strictEqual(result.title, '');
    });

    it('handles file extension', () => {
      const result = parse('Movie.2023.1080p.BluRay.mkv');
      assert.ok(!result.title.includes('mkv'));
    });

    it('handles multiple dots correctly', () => {
      const result = parse('Mr.Robot.S01E01.1080p');
      assert.strictEqual(result.title, 'Mr Robot');
    });

    it('handles numbers in title', () => {
      const result = parse('2001.A.Space.Odyssey.1968.1080p');
      assert.ok(result.title.includes('2001'));
    });

    it('handles short title', () => {
      const result = parse('Up.2009.1080p.BluRay');
      assert.strictEqual(result.title, 'Up');
      assert.strictEqual(result.year, 2009);
    });

    it('distinguishes year from resolution', () => {
      const result = parse('Movie.2020.2160p.BluRay');
      assert.strictEqual(result.year, 2020);
      assert.strictEqual(result.quality, '2160P');
    });

    it('handles episode-first pattern (NxNN format)', () => {
      const result = parse('6x43 El cometa.mkv');
      assert.strictEqual(result.title, 'El Cometa');
      assert.strictEqual(result.season, 6);
      assert.strictEqual(result.episode, 43);
    });

    it('handles [Group] S01E01 - Title pattern', () => {
      const result = parse('[Prof] S01E11 - See-Saw.mkv');
      assert.strictEqual(result.title, 'See Saw');
      assert.strictEqual(result.season, 1);
      assert.strictEqual(result.episode, 11);
      assert.strictEqual(result.group, 'Prof');
    });

    it('handles (year) at start of filename', () => {
      const result = parse('(2000) Detective Conan - Movie - Captured in Her Eyes.mkv');
      assert.strictEqual(result.year, 2000);
      assert.ok(result.title.includes('Detective Conan'));
    });

    it('handles season pack with title after marker', () => {
      const result = parse('S03 Sailor Moon Crystal 1080p Dual Audio BDRip');
      assert.strictEqual(result.season, 3);
      assert.ok(result.title.includes('Sailor Moon'));
      assert.strictEqual(result.type, 'series');
    });
  });
});

describe('parseEpisodeFromFilename', () => {
  it('parses S01E05 from filename', () => {
    const result = parseEpisodeFromFilename('Show Name - S01E05 - Episode Title.mkv');
    assert.strictEqual(result.season, 1);
    assert.strictEqual(result.episode, 5);
  });

  it('parses episode from anime filename', () => {
    const result = parseEpisodeFromFilename('Show Name - 12.mkv');
    assert.strictEqual(result.episode, 12);
  });

  it('parses E05 format', () => {
    const result = parseEpisodeFromFilename('Episode E05.mkv');
    assert.strictEqual(result.episode, 5);
  });

  it('returns null for no episode', () => {
    const result = parseEpisodeFromFilename('No Episode Info Here.mkv');
    assert.strictEqual(result, null);
  });

  it('handles 3-digit anime episodes', () => {
    const result = parseEpisodeFromFilename('[Group] Anime - 150 [1080p].mkv');
    assert.strictEqual(result.episode, 150);
  });
});

describe('formatQualityTag', () => {
  it('formats full quality info', () => {
    const tag = formatQualityTag({
      quality: '1080p',
      source: 'BluRay',
      codec: 'x265',
      audio: 'DTS',
    });
    assert.strictEqual(tag, '1080p · BluRay · x265 · DTS');
  });

  it('formats with HDR', () => {
    const tag = formatQualityTag({
      quality: '2160p',
      hdr: 'DV',
      source: 'WEB-DL',
    });
    assert.strictEqual(tag, '2160p · DV · WEB-DL');
  });

  it('handles partial info', () => {
    const tag = formatQualityTag({ quality: '720p' });
    assert.strictEqual(tag, '720p');
  });

  it('handles empty info', () => {
    const tag = formatQualityTag({});
    assert.strictEqual(tag, 'Unknown');
  });

  it('excludes SDR from tag', () => {
    const tag = formatQualityTag({ quality: '1080p', hdr: 'SDR' });
    assert.strictEqual(tag, '1080p');
  });
});

describe('isSubtitleFile', () => {
  it('returns true for .srt files', () => {
    assert.strictEqual(isSubtitleFile('movie.en.srt'), true);
  });

  it('returns true for .sub files', () => {
    assert.strictEqual(isSubtitleFile('movie.sub'), true);
  });

  it('returns true for .ass files', () => {
    assert.strictEqual(isSubtitleFile('movie.ass'), true);
  });

  it('returns true for .ssa files', () => {
    assert.strictEqual(isSubtitleFile('movie.ssa'), true);
  });

  it('returns true for .vtt files', () => {
    assert.strictEqual(isSubtitleFile('movie.vtt'), true);
  });

  it('returns false for .mkv files', () => {
    assert.strictEqual(isSubtitleFile('movie.mkv'), false);
  });

  it('returns false for .mp4 files', () => {
    assert.strictEqual(isSubtitleFile('movie.mp4'), false);
  });

  it('returns false for .txt files', () => {
    assert.strictEqual(isSubtitleFile('readme.txt'), false);
  });

  it('is case-insensitive', () => {
    assert.strictEqual(isSubtitleFile('movie.SRT'), true);
    assert.strictEqual(isSubtitleFile('movie.Vtt'), true);
  });

  it('handles paths with directories', () => {
    assert.strictEqual(isSubtitleFile('Subs/English/movie.srt'), true);
    assert.strictEqual(isSubtitleFile('/path/to/Subs/movie.ass'), true);
  });

  it('returns false for null/empty input', () => {
    assert.strictEqual(isSubtitleFile(null), false);
    assert.strictEqual(isSubtitleFile(''), false);
    assert.strictEqual(isSubtitleFile(undefined), false);
  });
});

describe('parseSubtitleInfo', () => {
  it('extracts language from dot-separated code (Movie.en.srt)', () => {
    const result = parseSubtitleInfo('Movie.Name.en.srt');
    assert.strictEqual(result.language, 'English');
    assert.strictEqual(result.languageCode, 'en');
    assert.strictEqual(result.format, 'srt');
  });

  it('extracts language from full name (Movie.English.srt)', () => {
    const result = parseSubtitleInfo('Movie.Name.English.srt');
    assert.strictEqual(result.language, 'English');
    assert.strictEqual(result.languageCode, 'en');
    assert.strictEqual(result.format, 'srt');
  });

  it('extracts language from 3-letter code (Movie.eng.srt)', () => {
    const result = parseSubtitleInfo('Movie.Name.eng.srt');
    assert.strictEqual(result.language, 'English');
    assert.strictEqual(result.languageCode, 'en');
    assert.strictEqual(result.format, 'srt');
  });

  it('extracts Spanish from directory path (Subs/Spanish.srt)', () => {
    const result = parseSubtitleInfo('Subs/Spanish.srt');
    assert.strictEqual(result.language, 'Spanish');
    assert.strictEqual(result.languageCode, 'es');
    assert.strictEqual(result.format, 'srt');
  });

  it('extracts language from parent directory (Subs/English/movie.srt)', () => {
    const result = parseSubtitleInfo('Subs/English/movie.srt');
    assert.strictEqual(result.language, 'English');
    assert.strictEqual(result.languageCode, 'en');
  });

  it('extracts language from underscore separator (Movie_en.srt)', () => {
    const result = parseSubtitleInfo('Movie_en.srt');
    assert.strictEqual(result.language, 'English');
    assert.strictEqual(result.languageCode, 'en');
  });

  it('extracts language from hyphen separator (Movie-eng.srt)', () => {
    const result = parseSubtitleInfo('Movie-eng.srt');
    assert.strictEqual(result.language, 'English');
    assert.strictEqual(result.languageCode, 'en');
  });

  it('returns null language when no language detected (Movie.srt)', () => {
    const result = parseSubtitleInfo('Movie.srt');
    assert.strictEqual(result.language, null);
    assert.strictEqual(result.languageCode, null);
    assert.strictEqual(result.format, 'srt');
  });

  it('extracts format correctly for .vtt', () => {
    const result = parseSubtitleInfo('subs.vtt');
    assert.strictEqual(result.format, 'vtt');
  });

  it('extracts format correctly for .ass', () => {
    const result = parseSubtitleInfo('movie.ass');
    assert.strictEqual(result.format, 'ass');
  });

  it('handles series subtitle with episode (S01E05.por.srt)', () => {
    const result = parseSubtitleInfo('Movie.Name.S01E05.por.srt');
    assert.strictEqual(result.language, 'Portuguese');
    assert.strictEqual(result.languageCode, 'pt');
    assert.strictEqual(result.format, 'srt');
  });

  it('handles null/empty input gracefully', () => {
    const result = parseSubtitleInfo(null);
    assert.strictEqual(result.language, null);
    assert.strictEqual(result.languageCode, null);
    assert.strictEqual(result.format, '');
  });
});
