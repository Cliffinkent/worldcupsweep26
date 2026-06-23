# Departure Scene Deployment

## Pre-Merge Checks

Run these before merging PR #6:

- `npm run check:blob`
- `npm run check:departure-scene`
- `npm test`
- `npm run audit:eliminations`
- `npm run audit:bracket`
- `npm run check:api-football`
- `npm run smoke:departure-scene`

`npm run smoke:departure-scene` requires `VERCEL_PREVIEW_URL` in `.env`.
For protected Vercel previews, `VERCEL_PREVIEW_URL` may be a temporary Vercel share URL. Do not commit share URLs.

## Required Vercel Env Vars

- `BLOB_READ_WRITE_TOKEN`
- `OPENAI_API_KEY`
- `IMAGE_GENERATION_ENABLED`
- `ADMIN_RENDER_TOKEN`
- `DEPARTURE_SCENE_STYLE_VERSION`

Keep `IMAGE_GENERATION_ENABLED=false` until ready to manually generate the lounge image.

## Production Generation

1. Merge PR #6.
2. Deploy to production.
3. Set `IMAGE_GENERATION_ENABLED=true` only when ready.
4. Set `VERCEL_PROD_URL` and `ADMIN_RENDER_TOKEN` locally.
5. Run `npm run manual:generate-departure-scene`.
6. Confirm `/api/eliminated-teams` returns `generatedScene.status === "ready"`.
7. Confirm `/eliminated.html` shows the generated lounge and departure board images.

## Rollback

1. Set `IMAGE_GENERATION_ENABLED=false`.
2. The eliminated teams page falls back to the CSS/SVG lounge experience when generated images are not ready.
3. Existing Blob images can remain stored.

## Safety Rules

- `POST /api/refresh` must not generate images.
- `GET /api/eliminated-teams` must not generate images.
- `GET` routes must not upload departure scene assets to Blob.
- Only admin routes and explicit health/check scripts may write generated scene assets.
- The admin routes are `POST /api/admin/departure-scene/regenerate` and `POST /api/admin/departure-scene/generate-if-missing`.
- Do not expose `ADMIN_RENDER_TOKEN`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, or `API_FOOTBALL_KEY` in frontend code, logs, or API responses.
