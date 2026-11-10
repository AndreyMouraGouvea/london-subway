---
name: London Digital Twin
description: Use for any work on the London Digital Twin project: TfL Unified API ingestion, Supabase schema/RLS/Realtime/Auth, React CCO with MapLibre, realtime history/dashboard, analytics (footfall/annual/NUMBAT/crowding/RODS/scenarios), account/favorites/alerts, PDF reports and GIS boroughs (Phases 0–6), data-integrity rules, exports, and maintenance.
---

# London Digital Twin

Operational digital twin of London's metro/rail network using TfL open data.
The map is the primary surface; the frontend consumes only the project API and
never calls TfL directly.

## Current scope

- **Project status (2026-11-10):** Phase 6 delivered and **live in production**
  (GitHub Pages + Supabase `lgjwhvzejtcunhzsmalw`, `eu-west-2`); the project is
  in maintenance.
  New expansions require an explicit request.
- **Production:** frontend on GitHub Pages
  (`https://andreymouragouvea.github.io/london-subway/`, deployed by GitHub
  Actions), API on the Supabase Edge Function `api`
  (`https://lgjwhvzejtcunhzsmalw.supabase.co/functions/v1/api`), data refreshed by
  Supabase Cron. See `references/deployment.md`.
- **Delivered:** Phase 0–6 — ingestion/history/realtime, CCO map, analytics,
  RODS, auth, favorites, personalized alerts, read-only admin, printable PDF and
  ONS boroughs.
- **Deferred / no source:** PTAL, travel times/frequencies, and the 3 tram stops
  omitted by TfL's Regular sequence. Do not invent them.
- Preserve the Phase 4 acceptance criteria when changing the project: a new
  snapshot must refresh the UI, and a TfL failure must not break the UI.
- Phase 5/6 acceptance: assumptions visible, historical/derived/scenario labels,
  no claim of real-time occupancy or travel times, RLS on user data.
- Prefer maintenance, correctness and documentation over new scope.

## Read first

1. `README.md` — current state, commands, endpoints.
2. `docs/architecture.md` — components, security, sync flow.
3. `docs/data-sources.md` — validated TfL endpoints and corrections.
4. `docs/roadmap.md` — delivered phases and deferred scope.
5. `references/data-contracts.md` — API envelope, key types, endpoint shapes.
6. `references/phase-3-map.md` — map/panel implementation guide.
7. `references/phase-4-realtime.md` — realtime, hourly aggregates, retention and
   validation recipe.
8. `references/phase-5-analytics.md` — footfall ingestion, graph, scenarios and
   known gaps.
9. `references/phase-6-product.md` — auth, RLS, favorites, alerts, admin, PDF and
   boroughs.
10. `references/validation.md` — commands and checks.
11. `references/deployment.md` — production topology, GitHub Pages workflow,
    Supabase Cron, credential hygiene and validated production counts.

## Non-negotiable data rules

- Never invent TfL status, times, causes, crowding, or coordinates.
- `TFL_APP_KEY` and `SUPABASE_SERVICE_ROLE_KEY` stay server-side only.
- Never use `VITE_*` for secrets. The frontend only gets the Supabase anon key.
- Every API response must include `meta`:
  `source`, `fetchedAt`, `cachedAt`, `cacheTtlSeconds`, `isStale`,
  `dataSourceStatus`, `ageSeconds`, `requestId`, `schemaVersion`, `dataQuality`.
- `dataSourceStatus` is exactly `live | cached | stale | unavailable`.
- Distinguish `reported`, `derived`, `historical`, `scenario`, `unknown`.
- Station status is derived from serving lines + station disruptions; label it
  `derived`.
- `AccessViaLift` does **not** mean full step-free. Keep `stepFree = null` until
  the official step-free feed is ingested.
- Live train/station occupancy is not available in the Unified API. Crowding,
  footfall, RODS and NUMBAT are historical/typical.
- If `affectedStops` is empty, show “não informado”, never zero.
- `line.modified` is not a freshness timestamp. Use our `fetchedAt` and TfL
  `validityPeriods`.
- Overnight “Service Closed” is real but not necessarily a disruption. UI says
  “Alertas ativos”, not “interrupções”, for the mixed feed.
- No fake seed statuses. Reference seed only: modes, 20 lines, official colours,
  severity levels, data sources.

## Validated TfL corrections

