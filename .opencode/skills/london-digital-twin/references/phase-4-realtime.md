# Phase 4 — Realtime, history and dashboard

Phase 4 is delivered. Phases 5.1–5.3 and 6 are also delivered; see
`phase-5-analytics.md` and `phase-6-product.md`.

## Data flow

```text
TfL → sync-status ─→ line_status_snapshots ─┐
                  ├→ network_status_snapshots ├→ Supabase Realtime → browser
                  └→ ldt_rollup_status_hourly ┘
                              │
                              ├→ network_status_hourly (partitioned by month)
                              └→ line_status_hourly    (partitioned by month)

browser → /dashboard/summary, /dashboard/history, /data-health (polling fallback)
```

`sync-disruptions` writes `disruptions`, which is also in the publication and
triggers the same query invalidation.

## Database objects

Migration `20261110000600_phase4_history.sql`:

- `network_status_hourly` — one row per hour; the **latest** network snapshot of
  that hour. Columns mirror the raw snapshot counts, plus `samples` and
  `updated_at`.
- `line_status_hourly` — `(bucket_start, line_id, band)` with sample counts.
- `ldt_ensure_hourly_partitions(months_ahead, months_back)` — creates monthly
  partitions idempotently.
- `ldt_rollup_status_hourly(hours)` — recomputes the last N hours. Called at the
  end of `sync-status`; a failure is a warning, not a sync failure.
- `ldt_network_history(since)` — hourly network series.
- `ldt_top_disrupted_lines(since)` — per line: disrupted buckets / total buckets.
- `v_sync_jobs_public` — sanitized jobs view (no error messages/metadata).
- `ldt_apply_retention(status_days, jobs_days, cache_hours, arrivals_hours)` —
  deletes old rows and drops hourly partitions older than the window.

Migration `20261110000700_phase4_function_grants.sql`:

- Revokes EXECUTE from `public, anon, authenticated` and grants it to
  `service_role` only. Supabase grants EXECUTE to anon by default, so revoking
  only from `PUBLIC` is not enough.

## Hourly bucket semantics

Each network bucket uses the most recent snapshot in the hour:

```sql
row_number() over (
  partition by date_trunc('hour', captured_at)
  order by captured_at desc
) = 1
```

Do **not** use `avg()` per band: rounded averages can sum to more than
`lines_total` and break a stacked chart. `samples` still counts every snapshot in
the hour so coverage remains auditable.

## API

- `GET /dashboard/history?hours=1..168` — `series`, `topDisruptedLines`,
  `coverage`; meta `dataQuality = historical`.
- `GET /data-health` — real sources, last 10 jobs, retention defaults.
- `GET /jobs?limit=1..50` — sanitized jobs.
- `GET /disruptions?lineId=&band=&scope=&category=&stationId=&q=` — server-side
  filters in addition to the UI filters.

Response metadata stays consistent: `fetchedAt` for history is the latest network
snapshot; TTL is 300 s so a small delay is `cached`, not `stale`.

## Frontend

- `apps/web/src/hooks/useRealtimeSync.ts` — subscribes once in `AppShell` to
  `postgres_changes` on the three tables. Invalidations are debounced by 1.2 s
  and cover network/status/dashboard/history/disruptions/lines/stations/sources.
- `apps/web/src/store/realtimeStore.ts` — `unconfigured | connecting | subscribed |
  error`; the top bar shows `Tempo real` or `Polling`.
- Polling remains 60 s in `useOperations.ts`; do not remove it.
- The API client sends `cache: 'no-store'` so a realtime-triggered refetch does
  not read a stale browser HTTP cache.
- `DashboardPage.tsx` — range selector 6/24/72 h, stacked area chart, horizontal
  top-lines chart, jobs table, retention and source health. Recharts is lazy
  loaded with the dashboard route.
- `AlertsPage.tsx` — real filters by band, line, scope and free text; reset
  button and visible/total count.
- Bucket labels: use `bucketLabel()`/`sampleLabel()` to avoid “1 buckets”.

## Validation recipe

1. `npx supabase db reset` — all migrations, including 006/007.
2. `POST /sync/reference`, `/sync/status`, `/sync/disruptions`.
3. `GET /dashboard/history?hours=24` — one bucket at minimum; counts sum to
   `lines_total`.
4. With the dashboard open, run `POST /sync/disruptions` and confirm network
   requests to `/dashboard/summary`, `/dashboard/history` and `/data-health`
   happen within ~2 s without reload.
5. Confirm the top bar says `Tempo real`; disable Realtime/Supabase and confirm
   it falls back to `Polling`.
6. Probe with the anon key:
   - `POST /rest/v1/rpc/ldt_apply_retention` → `401`
   - `POST /rest/v1/rpc/ldt_rollup_status_hourly` → `401`
   - `GET /rest/v1/v_sync_jobs_public` → `401`
   - `GET /rest/v1/line_status_snapshots` → `200` (public read, needed by RLS
     for Realtime).
7. Confirm the CCO map still renders and a station click opens the panel.

## Deferred (do not start without an explicit request)

- Converting realtime snapshot tables to partitioned tables. It requires
  `captured_at` in unique keys and could break the Realtime publication; the
  90-day retention already bounds their size.
- Server-side email/push notifications (Phase 6 only implements browser
  notifications while the app is open).
- Server-side PDF generation (Phase 6 uses the browser print pipeline on
  `/report`).
- PTAL and any GIS layer without a validated source.
