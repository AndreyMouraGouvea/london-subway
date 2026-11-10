# Phase 5.1–5.3 — Analytical twin

Delivered: daily footfall, annual station counts, NUMBAT line boardings, 2017 link
flows/train loading, RODS 2017, station–segment graph, accessibility, topological
resilience and scenarios.

## Footfall ingestion

Command:

```bash
npm run ingest:footfall
npm run footfall:dry -w @ldt/ingest   # parse + resolve only
```

Options: `--from=YYYY-MM-DD`, `--to=YYYY-MM-DD`, `--limit=N`, `--file=...`,
`--refresh`, `--report=path`.

Source: `https://crowding.data.tfl.gov.uk/Network%20Demand/StationFootfall_2025_2026%20.csv`
(columns `TravelDate, DayOfWeek, Station, EntryTapCount, ExitTapCount`).

Behaviour:

- Downloads to `%TEMP%/ldt-station-footfall-2025-2026.csv` and reuses the cache
  unless `--refresh` is passed.
- Validates `YYYYMMDD` dates and keeps empty counts as `null` (never zero).
- Resolves station names in this order:
  1. explicit `STATION_ALIASES` (Hammersmith/Edgware Road variants, NR/EL names
     that do not normalise cleanly, `W Silvertown`, etc.);
  2. unique base-name match after removing parentheses and mode tokens;
  3. suffix filter for `NR`, `SR`, `EL`, `LO`, `DLR`, `TfL/HEx`;
  4. documented heuristic: Tube > DLR > Elizabeth > rail, more lines, no
     parentheses, id ascending.
- Aggregates duplicate `(station, date)` rows before upserting.
- Upserts `station_traffic_snapshots` with `on_conflict = station_id,
  source_dataset, granularity, travel_date` in batches of 1000.
- Records a `data_sync_jobs` row and updates `data_sources.tfl-station-footfall`.
- Report contains `rowsMatched`, `rowsUnmatched`, `resolution` counts,
  `heuristicNames` (with candidate ids) and `unmatchedNames`. Never guesses a
  station for an unmatched name.

Footfall is `historical`; it is not live occupancy and has no hourly resolution
in this slice.

## Other historical datasets

```bash
npm run ingest:annual    # AC2025 annualised entry/exit (XLSX)
npm run ingest:numbat    # NUMBAT 2016–2025 (XLSX)
npm run ingest:crowding  # 2017 nodes + link flows + train loading (CSV)
npm run ingest:rods      # RODS 2017 boarders/alighters (ZIP + .xls)
npm run ingest:all       # footfall + annual + NUMBAT + crowding + RODS
```

- Annual: reads the 2025 XLSX, uses column 19 (`Annualised`), writes
  `station_traffic_snapshots` with `granularity = annual` and
  `travel_date = 2025-12-31`. `LU` suffixes and `Bank and Monument` are aliases.
- NUMBAT: reads the `multi-year` sheet, years 2016–2025, writes
  `line_annual_boardings`. `HAM` means H&C + Circle and keeps `line_id = null`.
- Crowding: reads `StationNodesDescription.csv`,
  `StationPassengerLinkFlows.csv` and `LUTrainLoadingData.csv`. Link flows are
  summed by station/15-min interval (`kind = link_flow`); train loading keeps
  from/to/line/direction (`kind = train_loading`). Both are typical 2017
  profiles, not live data. Values empty are skipped, zero is preserved.
- RODS: downloads the ZIP, extracts `Misc/Boarders and alighters by
  station-line-time of day 2017.xls`, reads the `Boarders`/`Alighters` sheets
  with SheetJS, and stores 84 quarter-hour values per station/line/direction in
  `station_crowding_profiles` (`kind = entry_exit`,
  `profile_name = RODS 2017 boarders|alighters`). Hammersmith, Edgware Road and
  Paddington are resolved with line context. Weighted survey estimates, not live.
- `exceljs` is an ingest-only dependency. RODS `.xls` uses SheetJS 0.20.3 from
  the official tarball.

## Graph

- Built from `line_stations` ordered by `(line_id, direction, branch_id,
  sequence)`; undirected segments.
- Adds transfer edges between canonical stations sharing `hub_naptan_code`
  (e.g., Paddington Tube vs NR, Bank Tube vs DLR). Transfer edges have
  `lineId = null`, `kind = 'transfer'` and no travel time.