| Topic | Correct behavior |
|---|---|
| Arrivals | `GET /StopPoint/{id}/Arrivals`; `ArrivalPredictions` returns 404 |
| Elizabeth | mode `elizabeth-line`, line id `elizabeth`; `tflrail` returns 400 |
| Geometry | `GET /Line/{id}/Route/Sequence/{direction}`, field `lineStrings` |
| `/Line/{id}/Route` | route metadata only, no geometry |
| Crowding endpoint | `/StopPoint/{id}/Crowding/{line}` returned 404; use datasets |
| Severity | `/Line/Meta/Severity`, per mode; levels 0–20 |
| Station status | no official endpoint; derive |
| TTL | status/arrivals ~60s; route sequence 3600s; stop points 86400s |

## Architecture

```text
apps/web/          React 18 + Vite + TS + Tailwind + MapLibre v6
apps/api/          Local Hono/Node harness (same api-core)
apps/ingest/       Large TfL open-data catalogue/ETL
packages/shared/   Types, Zod, colours, severity, dates
packages/api-core/ Hono router, TfL client, cache, sync, routes
supabase/          Migrations, seed, Edge Function api
docs/              Architecture, data sources, cron, roadmap
```

- Edge Function entrypoint is the esbuild bundle
  `supabase/functions/api/index.bundle.js` (gitignored).
- Run `npm run edge:build` after backend changes. `npm run supabase:serve` builds
  and serves.
- Edge function uses `basePath: '/api'`; local API uses `''`.
- Local functions serve skips `SUPABASE_*` env names; `.env.local` defines
  `LOCAL_SUPABASE_URL` and `LOCAL_SUPABASE_SERVICE_ROLE_KEY`.
- Local cron secret alias: `LDT_CRON_SECRET`.
- Supabase routes use `public.api_cache` (RLS, no anon grant). `internal` remains
  private.

## Key commands

```bash
npm run dev                 # web 5173 + local API 8787
npm run typecheck
npm run lint
npm run test
npm run build
npm run format:check
npm run edge:build
npm run ingest:footfall
npm run ingest:annual
npm run ingest:numbat
npm run ingest:crowding
npm run ingest:rods
npm run ingest:all
npm run supabase:serve
npx supabase start
npx supabase db reset
```

Sync locally (API local uses `x-cron-secret`):

```bash
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/reference
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/status
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/disruptions
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/cleanup
```

Or run `scripts/sync-local.ps1`.

## Production deployment

- Deploy path: push to `main` → GitHub Actions `Deploy (GitHub Pages)` → Pages.
  `.github/workflows/deploy-pages.yml` runs `npm ci`, `npm run build` with
  `VITE_BASE_PATH=/london-subway/`, copies `index.html` to `404.html` (GitHub
  Pages has no rewrites) and uploads the artifact. Cloudflare Pages remains
  configured as an alternative; there `VITE_BASE_PATH` must stay unset.
- The site lives in a subpath. Every runtime asset path must be built from
  `import.meta.env.BASE_URL`; a hardcoded leading `/` breaks on GitHub Pages.
- Backend changes need `npm run supabase:deploy -- --no-verify-jwt`. The Pages
  workflow only rebuilds the frontend; the Edge Function is not redeployed.
- Supabase Cron (`scripts/setup-cron.sql`) refreshes status (2 min), disruptions
  (5 min), reference and cleanup (daily). There is **no manual sync button** in
  the UI by design; the refresh button only invalidates queries.
- Production credentials stay out of the repo. The Supabase access token and the
  database password were shared in chat during setup and still need rotating.

## Current data shape (Phase 2 validated)

- 20 lines: Tube, Overground (6 named lines), DLR, Elizabeth line, Tram.
- 509 canonical stations; tram platforms canonicalised via `stationNaptan`;
  `TransportInterchange` hubs are not stations.
- 705 `line_stations` rows, outbound only. Inbound is derived by reversal and
  marked `derived`.
- 20 `line_paths` MultiLineStrings via `v_line_paths_geojson`.
- 1,123 entrances/platform children.
- Status snapshots on change or 5-minute heartbeat; network snapshot per minute.
- Active alerts vary with the real TfL feed; overnight closures are included and
  are not automatically classified as disruptions.

## Current data shape (Phase 4)

- `network_status_hourly` and `line_status_hourly` are partitioned by month.
- Each bucket is the latest snapshot of the hour, not an average.
- `samples` records how many raw snapshots contributed to the bucket.
- Hourly tables are not public; only the service role reads them through RPCs.
- Default retention: 90 days of snapshots, 30 days of jobs, 48 h of cache and
  24 h of arrivals. Old hourly partitions are dropped.

