# Debroxy

**Your Real-Debrid library. In Stremio. From anywhere.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://www.docker.com/)

---

## What It Does

Debroxy turns your Real-Debrid torrent collection into a beautiful, browsable streaming library inside Stremio — and lets you watch from any device without getting your RD account flagged.

```
📱 Phone (4G)  ──┐
💻 Work laptop ──┼──→  🏠 Debroxy (home)  ──→  Real-Debrid
📺 Hotel TV    ──┘         (one IP)
```

**The Problem:** Real-Debrid locks accounts to one IP. Stream from home, then from your phone on cellular? RD sees two IPs and may flag your account.

**The Solution:** Run Debroxy on your home server. All your devices stream through that single IP. RD sees one location. You get unlimited access.

---

## Why Debroxy?

- **Single IP to Real-Debrid** — All streams proxied through your server. No more account flags.
- **Stream from anywhere** — Phone, work laptop, hotel TV — RD only sees your home IP.
- **Your RD library in Stremio** — Auto-syncs every 15 minutes. Season packs handled.
- **Share without sharing credentials** — Family can stream through your server.
- **Handles 50,000+ torrents** — Optimized for large collections.

> **Note:** Debroxy streams your existing RD library — it doesn't add content. Use [DebridMediaManager](https://github.com/debridmediamanager/debrid-media-manager) to curate your collection.

---

## Quick Start

### Requirements
- A server/VPS with Docker (your home server, a cheap VPS, Raspberry Pi, etc.)
- Real-Debrid account
- Stremio app

### 1. Install

**Docker (recommended):**

```bash
git clone https://github.com/SwordfishTrumpet/debroxy.git
cd debroxy

# Copy and edit config
cp .env.example .env
nano .env  # Add your RD_API_KEY and EXTERNAL_URL

# Start
cd docker && docker-compose up -d
```

**Check it's running:**
```bash
curl http://localhost:8888/health
# Should return: {"status":"ok"}
```

### 2. Configure

Edit `.env`:

```env
# Required
RD_API_KEY=your_real_debrid_api_key_here
EXTERNAL_URL=https://debroxy.yourdomain.com

# Optional but recommended (generates your install URL)
PROXY_TOKEN=your_secure_token_here  # openssl rand -hex 32
```

Get your RD API key: https://real-debrid.com/apitoken

### 3. Connect Stremio

Check your install URL in the logs:
```bash
docker logs debroxy | grep "Stremio Install URL"
# → https://debroxy.yourdomain.com/YOUR_TOKEN/manifest.json
```

In Stremio:
1. **Settings → Addons → Install from URL**
2. Paste your install URL
3. Click install

Your library appears as **"RD Movies"** and **"RD Series"** catalogs.

---

## Works With Your Workflow

Debroxy is designed to complement **DebridMediaManager** (or any RD library tool):

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  DMM (web)      │────▶│  Real-Debrid    │────▶│  Debroxy        │
│  • Add torrents │     │  • Store files  │     │  • Stream       │
│  • Organize     │     │  • Cache        │     │  • Browse       │
│  • Manage       │     │                 │     │  • Protect IP   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌───────────────┐
                                                │   Stremio     │
                                                │   (anywhere)  │
                                                └───────────────┘
```

**You curate with DMM. You stream with Debroxy.**

---

## Configuration

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `RD_API_KEY` | ✅ | — | Your Real-Debrid API key |
| `EXTERNAL_URL` | ✅ | — | Public URL (e.g., `https://debroxy.example.com`) |
| `PROXY_TOKEN` | | — | Auth token (min 32 chars). If unset, auth is disabled. |
| `PORT` | | `8888` | Server port |
| `MAX_CONCURRENT_STREAMS` | | `3` | Max simultaneous streams |
| `SYNC_INTERVAL_MIN` | | `15` | Sync frequency with RD |
| `LOG_LEVEL` | | `info` | `trace`, `debug`, `info`, `warn`, `error` |

**Full options:** See [FAQ.md](FAQ.md#configuration-reference)

---

## Production Setup

Put Debroxy behind a reverse proxy with HTTPS:

**Caddy (easiest):**
```caddyfile
debroxy.yourdomain.com {
    reverse_proxy localhost:8888
}
```

**nginx:**
```nginx
server {
    listen 443 ssl;
    server_name debroxy.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:8888;
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

**Full configs:** See [FAQ.md](FAQ.md#reverse-proxy-setup)

---

## FAQ

**Q: Do I need a token?**

If your server is exposed to the internet: **Yes.** Generate one with `openssl rand -hex 32`. Anyone with your token can stream through your RD account.

If it's only accessible on your home network/VPN: You can skip it for simpler setup.

**Q: How long until new torrents appear?**

Within 15 minutes (configurable). Debroxy syncs automatically. You can also force sync via the API.

**Q: Can I use this with multiple debrid services?**

No — Debroxy is Real-Debrid only.

**Q: Does this scrape torrents?**

No. Debroxy only shows what you already have in your RD library. Use DMM, Jackett, or other tools to add torrents.

**Q: Why not just use DMM's Stremio addon?**

DMM's addon doesn't proxy streams — your client connects directly to RD, exposing your real IP. Debroxy proxies everything through your server.

**More questions:** See [FAQ.md](FAQ.md)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| No content in Stremio | Wait for initial sync (check `/health`). Force resync: `POST /api/library/resync` |
| "Unauthorized" errors | Verify `PROXY_TOKEN` matches in URL and `.env` |
| 401 after correct token | IP lockout — wait 1 hour or restart server |
| Seeking broken | Ensure reverse proxy forwards `Range` headers |
| Wrong client IP | Set `TRUSTED_PROXIES` to your proxy's IP |

**Full troubleshooting:** See [FAQ.md](FAQ.md#troubleshooting)

---

## License

MIT — do whatever you want.

---

<p align="center">
  <strong>Built for self-hosters who refuse to compromise.</strong>
</p>
