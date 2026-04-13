# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.2.x   | :white_check_mark: |
| 1.1.x   | :white_check_mark: |
| < 1.1.0 | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT open a public issue for security vulnerabilities.**

Instead, send an email to: **swordfishtrumpet@example.com**

Include the following information:
- Description of the vulnerability
- Steps to reproduce (if applicable)
- Potential impact
- Suggested fix (if you have one)

### What to Expect

1. **Acknowledgment** — We'll confirm receipt within 48 hours
2. **Investigation** — We'll investigate and determine severity
3. **Fix Timeline** — We'll provide an estimated fix timeline
4. **Disclosure** — We'll coordinate public disclosure once fixed
5. **Credit** — We'll credit you in the release notes (unless you prefer anonymity)

## Security Best Practices

### When Running Debroxy

1. **Always use HTTPS** in production (via reverse proxy)
2. **Set a strong PROXY_TOKEN** (min 32 chars, random)
3. **Keep the token secret** — Anyone with the token can stream through your account
4. **Use TRUSTED_PROXIES** correctly to prevent IP spoofing
5. **Keep dependencies updated** — Run `npm audit` regularly

### For Contributors

1. Never commit sensitive data (API keys, tokens)
2. The `.env` file is in `.gitignore` — keep it that way
3. Use parameterized queries (already enforced in db.js)
4. Validate all user inputs (see `src/validators.js`)
5. Never expose stack traces in production (see `src/errors.js`)

## Known Security Considerations

### IP-Based Rate Limiting

The `req.ip` property is used for rate limiting and lockout decisions. This requires proper reverse proxy configuration to prevent spoofing. See FAQ.md for reverse proxy setup.

### Token Authentication

The PROXY_TOKEN is stored as an unsalted hash in memory for comparison. This is sufficient for the use case but means tokens cannot be recovered if forgotten.

### Database

SQLite database contains:
- RD torrent metadata (not sensitive)
- Watch history (privacy-sensitive)
- User settings (not sensitive)

No passwords or credentials are stored.

## Security Updates

Security fixes will be released as patch versions (e.g., 1.2.1). We recommend:
- Watching this repository for releases
- Enabling Dependabot alerts on your fork
- Running `npm audit` in your CI/CD

---

Thank you for helping keep Debroxy secure!