## Current data shape (Phase 5.1–5.3)

- `station_traffic_snapshots`: 286,190 daily footfall rows (433 stations,
  2025-01-01..2026-10-31) plus 428 annual-count rows for 2025
  (`tfl-annual-station-counts-2025`, `granularity = annual`).
- `v_station_footfall_daily`: station/date entries, exits and total (`null` when
  both are null).
- `line_annual_boardings`: NUMBAT 2016–2025, 18 source lines, 180 observations.
  `HAM` (H&C + Circle) has `line_id = null`.
- `station_crowding_profiles`: 22,680 `link_flow` profiles (station/interval,
  270 stations), 57,453 `train_loading` profiles (line link/interval) and
  121,716 RODS `entry_exit` profiles (267 stations).
- Graphs: 509 nodes, 604 unique undirected links (59 hub transfers), 4 components,
  largest 506, 3 isolated tram stops.
- RODS 2017 is ingested; it uses weighted survey estimates, not live data.

## Current data shape (Phase 6)

- `profiles`: `id` (auth user), `email`, `display_name`, `is_admin`, timestamps.
  Created by the `on_auth_user_created` trigger; existing users were backfilled.
- `user_favorites`: PK `(user_id, entity_type, entity_id)`,
  `entity_type in ('line','station')`.
- `user_alert_subscriptions`: PK `(user_id, line_id)`,
  `min_band in ('attention','severe','closure')`, `browser_notifications`.
- RLS: users only read/write their own favorites/subscriptions; `is_admin` is not
  self-editable. With the anon key, `select` returns `200 []` (RLS filters every
  row); unauthenticated writes are rejected.
- 33 ONS borough boundaries in `apps/web/public/london-boroughs.geojson` (OGL).
- Migrations: `20261110001100_phase6_users.sql`,
  `20261110001200_phase6_boroughs.sql`.
- Test/local admin promotion is done with service_role SQL, never from the client.

## API endpoints

`/health`, `/version`, `/network`, `/network/status`, `/lines`, `/lines/:id`,
`/lines/:id/status`, `/lines/:id/disruptions`, `/lines/:id/route?direction=`,
`/lines/:id/stations`, `/stations`, `/stations/:id`,
`/stations/:id/arrivals?count=&lineId=`, `/stations/:id/disruptions`,
`/disruptions` (filters `lineId`, `band`, `scope`, `category`, `stationId`, `q`),
`/dashboard/summary`, `/dashboard/history?hours=1..168`, `/data-health`,
`/jobs?limit=`, `/sources`, `/analytics/network`,
`/analytics/scenarios?type=station_closure|line_failure&id=`,
`/analytics/footfall/summary?days=&limit=`,
`/analytics/footfall/stations/:id?days=`,
`/analytics/annual/summary?limit=`, `/analytics/boardings`,
`/analytics/crowding/stations/:id`,
`/analytics/rods/stations/:id?metric=boarders|alighters`.

Sync: `POST /sync/reference|status|disruptions|cleanup` with `x-cron-secret`.

## Frontend conventions

- **Global type scale:** `html { font-size: 18px }` in `index.css`. Use rem-based
  Tailwind sizes (`text-xs`, `text-[0.625rem]`), never new `text-[10px]` values;
  the existing arbitrary sizes were converted from px to rem so they scale.
- Auth: `useAuthSync` mounted once in `AppShell`; `store/authStore.ts` holds the
  session. Supabase client persists the session. User tables use RLS; never query
  them with service_role from the browser.
- Local Auth (`supabase/config.toml`): `site_url = http://localhost:5173`,
  `enable_signup = true`, `enable_confirmations = false`, so sign-up works
  without an inbox. Production must set `site_url` +
  `additional_redirect_urls` to the deployed origin and configure SMTP if
  confirmations are enabled.
- Routes: `/` (CCO), `/dashboard`, `/alerts`, `/analytics`, `/explorer`,
  `/sources`, `/account`, `/admin`, `/report`, `*` (not found).
- `/account`, `/admin` and `/report` are lazy-loaded routes. Admin requires
  `profiles.is_admin`; report uses `@media print` and browser PDF.
