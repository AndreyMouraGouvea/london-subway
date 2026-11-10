# Production deployment (2026-11-10)

Reference for the hosted environment. Never store access tokens, the database
password, `service_role` or the cron secret in this file or anywhere in the repo.

## Topology

| Component | Value |
|---|---|
| Repository | `https://github.com/AndreyMouraGouvea/london-subway` (branch `main`) |
| Frontend | GitHub Pages, workflow `.github/workflows/deploy-pages.yml` |
| Frontend URL | `https://andreyMouraGouvea.github.io/london-subway/` |
| Supabase project | `lgjwhvzejtcunhzsmalw` |
| Supabase region | `eu-west-2` (London) |
| Supabase org | `pijjouzoyhrxpgoayrdr` |
| API base | `https://lgjwhvzejtcunhzsmalw.supabase.co/functions/v1/api` |
| Auth site URL | `https://andreyMouraGouvea.github.io/london-subway/` |
| CORS origin | `https://andreymouragouvea.github.io` (lowercase, no path) |

The API stays on Supabase Edge Functions. Do not migrate it to Cloudflare
Workers: the entrypoint is Deno/Hono with a Supabase client and shared
`packages/api-core`.

## Current status (2026-11-10, end of day)

- Frontend live on GitHub Pages; verified in headless Edge: map renders, 20/20
  lines, 509 stations, 15 active alerts, "API LIGADA" and "TEMPO real".
- Edge Function deployed, `/health` returns `database: ok`.
- All 12 migrations + seed applied; production counts match the local baseline
  (see the table below).
- Supabase Cron scheduled and proven: `net._http_response` shows HTTP 200 from
  `public.ldt_cron_call('status')`.
- Auth: `site_url` and redirect list point at the Pages URL;
  `mailer_autoconfirm = true` (no SMTP), so sign-up completes instantly.
- One demo account exists in production (`demo@londondigitaltwin.app`, admin).
  Its password is intentionally **not** stored in the repo — reset it from the
  Supabase dashboard when needed.
- Two CORS defects were found and fixed in production: the allowlist must use a
  lowercase host, and the router now compares origins case-insensitively.

## Deploying

```bash
# Frontend (GitHub Pages): push to main and the workflow deploys.
git push origin main

# Backend (Edge Function): required after any change in packages/api-core,
# packages/shared or supabase/functions.
npm run supabase:deploy -- --no-verify-jwt

# Cron (only when the project or the cron secret changes).
# Execute scripts/setup-cron.sql with <PROJECT_REF> and <CRON_SECRET> replaced.
```

A frontend push does **not** redeploy the Edge Function, and a function deploy
does **not** publish the frontend. Both are needed for a full release.

## GitHub Pages

Deploy is handled by `.github/workflows/deploy-pages.yml` on every push to
`main` (or `workflow_dispatch`). Pages is already enabled with
**Settings → Pages → Source: GitHub Actions**; the workflow also passes
`enablement: true` to `configure-pages`, which only helps sessions whose token
has admin rights.

- Node 22.12.0, `npm ci`, `npm run build`.
- The site lives under `/london-subway/`, so the build sets
  `VITE_BASE_PATH=/london-subway/`. `vite.config.ts` maps it to `base`, and
  `main.tsx` derives the router `basename` from `import.meta.env.BASE_URL`.
- Runtime asset paths must be base-aware: the MapLibre worker
  (`${BASE_URL}maplibre-gl-worker.mjs`) and the boroughs GeoJSON
  (`${BASE_URL}london-boroughs.geojson`). Never hardcode a leading `/`.
- GitHub Pages has no rewrites: the workflow copies `index.html` to `404.html`
  so SPA deep links boot. It returns HTTP 404 for crawlers, which is acceptable
  here.
- GitHub Pages cannot set response headers, so the CSP lives in a
  `<meta http-equiv="Content-Security-Policy">` in `apps/web/index.html`.
  `frame-ancestors` is ignored in meta CSP.

Build variables (all public; repository variables can override the workflow
fallbacks):

```text
VITE_BASE_PATH=/london-subway/
VITE_API_BASE_URL=https://lgjwhvzejtcunhzsmalw.supabase.co/functions/v1/api
VITE_SUPABASE_URL=https://lgjwhvzejtcunhzsmalw.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key of the project>
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/dark
```

Cloudflare Pages remains a supported alternative: `wrangler.jsonc` points at
`apps/web/dist`, `_headers` carries the CSP and `_redirects` the SPA fallback.
There `VITE_BASE_PATH` must stay unset so the site is served from `/`.

## Edge Function secrets

Set with `npx supabase secrets set --project-ref lgjwhvzejtcunhzsmalw`:

