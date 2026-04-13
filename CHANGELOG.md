# Changelog

All notable changes to Debroxy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Added missing environment variables to `.env.example` (MIN_STREAM_QUALITY, PROXY_TOKEN, WATCH_COMPLETION_THRESHOLD, TRANSCODING_ENABLED, TRANSCODING_PREFER_HLS, TRANSCODING_CACHE_TTL)

## [1.2.0] - 2024

### Added
- Low bandwidth mode — Force 480p transcoding for slow connections
- Automatic transcoding support — Uses Real-Debrid's HLS transcoding
- Runtime user settings API — Adjust settings without restarting
- Configure page web dashboard — Manage settings via web UI
- Pattern-based catalog filtering — Filter by genre, year, sort

### Changed
- Improved stream limiting using runtime settings instead of config
- Enhanced configure page with better error handling

### Fixed
- Type inconsistencies in runtime settings
- Various UI improvements in configure page

## [1.1.0] - 2024

### Added
- Major refactoring with new architecture
- Circuit breaker pattern for RD API resilience
- Comprehensive test suite with 378 tests
- Database persistence for user settings
- Watch completion tracking with Continue Watching catalog
- Prometheus metrics endpoint
- Improved error handling with structured error codes

### Changed
- Refactored from single-file to modular architecture
- Migrated to ES modules
- Added Pino structured logging
- Improved Stremio addon manifest generation

### Fixed
- Memory leaks in sync process
- Race conditions in stream handling
- Various edge cases in torrent parsing

## [1.0.0] - 2024

### Added
- Initial release
- Real-Debrid library sync to Stremio
- HTTP stream proxy
- Basic torrent parsing and metadata matching
- SQLite database for local metadata
- Express server with authentication
- Docker support

---

## Version History

- **v1.2.0** — Low bandwidth mode, transcoding, configure page
- **v1.1.0** — Major refactoring, circuit breaker, tests, metrics
- **v1.0.0** — Initial release

## Future Roadmap

See [GitHub Issues](https://github.com/SwordfishTrumpet/debroxy/issues) for planned features and enhancements.