- Browser notifications only run while the app is open; no service worker/push.
- Boroughs: toggle adds `borough-fill`/`borough-line` from the local ONS GeoJSON;
  attribution must stay visible. PTAL is not available.
- MapLibre v6 uses **named imports**; no default export:
  `import { Map, AttributionControl } from 'maplibre-gl'`.
- MapLibre v6 also needs its worker. The project copies
  `maplibre-gl-worker.mjs` to `apps/web/public/` via
  `scripts/copy-maplibre-worker.mjs` (predev/prebuild) and calls
  `setWorkerUrl('/maplibre-gl-worker.mjs')`. Do not rely on Vite `?worker&url`:
  it produced `Worker failed to load` and a blank map in this setup.
- Basemap default: `https://tiles.openfreemap.org/styles/dark`.
- Official line colours come from `LINE_BRANDING`; status palette from
  `STATUS_BAND_COLORS`.
- TanStack Query hooks: operational data in `apps/web/src/hooks/useOperations.ts`;
  account/profile/favorites/subscriptions in `hooks/useAccount.ts`.
- Realtime subscription lives in `apps/web/src/hooks/useRealtimeSync.ts`, mounted
  once in `AppShell`; invalidation is debounced (1.2 s) and polling stays as
  fallback. Status is exposed by `store/realtimeStore.ts`.
- Recharts is lazy-loaded with the dashboard route; keep the CCO/map out of that
  chunk so the initial render stays light.
- Vite uses `envDir` pointing at the repo root; keep `VITE_*` values in the root
  `.env.local`. Never add a `SUPABASE_` prefix to `envPrefix` (would expose the
  service role).
- Light UI state in `apps/web/src/store/uiStore.ts`.
- Data-state badges must show `live/cached/stale/unavailable`.
- Keep map visible; panels overlay but do not hide the network.
- Headless screenshot tools may not render WebGL. Validate interactive behaviour in
  Chrome (or a headed Chrome via CDP) where WebGL2 is available. In dev, the map
  instance is exposed as `window.__ldtMap` for layer/rendered-feature checks.

## Phase 3 implementation guide

The backend is ready. Implement:

1. `useNetwork()` → `GET /network`; feed `lines`, `stations`, `paths` to MapLibre.
2. GeoJSON line source from `paths` (MultiLineString), properties include
   `lineId`, `colorHex`, `statusColor`, `statusBand`, `name`, `mode`.
3. GeoJSON station source from `stations` (Point `[lon,lat]`).
4. Layers: line halo, line, line hit area, station circles, selected station,
   station labels at high zoom.
5. Official colour mode vs status colour mode.
6. Click line → toggle selection (max 3); dim other lines.
7. Click station → select station; open station panel.
8. Hover cursor + popup with name/status.
9. Click empty map → clear selection.
10. Fit/fly to search result.
11. Line panel: identity, status, reason, validity, disruptions, stations,
    arrivals for a chosen station, last update, data badge.
12. Station panel: name, lines, zone, status (derived), facilities, entrances,
    disruptions, arrivals.
13. Filters: mode, line, status band, step-free/lifts, toilets, wifi, search.
14. Multi-select comparison panel for 2–3 lines.
15. Keep polling 60s and manual refresh; show stale/cache status.
16. Preserve WebGL fallback and empty states.

See `references/phase-3-map.md` for concrete component and layer details.

### Phase 3 delivered

- `apps/web/src/components/map/NetworkMap.tsx` — real line/station layers,
  official/status colour modes, click selection, hover popup, focus/flyTo.
- `apps/web/src/features/cco/LinePanel.tsx` — status, reason, validity,
  disruptions, stations, arrivals.
- `apps/web/src/features/cco/StationPanel.tsx` — facilities, entrances,
  derived status, station alerts, arrivals.
- `apps/web/src/features/cco/LineComparisonPanel.tsx` — 2–3 line comparison.
- `CcoPage` — filters (mode/status/lifts/WC/WiFi), search with suggestions,
  multi-select, responsive panels.
- Deep links: `/?line=bakerloo` and `/?station=940GZZLUOXC`.
- `GET /stations/:id` enriches entrances/facilities from TfL on demand and
  caches for 24h; do not batch `/StopPoint/{ids}` above 22 IDs in sync-reference
  (TfL returns 400).

## Phase 4 delivered

- Realtime on `line_status_snapshots`, `disruptions`, `network_status_snapshots`;
  `useRealtimeSync` invalidates `network`, `dashboard-summary`,
  `dashboard-history`, `disruptions`, `data-health`, etc.
