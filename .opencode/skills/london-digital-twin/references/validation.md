# Validation checklist

## Quality gate

```bash
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run build
npm run edge:build
```

All must pass before reporting a phase complete.

## Local services

```bash
npx supabase start
npx supabase db reset
npm run supabase:serve
npm run dev
```

Expected:

- web: `http://localhost:5173`
- local API: `http://localhost:8787/health` → `database: ok`, `cache: ok`
- Edge Function: `http://127.0.0.1:54321/functions/v1/api/health`
- Supabase Studio: `http://127.0.0.1:54323`

## Sync

```bash
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/reference
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/status
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/disruptions
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/cleanup
```

Expected reference result (anonymous TfL):

- `status: success`, `warnings: []`
- `recordsRead ~1587`, `recordsUpserted ~2487`
- duration ~7–12 s

Without the secret: `401`.

## Database counts

```sql
select (select count(*) from public.lines) lines,
       (select count(*) from public.stations) stations,
       (select count(*) from public.line_stations) line_stations,
       (select count(*) from public.line_paths) line_paths,
       (select count(*) from public.disruptions where is_active) active_alerts;
```

Expected after reference:

- 20 lines
- 509 canonical stations
- 705 line_stations
- 20 line_paths
- alerts vary with TfL; overnight closures are included.

No stations with `stop_type in ('NaptanMetroPlatform','TransportInterchange')`.

## Endpoints

```bash
curl http://localhost:8787/network
curl http://localhost:8787/network/status
curl http://localhost:8787/lines
curl http://localhost:8787/lines/bakerloo
curl "http://localhost:8787/lines/bakerloo/route?direction=inbound"
curl http://localhost:8787/stations/940GZZLUOXC
curl "http://localhost:8787/stations/910GPADTON/arrivals?count=5"
curl http://localhost:8787/disruptions
curl "http://localhost:8787/disruptions?band=closure&scope=line"
curl http://localhost:8787/dashboard/summary
curl "http://localhost:8787/dashboard/history?hours=24"
curl http://localhost:8787/data-health
curl "http://localhost:8787/jobs?limit=5"
curl http://localhost:8787/analytics/network
curl "http://localhost:8787/analytics/scenarios?type=station_closure&id=940GZZLUOXC"
curl "http://localhost:8787/analytics/footfall/summary?days=30&limit=5"
curl "http://localhost:8787/analytics/footfall/stations/940GZZLUOXC?days=30"
curl "http://localhost:8787/analytics/annual/summary?limit=5"
curl http://localhost:8787/analytics/boardings
curl "http://localhost:8787/analytics/crowding/stations/940GZZLUOXC"
curl "http://localhost:8787/analytics/rods/stations/940GZZLUOXC?metric=boarders"
curl http://localhost:8787/sources
```

Check every response has `meta` and never a secret.

History sanity:

- `coverage.buckets >= 1` after a sync.
- For each `series` point, `normal + attention + severe + closure + unknown`
  equals `linesTotal` (hourly bucket uses the latest snapshot, not an average).
- `topDisruptedLines` only includes lines present in the line hourly table.
- `/data-health` retention matches 90 d snapshots / 30 d jobs / 48 h cache /
  24 h arrivals.

Arrivals cache:

1. First call → `live`.
2. Second call within 45 s → `cached`.

## RLS with anon key

```bash
curl "http://127.0.0.1:54321/rest/v1/lines?select=id&limit=1" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
```

- lines, stations, line_stations, v_line_paths_geojson → allowed.
- api_cache, data_sync_jobs → denied/empty.
- line_status_snapshots, disruptions, network_status_snapshots → allowed read
  (needed for Realtime RLS).
- network_status_hourly, line_status_hourly, v_sync_jobs_public and the Phase 4
  RPCs → `401` with the anon key.

Phase 4 RPC probes (all must be `401` with anon):

```bash
curl -i -X POST "http://127.0.0.1:54321/rest/v1/rpc/ldt_apply_retention" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" -d '{}'
# repeat for ldt_rollup_status_hourly, ldt_network_history,
# ldt_top_disrupted_lines and ldt_ensure_hourly_partitions
```

## Realtime

1. Open the dashboard and confirm the top bar shows `Tempo real`.
2. With the page open, run `POST /sync/disruptions`.
3. Within ~2 s, DevTools shows fresh requests to `/dashboard/summary`,
   `/dashboard/history` and `/data-health`, with no reload.
