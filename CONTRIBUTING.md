# Contributing to Debroxy

Thank you for your interest in contributing! This guide will help you get started.

## Quick Start

```bash
# Clone and install
git clone https://github.com/SwordfishTrumpet/debroxy.git
cd debroxy
npm install

# Copy environment
cp .env.example .env

# Run tests
npm test

# Run linter
npm run lint

# Start development server
npm run dev
```

## Development Workflow

1. **Fork the repository** and create a feature branch
2. **Make your changes** following our coding standards
3. **Write or update tests** for new functionality
4. **Run the test suite** (`npm test`)
5. **Update documentation** (README, FAQ, AGENTS.md)
6. **Submit a pull request** using our PR template

## Coding Standards

### ES Modules
- Always use `import`/`export` (native ES modules)
- Never use `require()` or `module.exports`
- Use `.js` extension in imports (e.g., `import { foo } from './bar.js'`)

### Code Style
- Use JSDoc for all functions and modules
- Follow the existing naming conventions (`camelCase` for functions)
- Keep modules focused (< 300 lines when possible)
- Use `async/await` over raw promises

### Error Handling
- Use structured error codes from `src/errors.js`
- Never leak stack traces in production
- Always handle errors in try/catch blocks

## Testing with ES Modules

ES modules cannot be easily mocked like CommonJS. Here's how we handle it:

### Option 1: Integration Testing (Preferred)
Test through the HTTP API using `supertest`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';

// Setup environment BEFORE imports
process.env.NODE_ENV = 'test';
process.env.PROXY_TOKEN = 'test-token-...';

const { default: app } = await import('../src/server.js');

describe('feature', () => {
  it('should work via API', async () => {
    const res = await request(app)
      .get('/test-token/catalog/movie/rd-movies.json')
      .expect(200);
    
    assert.strictEqual(res.body.metas.length, 10);
  });
});
```

### Option 2: Pure Function Testing
Extract logic that doesn't need mocking:

```javascript
// Good candidate for unit testing
import { parse } from '../src/parser.js';

describe('parser', () => {
  it('parses movie filename', () => {
    const result = parse('Movie.2023.1080p.BluRay.mkv');
    assert.strictEqual(result.year, 2023);
  });
});
```

### Option 3: Dependency Injection
For new code, accept dependencies as parameters:

```javascript
// Instead of importing dependencies at top level
export async function handleStream(deps, type, id, token) {
  const { db, rd, settings } = deps;
  // ... logic here
}
```

## Adding a Runtime-Configurable Setting

For settings that users can change via the configure page:

1. **Add to `src/settings.js`:**
   - Add key to `VALID_SETTINGS` array
   - Add validation rules to `VALIDATION` object
   - Add default to `DEFAULTS` object
   - Add metadata to `getMetadata()`

2. **Update database schema** in `src/db.js` if needed

3. **Use the setting** via `settings.get('key')` instead of `config.key`

4. **Add UI control** in `src/configure.js`

5. **Add tests** in `test/settings.test.js`

6. **Document** in README.md configuration table

## Adding a Database Migration

Modify `db.init()` in `src/db.js`. Use `ALTER TABLE` for existing tables:

```javascript
// Example migration
const migrations = [
  {
    version: 2,
    sql: `ALTER TABLE titles ADD COLUMN new_field TEXT;`
  }
];
```

Test with both fresh databases and existing ones.

## Common Tasks

### Adding a New Route
1. Add handler in `src/handlers/{category}.js`
2. Register in `src/routes/{category}.js`
3. Import and register in `src/server.js`
4. Add tests

### Adding a New API Endpoint
1. Add handler in `src/handlers/api.js`
2. Register in `src/routes/api.js`
3. Add integration tests

### Updating Documentation
- **README.md** — User-facing features and setup
- **FAQ.md** — Technical details and troubleshooting
- **AGENTS.md** — Developer-focused architecture and conventions
- **This file** — Contributor workflow (if it changes)

## Debugging

```bash
# Run with debug logging
LOG_LEVEL=debug npm run dev

# Trace level (very verbose)
LOG_LEVEL=trace npm run dev
```

## Questions?

- Open an issue with the `[QUESTION]` prefix
- Check the [FAQ](../FAQ.md) first
- Review existing code for patterns

## Code of Conduct

- Be respectful and constructive in all interactions
- Focus on what is best for the community and project
- Gracefully accept constructive criticism
- Show empathy towards other community members

Thank you for contributing!