- `uniqueUndirectedLinks` deduplicates parallel line pairs; `uniqueTransferLinks`
  counts hub transfers separately.
- Algorithms live in `packages/api-core/src/analytics/graph.ts` and are pure:
  `buildGraph`, `connectedComponents`, `articulationPoints`, `analyseScenario`.
- A line failure removes only that line's segment edges; hub transfers remain.
- A station closure removes the station and all incident edges.

## Accessibility

`summariseAccessibility` counts observed lifts, toilets, wifi, interchanges and
missing zones. `stepFreeKnown` counts only explicit `step_free` values; the
current dataset has none, so the UI must not claim step-free coverage.
`AccessViaLift` is never promoted to step-free.

## API

- `GET /analytics/network` — graph summary, accessibility, critical stations,
  line impact. `dataQuality = derived`.
- `GET /analytics/scenarios?type=station_closure|line_failure&id=...` —
  baseline, impact, affected stations and visible assumptions.
  `dataQuality = scenario`.
- `GET /analytics/footfall/summary?days=1..730&limit=1..30` — daily network
  series and top stations. `dataQuality = historical`.
- `GET /analytics/footfall/stations/:stationId?days=1..730` — daily station
  series; 404 for unknown stations.
- `GET /analytics/annual/summary?limit=1..50` — annual station counts 2025.
- `GET /analytics/boardings` — NUMBAT series per line (2016–2025).
- `GET /analytics/crowding/stations/:stationId` — typical 2017 15-min profile
  (`kind = link_flow`).
- `GET /analytics/rods/stations/:stationId?metric=boarders|alighters` — RODS 2017
  quarter-hour profile, aggregated across lines/directions for the station.

## Frontend

- Route `/analytics`, lazy loaded (`AnalyticsPage.tsx`), nav item `Análise`.
- KPI row, accessibility panel, articulation table, line-impact bar chart,
  scenario simulator, footfall network chart, top-stations chart, station
  detail chart, annual counts, NUMBAT boardings and the 2017 crowding profile.
- Recharts stays in the analytics/dashboard chunks; do not import it in the CCO.
- Scenario assumptions are always rendered above the affected stations.

## Known gaps

- 3 tram stops (`Centrale`, `Reeves Corner`, `Wellesley Road`) are omitted from
  TfL's "Regular" route sequence, so they appear as isolated nodes. Do not
  connect them without a real sequence source.
- 44 generic station names use the documented heuristic (complex-level names
  such as `Bank`, `Paddington`, `Liverpool Street`). The report lists them.
- RODS 2017 is ingested; it is a weighted survey estimate, not live data.
- No travel times/frequencies: the current sources do not provide them for the
  graph, and none are invented.
- 2017 crowding is typical, not live; link flows aggregate internal movements
  and are not unique passengers or vehicle occupancy.

## Validation

1. `npm run footfall:dry -w @ldt/ingest` → `rowsUnmatched = 0`; review
   `heuristicNames`.
2. `npm run ingest:footfall` → ~286k rows, 433 stations, 2025-01-01..2026-10-31.
3. `npm run ingest:annual` → 432 rows matched, 428 stations, total ~2.92B.
4. `npm run ingest:numbat` → 18 lines, 180 observations, years 2016..2025.
5. `npm run ingest:crowding` → 22,680 link-flow profiles + 57,453 train-loading
   profiles, 270 stations, no unmatched NAPTANs.
6. `npm run ingest:rods` → 121,716 profiles, 267 stations, no unmatched names.
7. `GET /analytics/network` → 509 stations, 604 links, 59 transfers, 4
   components, 506 largest, 3 isolated.
8. `GET /analytics/scenarios?type=station_closure&id=940GZZLUOXC` → 1 removed,
   6 links, 505 largest, 3 outside largest.
9. `GET /analytics/footfall/summary?days=30` → 433 stations and daily series.
10. `GET /analytics/annual/summary?limit=10` → 428 stations, top Waterloo.
11. `GET /analytics/boardings` → latest year 2025, 18 lines.
12. `GET /analytics/crowding/stations/940GZZLUOXC` → 84 intervals, total ~441k.
13. `GET /analytics/rods/stations/940GZZLUOXC?metric=boarders` → 84 intervals,
    total ~310k.
14. UI: `/analytics` loads 8 charts without console errors; scenario type/target,
    station selectors and RODS metric toggle update the panels.