| Secret | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Exact-match CORS allowlist (comma separated). |
| `LDT_CRON_SECRET` | Required header `x-cron-secret` on `/sync/*`. |
| `TFL_APP_KEY` | Optional; without it the TfL anonymous rate limit applies. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime.

CORS is exact-match, but host case is ignored: browsers send the `Origin` host
in lowercase, so configure `https://andreymouragouvea.github.io`. Cloudflare
preview URLs differ per deploy, so previews only work if a fixed branch alias is
added to `ALLOWED_ORIGINS`. `mailer_autoconfirm` is enabled (no SMTP), which
means sign-up completes immediately; configure SMTP and disable it before
treating the deployment as a real product.

## Supabase Cron

`scripts/setup-cron.sql` installs `pg_cron` + `pg_net`, stores
`ldt_project_url` and `ldt_cron_secret` in Vault, creates
`public.ldt_cron_call(text)` and schedules:

| Job | Schedule | Endpoint |
|---|---|---|
| `ldt-sync-status` | `*/2 * * * *` | `/api/sync/status` |
| `ldt-sync-disruptions` | `*/5 * * * *` | `/api/sync/disruptions` |
| `ldt-sync-reference` | `15 3 * * *` | `/api/sync/reference` |
| `ldt-sync-cleanup` | `45 3 * * *` | `/api/sync/cleanup` |

Run it through the Management API (`POST /v1/projects/<ref>/database/query`) or
the SQL editor, after replacing `<PROJECT_REF>` and `<CRON_SECRET>`.
`vault.secrets` is not readable by `postgres`; use `vault.decrypted_secrets`,
`vault.create_secret` and `vault.update_secret`.

## Reproducing production data

Reference data comes from `POST /api/sync/reference`. Historical datasets come
from the local ingestor pointed at production:

```powershell
$env:SUPABASE_URL="https://lgjwhvzejtcunhzsmalw.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role>"
$env:LOCAL_SUPABASE_URL=$env:SUPABASE_URL
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY=$env:SUPABASE_SERVICE_ROLE_KEY
npm run ingest:all
```

The `LOCAL_*` aliases must be overridden too: `.env.local` defines them for
`supabase functions serve` and they take precedence over `SUPABASE_*` in the
ingestor.

Validated production counts (2026-11-10):

| Metric | Value |
|---|---|
| lines | 20 |
| stations | 509 |
| line_stations | 705 |
| daily footfall (`station_traffic_snapshots`, `granularity = 'daily'`) | 286,190 |
| annual station counts (`granularity = 'annual'`) | 428 stations |
| NUMBAT (`line_annual_boardings`, `source_dataset = 'tfl-numbat'`) | 18 lines × 10 years = 180 rows |
| link flows (`station_crowding_profiles`, `kind = 'link_flow'`) | 22,680 |
| train loading (`kind = 'train_loading'`) | 57,453 |
| RODS (`kind = 'entry_exit'`) | 121,716 |

Note: footfall lives in `station_traffic_snapshots` (exposed through
`v_station_footfall_daily`), not in a `station_footfall_daily` table. Annual
counts are rows with `granularity = 'annual'` in the same table. RODS, link
flows and train loading share `station_crowding_profiles`, distinguished by
`kind`.

## Operations

- Verify `GET /api/health` → `checks.database = "ok"`.
- Recent jobs: `GET /api/jobs`; dataset freshness: `GET /api/data-health`.
- Cron results: `select id, status_code, left(content, 200), error_msg from net._http_response order by id desc limit 5;`
- Redeploy the function after backend changes: `npm run supabase:deploy -- --no-verify-jwt`.
- Revert to a previous function version from the Supabase dashboard if a deploy
  breaks production.
- Check the deployed frontend without a browser session:

```powershell
msedge --headless=new --disable-gpu --virtual-time-budget=20000 `
  --screenshot="$env:TEMP\ldt.png" "https://andreymouragouvea.github.io/london-subway/"
```

- Check the published bundle for a wrong or missing base path:

```powershell
$idx = curl.exe -s "https://andreymouragouvea.github.io/london-subway/"
$js = [regex]::Match($idx, 'src="([^"]+index-[^"]+\.js)"').Groups[1].Value
curl.exe -s "https://andreymouragouvea.github.io$js" | Select-String 'london-subway'
```

## Credential hygiene

- The Supabase access token and database password were shared in chat during
  setup; **rotate both** (Account → Access Tokens; Project Settings → Database →
  Reset password) and re-run `npx supabase link` locally afterwards.
- The `service_role` key must only exist in the local shell used for ingestion.
- The GitHub Actions build only receives the anon key (repository variables are
  optional; the workflow has public fallbacks).
- The demo account password is not in the repo. Rotate it or delete the account
  before opening registration to the public.
- The Git Credential Manager token stored on the workstation has `repo` and
  `workflow` scopes and admin rights on the repository. It was used to enable
  Pages; treat it as a local secret.