4. Stop Realtime (or leave Supabase configured but unreachable) → badge falls
   back to `Polling` and the 60 s refetch continues.

## Footfall and analytics

```bash
npm run footfall:dry -w @ldt/ingest
npm run ingest:footfall
npm run ingest:annual
npm run ingest:numbat
npm run ingest:crowding
npm run ingest:rods
```

Expected:

- `rowsRead` ~286k; dates 2025-01-01 → 2026-10-31.
- `rowsUnmatched = 0`; review `heuristicNames` (generic complex names).
- `stationCount` ~433; `aggregatedRows` ~286k.
- annual: 432 matched, 428 stations, ~2.92B entries+exits.
- NUMBAT: 18 lines, 180 observations, 2016–2025.
- crowding: 22,680 link-flow profiles + 57,453 train-loading profiles, 270
  stations, no unmatched NAPTANs.
- RODS: 121,716 profiles, 267 stations, no unmatched names.
- `/analytics/network`: 509 stations, 604 links, 59 transfers, 4 components,
  largest 506, 3 isolated tram stops.
- `/analytics/scenarios?type=station_closure&id=940GZZLUOXC`: 1 removed,
  6 links removed, largest 505, 3 outside largest.
- `/analytics/footfall/summary?days=30`: daily series and 433 stations.
- `/analytics/annual/summary`: top station Waterloo.
- `/analytics/boardings`: latest year 2025, 18 lines.
- `/analytics/crowding/stations/940GZZLUOXC`: 84 intervals.
- `/analytics/rods/stations/940GZZLUOXC?metric=boarders`: 84 intervals.
- UI `/analytics`: 8 charts, no console errors; switching scenario type/target,
  station selectors and RODS metric update the panels.
- Global font: computed `html` font-size is `18px`; no `text-[Npx]` classes remain
  (arbitrary text sizes are rem-based).

## Auth, account and admin

1. Local config (`supabase/config.toml`): `site_url = http://localhost:5173`,
   `enable_confirmations = false`. Sign up/sign in at `/account`; the `profiles`
   row is created by the trigger.
2. Favorites add/remove a line and a station; they persist across reload.
3. Subscriptions add a line, change threshold and browser toggle.
4. Promote a local user with service_role:
   `update public.profiles set is_admin = true where email = '...';`
   `/admin` shows sources/jobs for that user and “Sem permissão” for others.
5. RLS probes with anon: `profiles`, `user_favorites` and
   `user_alert_subscriptions` return `200 []` (RLS filters all rows), not `401`.
   Unauthenticated writes are rejected. An authenticated user sees only own rows.
6. `/report` renders and `Page.printToPDF` creates a non-empty PDF (~158 KB in the
   local run).
7. CCO “Boroughs (ONS)” toggles the layer; source has 33 features,
   `queryRenderedFeatures` returns boundary features and ONS attribution is
   visible.
8. Computed `html` font-size is `18px`; no `text-[Npx]` classes remain.

## CORS

```bash
curl -i -H "Origin: http://localhost:5173" http://localhost:8787/health
curl -i -H "Origin: http://evil.example" http://localhost:8787/health
```

- allowed → 200
- disallowed → 403 `origin_not_allowed`

## Common failures

| Symptom | Fix |
|---|---|
| `cron_not_configured` | Add `LDT_CRON_SECRET` to `.env.local`, restart `npm run supabase:serve`. |
| `/network` 503 | Run `sync-reference`. |
| Edge 404 | Function path includes `/api`; call `/functions/v1/api/health`. |
| Edge module not found | `npm run edge:build`; ensure `.ts` extensions. |
| `api_cache` cache error | Ensure `public.api_cache` exists and env aliases are set. |
| All lines closed | Real overnight TfL `Service Closed`. |
| Map blank / WebGL fallback | Use Chrome/a browser with WebGL2; some headless screenshot tools cannot render MapLibre. |
| TfL 429 | Set `TFL_APP_KEY`; reduce sync concurrency. |
| `/account` says “Autenticação não configurada” | Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the root `.env.local`; restart Vite. |
| `is_admin` stays false | Promote with service_role SQL; the client cannot write `profiles.is_admin`. |
| PDF is blank or dark | Print `/report`, not the map; keep the `@media print` rules in `index.css`. |
| Boroughs do not render | Enable “Boroughs (ONS)”; confirm `/london-boroughs.geojson` is served and the source is added on `style.load`. |