- Fallback polling remains 60 s. Top bar shows `Tempo real` vs `Polling`.
- Hourly aggregates: `network_status_hourly` and `line_status_hourly`, partitioned
  by month, written by `ldt_rollup_status_hourly` at the end of `sync-status`.
  Each bucket is the latest snapshot of that hour (counts sum to `lines_total`).
- `/dashboard/history` returns series + `topDisruptedLines` + coverage;
  `historical` data quality. Dashboard uses Recharts (area + horizontal bars).
- `/data-health` returns sources, recent jobs and retention defaults; `/jobs`
  is sanitized (no internal error messages). Jobs UI lives on the dashboard.
- Alerts page filters are real: band chips, line select, scope and free-text.
- `ldt_apply_retention` centralizes retention and drops old hourly partitions;
  `sync-cleanup` calls it. Raw snapshots keep 90 days by default.
- Realtime tables were intentionally not converted to partitioned tables: it would
  require `captured_at` in unique keys and could break the publication. Retention
  bounds their size.
- Supabase grants EXECUTE to `anon`/`authenticated` by default on new functions.
  For security-definer RPCs, revoke from `public, anon, authenticated` explicitly
  (see `20261110000700_phase4_function_grants.sql`), not only from `public`.

## Phase 5.1–5.3 delivered

- `apps/ingest/src/footfall` downloads the real TfL daily footfall CSV, resolves
  station names (`STATION_ALIASES` + normalisation + mode suffixes), aggregates
  `(station, date)` and upserts `station_traffic_snapshots`.
- `npm run ingest:footfall` and `npm run footfall:dry -w @ldt/ingest`; report
  includes unmatched and heuristic names.
- `npm run ingest:annual`: XLSX annual counts 2025, 428 stations, `granularity =
  annual` (the `LU` suffix and "Bank and Monument" have explicit aliases).
- `npm run ingest:numbat`: XLSX NUMBAT 2016–2025 into `line_annual_boardings`;
  `HAM` is H&C + Circle and stays without `line_id`.
- `npm run ingest:crowding`: nodes/link flows/train loading 2017; link flows are
  aggregated by station/interval (`kind = link_flow`), train loading is stored per
  line link/interval (`kind = train_loading`).
- `npm run ingest:rods`: ZIP + `.xls` RODS 2017, boarders/alighters into
  `station_crowding_profiles` (`kind = entry_exit`, controlled profile names);
  line-aware resolution for Hammersmith/Edgware Road/Paddington.
- Graph algorithms in `packages/api-core/src/analytics/graph.ts`:
  components, articulation points, station/line scenarios. Hub transfers use
  `hub_naptan_code`, `lineId = null`.
- Accessibility summary only counts explicit step-free values; `AccessViaLift`
  is never promoted.
- `/analytics/network`, `/analytics/scenarios`, `/analytics/footfall/*`,
  `/analytics/annual/summary`, `/analytics/boardings`,
  `/analytics/crowding/stations/:id`, `/analytics/rods/stations/:id` and the
  `/analytics` page (lazy, Recharts).
- Known gaps: 3 isolated tram stops (TfL Regular sequence omits them); 44
  heuristic generic names (reported); scenarios are topological only; RODS and
  crowding profiles are typical historical estimates, not live.

## Phase 6 delivered

- Supabase Auth email/password, persistent session and profile trigger.
- `user_favorites` and `user_alert_subscriptions` with auth.uid() RLS.
- `/account` login/register, favorites, line subscriptions and browser permission.
- Favorite buttons in line/station panels; anonymous users are routed to `/account`.
- `useBrowserAlerts` shows browser notifications for new matching disruptions while
  the app is open (no push).
- `/admin` read-only for `profiles.is_admin`; `/report` printable/PDF.
- ONS borough GeoJSON + MapLibre layer toggle; PTAL intentionally absent.
- Global 18px type scale and rem conversion of arbitrary text sizes.

### Phase 6 file map

- `apps/web/src/lib/supabase.ts` — Supabase client with `persistSession`,
  `autoRefreshToken`, `detectSessionInUrl`; `null` when env is unset.
- `apps/web/src/lib/auth.ts` — sign-in/sign-up/sign-out wrappers with translated
  errors.
- `apps/web/src/store/authStore.ts`, `hooks/useAuthSync.ts`, `hooks/useAuth.ts` —
  session hydration; `useAuthSync` is mounted once in `AppShell`.
