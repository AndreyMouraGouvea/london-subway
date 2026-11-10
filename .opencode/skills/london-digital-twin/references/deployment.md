# Production deployment (2026-11-10)

Reference for the hosted environment. Never store access tokens, the database
password, `service_role` or the cron secret in this file or anywhere in the repo.

## Topology

| Component | Value |
|---|---|
| Repository | `https://github.com/AndreyMouraGouvea/london-subway` (branch `main`) |
| Frontend | Cloudflare Pages project `london-digital-twin` |
| Supabase project | `lgjwhvzejtcunhzsmalw` |
| Supabase region | `eu-west-2` (London) |
| Supabase org | `pijjouzoyhrxpgoayrdr` |
| API base | `https://lgjwhvzejtcunhzsmalw.supabase.co/functions/v1/api` |
| Auth site URL | `https://london-digital-twin.pages.dev` |

The API stays on Supabase Edge Functions. Do not migrate it to Cloudflare
Workers: the entrypoint is Deno/Hono with a Supabase client and shared
`packages/api-core`.

## Cloudflare Pages build settings

- Framework preset: none (Vite is invoked by the npm script).
- Build command: `npm run build`
- Output directory: `apps/web/dist`
- Root directory: `/`
- `NODE_VERSION=22.12.0` (also pinned in `.nvmrc`)

Build variables (all public):

```text
VITE_API_BASE_URL=https://lgjwhvzejtcunhzsmalw.supabase.co/functions/v1/api
VITE_SUPABASE_URL=https://lgjwhvzejtcunhzsmalw.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key of the project>
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/dark
```

`apps/web/public/_headers` (CSP) and `_redirects` (SPA fallback) are copied into
the build. The CSP already allows `https://*.supabase.co` and
`wss://*.supabase.co`, so no change is needed unless a custom Supabase domain is
used.

## Edge Function secrets

Set with `npx supabase secrets set --project-ref lgjwhvzejtcunhzsmalw`:

| Secret | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Exact-match CORS allowlist (comma separated). |
| `LDT_CRON_SECRET` | Required header `x-cron-secret` on `/sync/*`. |
| `TFL_APP_KEY` | Optional; without it the TfL anonymous rate limit applies. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime.

CORS is exact-match: every Cloudflare preview URL differs, so previews only work
if a fixed branch alias is added to `ALLOWED_ORIGINS`. `mailer_autoconfirm` is
enabled (no SMTP), which means sign-up completes immediately; configure SMTP and
disable it before treating the deployment as a real product.

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

## Credential hygiene

- The Supabase access token and database password were shared in chat; rotate
  both after the deployment is validated (Account → Access Tokens; Project
  Settings → Database → Reset password).
- The `service_role` key must only exist in the local shell used for ingestion.
- The Cloudflare Pages build only receives the anon key.
