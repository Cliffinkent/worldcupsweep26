# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MVP web app for tracking a 2026 FIFA World Cup sweepstake. It pulls live tournament data from the API-Football provider (api-sports.io), maps it onto a fixed roster of 48 teams that have each been assigned to a sweepstake participant ("owner"), and serves group tables, fixtures, a knockout bracket, and a per-owner leaderboard. A vanilla-JS frontend renders everything.

## Commands

```bash
npm start              # run the server (server.js) on PORT (default 3000)
npm run dev            # run with node --watch for auto-restart on change
npm run check:api-football   # diagnostic CLI: probes provider endpoints, classifies auth/data failures
DEBUG=true npm run check:api-football   # include full error stack traces in the diagnostic
```

There is no test runner, linter, or build step configured. Requires Node >= 18 (relies on the global `fetch`).

Environment: copy `.env.example` to `.env` and set `API_FOOTBALL_KEY`. Without a key the app still runs but the provider layer returns empty data and reports `providerStatus: 'missing_api_key'`.

## Architecture

Request flow: `server.js` (Express + helmet/cors/rate-limit hardening) → `src/routes/api.js` (validation, per-route limiters) → `src/services/sweepstakeService.js` (orchestration) → `src/services/footballApiClient.js` (provider + cache). The frontend in `src/public/` is served statically and consumes the `/api/*` JSON endpoints.

### Service layer (the core)

- **`footballApiClient.js`** — the only thing that talks to API-Football. Fetches fixtures, standings, rounds, and live fixtures, then *normalises* each provider record into the app's internal shape (`normaliseFixture`, `normaliseStanding`, `normaliseRound`, `normaliseStatus`). Holds a module-level `state` object tracking provider health, rate-limit headers, and unmatched team names. Key resilience behaviour: `getResource()` caches each resource (60s TTL) and, on provider error, **falls back to the last successful data** (`lastSuccessfulData`) rather than failing the request. League is hardcoded to `1` / season `2026`.

- **`sweepstakeService.js`** — joins provider data with the local roster and produces the response objects for each route. Important logic:
  - `resolveGroupTables()` prefers the provider's own standings (`api_standings`) but only if they pass `hasCompleteProviderGroupTables()` (exactly 12 groups A–L, 4 teams each, all matched to owners). Otherwise it falls back to computing tables from finished fixtures via `tableCalculator` (`calculated_fixtures`). The chosen source is surfaced as `groupTableSource`.
  - `buildParticipantSummaries()` builds the per-owner leaderboard (total group points, teams still alive, best team, teams playing live today). Eliminations are derived from finished knockout fixtures.
  - `attachFixturesToBracket()` overlays provider knockout fixtures onto the fixed `knockoutSlots` scaffold positionally (slot index N gets the Nth fixture of that round).

- **`tableCalculator.js`** — pure group-table math from fixtures. Also owns **team name matching**: `buildTeamLookup`/`findTeamByName` normalise names (lowercase, strip accents/punctuation) and match against each team's `country`, `fifaName`, and `aliases`. This is how provider team names get reconciled with the local roster — when adding teams, populate `aliases` to cover provider naming variants.

- **`cacheService.js`** — trivial in-memory `Map` with TTL. Not shared across processes; state resets on restart.

### Data (`src/data/`)

- `sweepstakeTeams.js` — the source of truth: 48 teams, each with `id`, `group` (A–L), `owner`, `country`, `flag`, `fifaName`, and `aliases`. Owners and group assignments live only here.
- `knockoutSlots.js` — the static bracket scaffold (Round of 32 → Final) the provider fixtures are mapped onto.

### Status vocabulary

Provider statuses are mapped (`STATUS_MAP`) to four internal values: `scheduled`, `live`, `finished`, `unavailable` (plus `unknown`). Knockout rounds are a fixed set used in several places — keep the round-name strings consistent across `sweepstakeService.js`, `tableCalculator.js`, and `footballApiClient.js`'s `normaliseRound`.

## Notes

- `scripts/check-api-football.js` is a standalone diagnostic (uses `axios`, not the app's client). It writes redacted sample responses to `diagnostics/api-football/*.sample.json` (gitignored) and classifies failures as auth vs. account vs. World Cup-endpoint issues. Use it to debug provider connectivity without touching the server.
- Security posture is intentional: strict CSP (`scriptSrc: 'self'` — no inline scripts), CORS locked to localhost origins, request validation/sanitisation in `api.js`, and a stricter rate limit on `POST /api/refresh`. Preserve these when adding routes.
- API endpoints: `GET /api/{health,provider-status,sweepstake,groups,fixtures,bracket}` and `POST /api/refresh` (forces a provider refetch).