- `apps/web/src/hooks/useAccount.ts` — profile, favorites and subscription
  queries/mutations (TanStack Query, invalidated after writes).
- `apps/web/src/hooks/useBrowserAlerts.ts` — Notification API for new matching
  disruptions; mounted in `AppShell`.
- `apps/web/src/components/ui/FavoriteButton.tsx` — used by `LinePanel` and
  `StationPanel`.
- `apps/web/src/features/account/AccountPage.tsx`,
  `features/admin/AdminPage.tsx`, `features/report/ReportPage.tsx` — lazy routes
  `/account`, `/admin`, `/report`.
- `apps/web/src/components/map/NetworkMap.tsx` — `showBoroughs` prop, `boroughs`
  source and `borough-fill`/`borough-line` layers; visibility toggled by effect.
- `apps/web/src/store/uiStore.ts` — `showBoroughs`; `CcoPage` filter checkbox.
- `apps/web/src/index.css` — `@media print`, `.print-report`, 18px root scale.

### Phase 6 known gaps

- Notifications are browser-only while the app is open; no email/push worker.
- `/admin` is read-only and cannot run jobs or manage users.
- PDF is generated by the browser print dialog, not server-side.
- PTAL is absent; only ONS borough boundaries are included.
- Account features degrade to a configuration message when Supabase env is unset.

## Common pitfalls

- Do not add extensionless relative imports in `packages/*`: the Deno Edge
  runtime needs `.ts`; esbuild bundle also relies on them.
- `npm run edge:build` is required after changing `packages/api-core`,
  `packages/shared`, or the Edge function.
- If `/sync/*` returns 503 `cron_not_configured`, set `LDT_CRON_SECRET` and
  restart `npm run supabase:serve`.
- If `/network` returns 503, run `sync-reference`.
- If all lines show closure at night, that is TfL’s real `Service Closed`.
- PowerShell may display UTF-8 mojibake; verify JSON bytes via browser/Node, not
  console glyphs.
- `v_line_paths_geojson.geometry` is already a GeoJSON object; do not parse it
  as WKT.
- `line_stations` has no inbound rows; reverse outbound branches in the API or
  UI and mark derived.
- Use `station.lineIds` for station–line membership; `line_stations` for order.
- `/StopPoint/{ids}` returned 400 with 23+ comma-separated IDs; station detail is
  enriched on demand in `GET /stations/:id`, not during `sync-reference`.
- CCO live data uses `/network` (lines + stations + paths + summary); map polling
  is 60 s. `dataSourceStatus` can be `stale` when no cron is active in local dev.
- Do not treat “idle not fired” as basemap failure. Layers are installed on
  `style.load`; the error overlay is only for real WebGL/style/worker errors.
- Realtime silently stops if the table leaves the `supabase_realtime` publication
  or the anon SELECT policy is removed. Re-test with a sync after RLS changes.
- `useRealtimeSync` is mounted once in `AppShell`; mounting it per page would
  create duplicate channels and invalidations.
- Keep `cache: 'no-store'` in the API client. Without it, a realtime-triggered
  refetch can receive a stale browser-cached response.
- Do not call `ldt_apply_retention` or `ldt_rollup_status_hourly` from the
  frontend; they are service-role-only security-definer RPCs.
- Retention can drop hourly partitions. Do not assume old hourly buckets remain
  after the configured window, and do not backfill partitions with fabricated
  data.
- The dashboard is lazy-loaded on purpose; importing Recharts into `App.tsx` or
  the CCO would push the chart bundle into the initial map load.
- Vite reads the root `.env.local` (`envDir`). If Realtime says `Polling`, check
  that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set there and restart
  the dev server.
- Footfall names are not IDs. Do not add fuzzy matching; add an explicit alias or
  leave the name unmatched and report it. Keep empty counts as `null`, never zero.
- The footfall upsert conflict target is
  `station_id,source_dataset,granularity,travel_date`; changing it silently
  breaks idempotency.
- The graph depends on `line_stations` order. Do not sort by station name or
  sequence across branches. Missing sequence rows become isolated nodes.
- Hub transfers (`hub_naptan_code`) connect canonical stations of the same
  complex; they are not physical segments and have no travel time.
- Scenarios are topological. Do not add travel times, frequencies or capacity
  unless a real source is ingested, and never label them real-time.
