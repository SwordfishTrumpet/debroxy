# Debroxy FAQ

Comprehensive technical documentation for Debroxy.

---

## Table of Contents

- [Architecture](#architecture)
- [Configuration Reference](#configuration-reference)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Development](#development)

---

## Architecture

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    DEBROXY                              │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │   Library    │    │   Stremio    │    │  Stream  │  │
│  │   Manager    │───▶│    Addon     │───▶│  Proxy   │  │
│  │              │    │              │    │          │  │
│  │ • Syncs RD   │    │ • Catalog    │    │ • Range  │  │
│  │ • Parses     │    │ • Search     │    │ • Conc.  │  │
│  │ • Matches    │    │ • Metadata   │    │ • Cache  │  │
│  └──────────────┘    └──────────────┘    └──────────┘  │
│         │                                      │        │
│         ▼                                      ▼        │
│     SQLite DB                           Real-Debrid    │
│  (local metadata)                        (streams)     │
└─────────────────────────────────────────────────────────┘
```

1. **Sync** — Every 15 minutes, Debroxy fetches your RD torrent list
2. **Parse** — Extracts title, year, quality from filenames
3. **Match** — Looks up metadata (poster, description) via Cinemeta/IMDB
4. **Serve** — Exposes Stremio-compatible endpoints for browsing
5. **Proxy** — Streams video through your server, hiding your real location

### Sync Process

**Initial Sync:**
- Runs on first startup
- Fetches all torrents from RD (paginated)
- Parses each filename, matches to IMDB via Cinemeta
- Stores metadata in SQLite
- Resumable — saves progress if interrupted

**Incremental Sync:**
- Runs every `SYNC_INTERVAL_MIN` minutes (default: 15)
- Fetches current RD torrent list
- Adds new torrents not in local DB
- Removes torrents deleted from RD
- Cleans up orphaned titles

**Sync Lock:**
- Atomic lock prevents concurrent syncs
- If sync is running, new requests are skipped

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `RD_API_KEY` | ✅ | — | Your [Real-Debrid API key](https://real-debrid.com/apitoken) |
| `EXTERNAL_URL` | ✅ | — | Public URL where Debroxy is accessible (e.g., `https://debroxy.example.com`) |
| `PROXY_TOKEN` | | — | Auth token for all endpoints (**min 32 characters**). If not set, auth is **disabled**. |
| `PORT` | | `8888` | Server port |
| `MAX_CONCURRENT_STREAMS` | | `3` | Max simultaneous proxy streams (RD has download limits) |
| `DB_PATH` | | `./data/debroxy.db` | SQLite database file location |
| `SYNC_INTERVAL_MIN` | | `15` | How often to sync with Real-Debrid (minutes) |
| `LOG_LEVEL` | | `info` | Logging verbosity: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |
| `MIN_STREAM_QUALITY` | | — | Minimum stream quality to show: `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |
| `TRUSTED_PROXIES` | | `127.0.0.1,::1` | Comma-separated IPs of trusted reverse proxies (for correct client IP detection) |
| `ENABLE_METRICS` | | `true` | Enable Prometheus metrics endpoint (`/:token/metrics`) |
| `NODE_ENV` | | — | Set to `production` for HTTPS enforcement and security hardening |

### Advanced Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CINEMETA_QUEUE_SIZE` | `1000` | Max Cinemeta API queue size |
| `CINEMETA_MAX_RETRIES` | `3` | Max retries for Cinemeta rate limiting |
| `MAX_SYNC_ITERATIONS` | `10000` | Safety limit for sync loops |
| `DB_MAX_RETRIES` | `5` | Database connection retry attempts |
| `WATCH_COMPLETION_THRESHOLD` | `0.90` | Percentage (0.5-0.99) at which items are marked as "completed" in watch history |

### PROXY_TOKEN: When to Use It

| | **Without PROXY_TOKEN** | **With PROXY_TOKEN** |
|---|---|---|
| **Setup** | Simpler — just add the addon URL to Stremio | Requires token in addon URL |
| **Security** | Anyone with network access can use your RD account | Only users with the token can access |
| **Best for** | Home LAN, VPN-only access, trusted networks | Public internet, shared servers, cloud deployments |
| **Risk** | Open proxy if exposed to internet | Token leakage grants full access |

**Recommendation:**
- **Home server behind firewall/VPN?** Skip the token — simpler setup, no security loss.
- **Exposed to the internet?** Always set a token. Generate one with: `openssl rand -hex 32`

> ⚠️ **Important:** Without a token, anyone who can reach your server can stream through your Real-Debrid account. This could get your RD account flagged for multi-IP usage — the exact problem Debroxy is designed to solve.

### Example Configurations

**Minimal (no auth, trusted network only):**
```env
RD_API_KEY=your_real_debrid_api_key_here
EXTERNAL_URL=https://debroxy.yourdomain.com
```

**Recommended (with auth):**
```env
# Required
RD_API_KEY=your_real_debrid_api_key_here
EXTERNAL_URL=https://debroxy.yourdomain.com

# Authentication (highly recommended for internet-exposed deployments)
PROXY_TOKEN=a1b2c3d4e5f6...  # Generate: openssl rand -hex 32

# Optional tuning
PORT=8888
MAX_CONCURRENT_STREAMS=3
DB_PATH=./data/debroxy.db
SYNC_INTERVAL_MIN=15
LOG_LEVEL=info

# Reverse proxy configuration (if behind nginx/Caddy/Traefik)
TRUSTED_PROXIES=127.0.0.1,::1

# Prometheus metrics (enabled by default)
ENABLE_METRICS=true

# Production mode (enforces HTTPS for EXTERNAL_URL)
NODE_ENV=production
```

---

## Reverse Proxy Setup

### Caddy (easiest)

```caddyfile
debroxy.yourdomain.com {
    reverse_proxy localhost:8888
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name debroxy.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8888;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Required for streaming
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
    }
}
```

### Traefik (Docker labels)

```yaml
# Add to your docker-compose.yml
services:
  debroxy:
    # ... existing config ...
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.debroxy.rule=Host(`debroxy.yourdomain.com`)"
      - "traefik.http.routers.debroxy.entrypoints=websecure"
      - "traefik.http.routers.debroxy.tls.certresolver=letsencrypt"
      - "traefik.http.services.debroxy.loadbalancer.server.port=8888"
      # Disable buffering for streaming
      - "traefik.http.middlewares.debroxy-buffering.buffering.maxRequestBodyBytes=0"
      - "traefik.http.middlewares.debroxy-buffering.buffering.maxResponseBodyBytes=0"
      - "traefik.http.routers.debroxy.middlewares=debroxy-buffering"
```

Set `TRUSTED_PROXIES` to your Traefik container's IP address.

### systemd Service

`/etc/systemd/system/debroxy.service`:

```ini
[Unit]
Description=Debroxy
After=network.target

[Service]
Type=simple
User=debroxy
WorkingDirectory=/opt/debroxy
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now debroxy
```

---

## API Reference

### Authentication

When `PROXY_TOKEN` is set, include it in requests:

**Header:**
```bash
curl -H "Authorization: Bearer $TOKEN" https://debroxy.example.com/$TOKEN/api/library
```

**URL path:**
```bash
curl https://debroxy.example.com/$TOKEN/api/library
```

### Error Response Format

All error responses follow a consistent structure:

```json
{
  "error": "Human-readable error message",
  "error_code": "MACHINE_READABLE_CODE"
}
```

Common error codes:
| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid or missing auth token |
| `RATE_LIMITED` | Too many requests |
| `VALIDATION_ERROR` | Invalid input parameters |
| `NOT_FOUND` | Resource not found |
| `CIRCUIT_OPEN` | RD API temporarily unavailable |
| `STREAM_ERROR` | Error proxying stream |
| `INTERNAL_ERROR` | Unexpected server error |

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/health` | 1000 requests | 1 minute |
| All other endpoints | 100 requests | 1 minute |
| Failed auth attempts | 5 attempts | 1 hour lockout |

### Request Tracing

All requests include an `X-Request-ID` header in the response. You can also send your own `X-Request-ID` header for distributed tracing.

### Endpoints

#### Health Check (no auth required)

```
GET /health
```

Returns minimal status without auth, full stats with valid token.

**Minimal response:**
```json
{ "status": "ok" }
```

**Full response (authenticated):**
```json
{
  "status": "ok",
  "version": "1.1.0",
  "uptime": 3600,
  "database": "connected",
  "library": { "movies": 150, "series": 45, "torrents": 500, "unmatched": 12 },
  "streams": { "active": 1, "max": 3 }
}
```

#### Prometheus Metrics

```
GET /:token/metrics
```

Returns Prometheus-compatible metrics. Disable with `ENABLE_METRICS=false`.

Available metrics:
- `debroxy_http_requests_total` — HTTP request counter by method, route, status
- `debroxy_http_request_duration_seconds` — Request latency histogram
- `debroxy_library_items` — Library item counts by type
- `debroxy_library_sync_complete` — Whether initial sync is complete (0/1)
- `debroxy_library_last_sync_timestamp` — Unix timestamp of last sync
- `debroxy_active_streams` — Current number of active proxy streams

#### Stremio Addon Endpoints

When `PROXY_TOKEN` is set, all endpoints require the token in the path:

| Endpoint | Description |
|----------|-------------|
| `GET /:token/manifest.json` | Addon manifest |
| `GET /:token/catalog/:type/:id.json` | Browse catalog |
| `GET /:token/catalog/:type/:id/:extra.json` | Browse with filters (search, skip, genre) |
| `GET /:token/meta/:type/:id.json` | Item metadata |
| `GET /:token/stream/:type/:id.json` | Available streams |

When `PROXY_TOKEN` is **not set**, endpoints are available without a token:

| Endpoint | Description |
|----------|-------------|
| `GET /manifest.json` | Addon manifest |
| `GET /catalog/:type/:id.json` | Browse catalog |
| `GET /catalog/:type/:id/:extra.json` | Browse with filters |
| `GET /meta/:type/:id.json` | Item metadata |
| `GET /stream/:type/:id.json` | Available streams |

#### Management API — Library

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/:token/api/library` | GET | Get sync status and library stats |
| `/:token/api/library/resync` | POST | Force full resync (clears and rebuilds library) |
| `/:token/api/library/sync` | POST | Force immediate incremental sync |
| `/:token/api/library/unmatched` | GET | List unmatched torrents (`?skip=0&limit=100`) |

**Example: Library status**
```bash
curl -H "Authorization: Bearer $TOKEN" https://debroxy.example.com/$TOKEN/api/library
```
```json
{
  "isComplete": true,
  "lastSync": "2026-04-05T12:00:00.000Z",
  "movies": 150,
  "series": 45,
  "torrents": 500,
  "unmatched": 12
}
```

#### Management API — Real-Debrid

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/:token/api/user` | GET | Get RD account info |
| `/:token/api/torrents` | GET | List RD torrents (`?offset=0&limit=100`, max 500) |
| `/:token/api/torrents/:id` | GET | Get single torrent details |
| `/:token/api/magnet` | POST | Add magnet to RD (`{ "magnet": "magnet:?..." }`) |
| `/:token/api/unrestrict` | POST | Unrestrict a link (`{ "link": "https://..." }`) |
| `/:token/api/downloads` | GET | List RD downloads (`?offset=0&limit=100`, max 500) |

**Example: Add magnet**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"magnet":"magnet:?xt=urn:btih:..."}' \
  https://debroxy.example.com/$TOKEN/api/magnet
```

#### Management API — Streams

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/:token/api/streams` | GET | List active proxy streams |
| `/:token/proxy/stream` | GET | Proxy any RD URL (`?url=https://...`) |

**Example: Active streams**
```bash
curl -H "Authorization: Bearer $TOKEN" https://debroxy.example.com/$TOKEN/api/streams
```
```json
{
  "active": [
    { "id": "abc123", "filename": "Movie.2023.mkv", "started": "2026-04-05T12:00:00.000Z" }
  ],
  "max": 3
}
```

#### Management API — Watch History

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/:token/api/progress` | POST | Report watch progress (`{ "imdbId": "tt1234567", "type": "movie", "progressSeconds": 1800, "durationSeconds": 3600 }`) |
| `/:token/api/progress/:imdbId` | GET | Get progress for item (`?season=1&episode=2` for series) |
| `/:token/api/progress/:imdbId` | DELETE | Delete progress for item |
| `/:token/api/progress/:imdbId/complete` | POST | Mark item as manually completed |
| `/:token/api/history` | GET | Get watch history (`?type=movie&completed=false&skip=0&limit=50`) |
| `/:token/api/history/stats` | GET | Get watch statistics |

**Example: Report progress**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"imdbId":"tt1234567","type":"movie","progressSeconds":1800,"durationSeconds":3600}' \
  https://debroxy.example.com/$TOKEN/api/progress
```

**Example: Get watch history**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://debroxy.example.com/$TOKEN/api/history?limit=10"
```
```json
{
  "items": [
    {
      "imdb_id": "tt1234567",
      "type": "movie",
      "name": "Example Movie",
      "progress_seconds": 1800,
      "percent_watched": 0.5,
      "is_completed": 0,
      "last_watched_at": 1712581200000
    }
  ],
  "total": 42,
  "skip": 0,
  "limit": 10
}
```

**Example: Get watch stats**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://debroxy.example.com/$TOKEN/api/history/stats
```
```json
{
  "totalWatched": 42,
  "totalMovies": 30,
  "totalSeries": 12,
  "totalTimeMinutes": 2847,
  "avgCompletion": 0.73
}
```

---

## Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| No content in Stremio | Initial sync not complete | Wait for sync — check `GET /health` for progress |
| "Unauthorized" errors | Token mismatch or missing | Verify `PROXY_TOKEN` matches in URL and `.env` |
| 401 after correct token | IP lockout (5 failed attempts) | Wait 1 hour or restart server |
| 429 "Too many requests" | Rate limit exceeded | Wait 1 minute, reduce request frequency |
| "Circuit breaker open" | RD API issues | Wait 30 seconds for automatic recovery |
| Seeking/scrubbing broken | Range headers not forwarded | Ensure reverse proxy forwards `Range` headers |
| Wrong client IP in logs | Reverse proxy misconfigured | Set `TRUSTED_PROXIES` to your proxy's IP |
| Torrent not showing | Filename couldn't be parsed | Check `GET /:token/api/library/unmatched` |
| Streams buffer/stutter | Concurrency limit reached | Increase `MAX_CONCURRENT_STREAMS` or reduce active streams |
| "HTTPS required" error | Production mode enforces HTTPS | Set `EXTERNAL_URL` to `https://...` or use `NODE_ENV=development` |
| Prometheus metrics 404 | Metrics disabled | Set `ENABLE_METRICS=true` |

### Viewing Logs

**Docker:**
```bash
docker logs -f debroxy
```

**npm (pretty-printed):**
```bash
npm start | npx pino-pretty
```

**Debug mode (verbose):**
```bash
LOG_LEVEL=debug npm start | npx pino-pretty
```

### Force Library Rebuild

If sync is stuck or library is corrupted:

```bash
# Trigger full resync (clears sync state, rebuilds from scratch)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://debroxy.example.com/$TOKEN/api/library/resync

# Monitor progress
watch -n 5 'curl -s -H "Authorization: Bearer $TOKEN" \
  https://debroxy.example.com/$TOKEN/api/library | jq'
```

### Check Unmatched Torrents

Torrents that couldn't be matched to IMDB are stored separately:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://debroxy.example.com/$TOKEN/api/library/unmatched?limit=20"
```

Common reasons for unmatched torrents:
- `parse_failed` — Filename pattern not recognized
- `cinemeta_not_found` — No IMDB match found
- `low_score` — Match confidence too low

### Debugging "No Content in Stremio"

```
Stremio sees no content
        ↓
Check /health endpoint
        ↓
┌─────────────────┬─────────────────┐
│ library stats   │ library stats   │
│ all zero        │ has content     │
└────────┬────────┴────────┬────────┘
         ↓                 ↓
   Sync never ran    Check catalog endpoint
         ↓                 ↓
   Check sync_state   ┌────────┬────────┐
   Call resync        │ Empty  │ Has    │
                      │        │ items  │
                      └─┬──────┴────┬───┘
                        ↓           ↓
                 Check token    Check Stremio
                 auth           addon URL
                        ↓
                 Check type
                 mismatch
```

**Top reasons for empty library:**

| Rank | Issue | Diagnostic | Fix |
|------|-------|-----------|-----|
| 1 | Initial sync never ran | `isComplete: false` | Call `/api/library/resync` |
| 2 | All torrents unmatched | `unmatched` count equals total | Check parser/Cinemeta issues |
| 3 | Token auth failing | 401 errors in logs | Verify `PROXY_TOKEN` |
| 4 | Sync state corruption | `isComplete: true` but stats=0 | Call resync |
| 5 | Cinemeta API issues | Logs show rate limiting | Wait and retry |
| 6 | Parser failing | `reason: "parse_failed"` | Check filename patterns |
| 7 | Type mismatch | `SELECT DISTINCT type FROM titles` | Should be `movie`/`series` |
| 8 | Empty RD library | `/api/torrents` returns [] | Add torrents to RD |
| 9 | IP lockout | 429 errors after failed auth | Wait 1 hour or restart |
| 10 | External URL wrong | Streams don't play | Check `EXTERNAL_URL` env |

### Database Queries for Debugging

```bash
# Check sync state
sqlite3 data/debroxy.db "SELECT * FROM sync_state;"

# Check library composition
sqlite3 data/debroxy.db "
  SELECT 'movies:', COUNT(*) FROM titles WHERE type='movie';
  SELECT 'series:', COUNT(*) FROM titles WHERE type='series';
  SELECT 'torrents:', COUNT(*) FROM torrents;
  SELECT 'unmatched:', COUNT(*) FROM unmatched;
"

# Check why torrents are unmatched
sqlite3 data/debroxy.db "
  SELECT reason, COUNT(*) FROM unmatched GROUP BY reason;
"

# Check for orphaned titles (no linked torrents)
sqlite3 data/debroxy.db "
  SELECT t.imdb_id, t.name, COUNT(tr.rd_id) as torrent_count
  FROM titles t
  LEFT JOIN torrents tr ON tr.imdb_id = t.imdb_id
  GROUP BY t.imdb_id
  HAVING torrent_count = 0;
"

# Verify catalog query works
sqlite3 data/debroxy.db "
  SELECT t.imdb_id, t.name, COUNT(tr.rd_id) as torrent_count
  FROM titles t
  LEFT JOIN torrents tr ON tr.imdb_id = t.imdb_id
  WHERE t.type = 'movie'
  GROUP BY t.imdb_id
  ORDER BY t.added_at DESC
  LIMIT 5;
"
```

---

## Security

### Authentication

- **Token auth (optional)** — When `PROXY_TOKEN` is set, all endpoints require the token in the URL path (min 32 characters)
- **Brute-force protection** — 5 failed auth attempts trigger a 1-hour IP lockout
- **Constant-time comparison** — Token validation uses `crypto.timingSafeEqual()` to prevent timing attacks

### Stream Proxy Security

- **HTTPS only** — Proxy only allows HTTPS URLs from whitelisted RD domains
- **HTTPS enforcement** — In production mode (`NODE_ENV=production`), `EXTERNAL_URL` must use HTTPS
- **SSRF protection** — Private IP ranges blocked (10.x, 172.16.x, 192.168.x, 127.x, 169.254.x)
- **URL validation** — Only Real-Debrid domains are allowed for proxying

### General Security

- **Security headers** — Helmet.js provides CSP, referrer policy, and other security headers
- **No credential logging** — Tokens are hashed in logs; full tokens never appear
- **Rate limiting** — Applied to all endpoints to prevent abuse
- **Parameterized SQL** — All database queries use parameterized statements to prevent injection

### Circuit Breaker

Debroxy implements a circuit breaker pattern to protect against Real-Debrid API failures:

- **Closed** (normal): Requests pass through normally
- **Open** (failing): After 5 consecutive failures, the circuit opens for 30 seconds — requests fail fast with `CIRCUIT_OPEN` error
- **Half-open** (testing): After timeout, one request is allowed through to test recovery

This prevents cascading failures and allows the system to recover gracefully when RD has issues.

### Warnings

⚠️ **If using auth:** Keep your token secret. Anyone with it can access your library and stream through your connection.

⚠️ **If not using auth:** Only deploy on trusted networks. Anyone with network access can use your Real-Debrid account.

---

## Development

### Setup

```bash
git clone https://github.com/SwordfishTrumpet/debroxy.git
cd debroxy
npm install
```

### Commands

```bash
npm start       # Production start
npm run dev     # Development with auto-reload
npm test        # Run tests
npm run lint    # Check style
```

### Testing

Tests use Node.js built-in test runner:

```bash
npm test                    # Run all tests
npm test -- parser          # Run specific test file
npm test -- --watch        # Watch mode
```

### Project Structure

```
src/
├── server.js          # Express app entry point, middleware, lifecycle
├── config.js          # Environment config with validation
├── constants.js       # Timeout, version, and configuration constants
├── db.js              # SQLite schema, migrations, queries
├── realdebrid.js      # RD API client with retry & circuit breaker
├── library.js         # Library sync engine (RD → SQLite → Cinemeta)
├── stremio.js         # Stremio addon business logic
├── proxy.js           # Stream proxy with SSRF protection
├── parser.js          # Torrent filename parser
├── security.js        # Token auth, lockout, constant-time comparison
├── middleware.js       # asyncHandler, validation middleware
├── validators.js      # Input validation functions
├── errors.js          # Structured error codes & responses
├── metrics.js         # Prometheus metrics collection
├── logger.js          # Pino logger setup
├── configure.js       # HTML configuration page generator
├── circuit-breaker.js # Circuit breaker pattern for RD API
├── handlers/          # HTTP request handlers
│   ├── stremio.js     # Stremio addon handlers
│   ├── api.js         # Management API handlers
│   └── system.js      # Health & metrics handlers
└── routes/            # Route registration
    ├── stremio.js     # Stremio addon routes
    ├── api.js         # Management API routes
    └── system.js      # System routes
```

### Database Schema

Five tables in SQLite:

1. **titles** — Movie/series metadata (IMDB ID, name, poster, etc.)
2. **torrents** — RD torrent entries linked to titles
3. **torrent_files** — Individual files within torrents (for season packs)
4. **unmatched** — Torrents that couldn't be matched to IMDB
5. **sync_state** — Key-value store for sync progress

All queries use parameterized statements (`?` placeholders) to prevent SQL injection.

### Contributing

PRs welcome. Please include tests for new features.

---

## Comparison with Alternatives

### vs. Torrentio / MediaFusion / Comet

| | Debroxy | Scrapers (Torrentio, etc.) |
|---|---|---|
| **Purpose** | Browse your existing RD library | Search torrent sites, check RD cache |
| **Content source** | Your RD torrents | Live torrent indexers |
| **IP protection** | ✅ Proxy through your server | ❌ Direct to RD |
| **Setup complexity** | Simple (no indexers) | Complex (Jackett/Prowlarr) |
| **Best for** | Curated libraries | "Netflix-like" search-to-play |

### vs. Debrid Media Manager

| | Debroxy | DMM |
|---|---|---|
| **Primary function** | Stream to Stremio | Manage RD library (web UI) |
| **Stremio addon** | ✅ Full proxy | ⚠️ Basic, no proxy |
| **IP protection** | ✅ Yes | ❌ No |
| **Library management** | ❌ No | ✅ Yes |
| **Best combo** | DMM + Debroxy | — |

---

## License

MIT — do whatever you want.