- Annual counts, NUMBAT, link flows, train loading and RODS are ingested. Do not
  backfill footfall gaps with invented values.
- Annual counts use `LU` suffixes and "Bank and Monument"; the resolver has
  explicit aliases for these. Do not treat `Bank and Monument` as two stations.
- NUMBAT `HAM` combines H&C and Circle; keep `line_id = null` instead of
  assigning it to one line. Other line codes map 1:1.
- 2017 link flows are **typical profiles**, not live occupancy. They are
  aggregated internal station flows; do not present them as unique passengers or
  vehicle loading. Train loading is a separate `kind`.
- RODS lives in `.xls` files inside a ZIP and uses survey weights; the ingest uses
  SheetJS and the `Boarders`/`Alighters` sheets. Store it as `entry_exit` profiles,
  preserve the metric in `profile_name`, and label it historical/weighted.
- RODS station names are ambiguous for Hammersmith, Edgware Road and Paddington;
  resolve them with the line context. Do not reuse the generic footfall heuristic
  for those three.
- Crowding/RODS 2017 profiles are typical historical estimates; never present them
  as live occupancy or unique passenger counts.
- Use rem for text sizes. `text-[10px]` does not follow the global 18px root scale;
  prefer `text-[0.625rem]`/`text-xs`.
- Supabase Auth user data must go through RLS tables (`profiles`,
  `user_favorites`, `user_alert_subscriptions`). Never expose service_role.
- `profiles.is_admin` must not be self-updatable. Promote with service_role SQL.
- With the anon key, RLS `select` on the user tables returns `200 []`, not `401`;
  do not treat the empty array as a broken endpoint. Writes without a valid user
  are rejected.
- `detectSessionInUrl` is required for Supabase email links; keep it enabled in
  `lib/supabase.ts`. Removing it breaks confirmation/recovery flows.
- The Phase 6 profile trigger is security definer; do not grant EXECUTE on
  `handle_new_user()` to `public/anon/authenticated`.
- Browser notifications require the app open and permission granted; do not claim
  email/push delivery.
- Print styles hide app chrome and switch `.print-report` to a light palette; keep
  the report self-contained and test `Page.printToPDF`.
- Boroughs are ONS OGL v3.0; keep attribution. Do not substitute an unlicensed
  boundary file or invent PTAL.

- CORS origins must be stored with a **lowercase** host: browsers send the
  `Origin` host lowercased. The router now compares case-insensitively, but
  `ALLOWED_ORIGINS` should still be lowercase. A mismatch returns 403
  `origin_not_allowed` and the UI shows "API OFFLINE" with every panel empty.
- On GitHub Pages a deep link returns HTTP 404 with the SPA HTML (from
  `404.html`). That is expected, not a broken deploy.
- `vault.secrets` is not readable by the `postgres` role; use the
  `vault.decrypted_secrets` view with `vault.create_secret`/`vault.update_secret`.
- The first Pages deployment needs the site to exist: `enablement: true` in
  `actions/configure-pages` or `POST /repos/{owner}/{repo}/pages` with
  `build_type: "workflow"`. Later deploys need only `pages: write` and
  `id-token: write`.
- Headless Edge renders the deployed SPA well enough to verify production:
  `msedge --headless=new --disable-gpu --virtual-time-budget=20000
  --screenshot=out.png <url>`. Use it to confirm the map, panels and data badges.

## Definition of done for a phase

- `npm run lint`, `typecheck`, `test`, `build`, `format:check` pass.
- `npm run edge:build` passes.
- Migrations apply with `npx supabase db reset`.
- Public endpoints return the metadata envelope.
- RLS verified with anon key.
- No secrets in the bundle or logs.
- New security-definer functions are not executable by `anon`/`authenticated`
  (probe with the anon key, not only RLS on tables).
- Auth/user tables are checked with RLS: anon cannot read; a user sees only own
  favorites/subscriptions; `is_admin` is not self-editable.
- Realtime is verified end-to-end: a real sync triggers a dashboard refetch
  without reload, and the UI falls back to `Polling` if Realtime is unavailable.
- Footfall ingestion is validated with a dry run (`rowsUnmatched = 0`, heuristic
  names reviewed) and the analytics endpoints return the expected metadata.
- `/report` prints/export a non-empty PDF; `/admin` is denied to non-admins.
- Update `docs/roadmap.md` and `README.md`.
- Do not start new phases or expansions unless the user explicitly asks.

