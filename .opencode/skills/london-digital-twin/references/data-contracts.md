# Data contracts

## Envelope

```ts
interface ApiEnvelope<T> {
  data: T | null;
  meta: ApiMeta;
  error?: { code: string; message: string; details?: unknown };
}

interface ApiMeta {
  source: 'tfl-unified-api' | 'tfl-open-data' | 'derived' | 'cache';
  fetchedAt: string | null;
  cachedAt: string | null;
  cacheTtlSeconds: number;
  isStale: boolean;
  dataSourceStatus: 'live' | 'cached' | 'stale' | 'unavailable';
  ageSeconds: number | null;
  requestId: string;
  schemaVersion: string;
  dataQuality: 'reported' | 'derived' | 'historical' | 'scenario' | 'unknown';
  upstream?: { status: number; ttlSeconds?: number; error?: string };
  warnings?: string[];
}
```

## Status bands

| Band | TfL severity examples |
|---|---|
| `normal` | 10 Good Service, 18 No Issues |
| `attention` | 0 Special Service, 7 Reduced, 8 Bus Service, 9 Minor Delays, 12 Excel Only, 13 No Step Free, 14 Frequency, 15 Diverted, 17 Issues |
| `severe` | 3 Part Suspended, 4 Planned Closure, 5 Part Closure, 6 Severe Delays, 11 Part Closed |
| `closure` | 1 Closed, 2 Suspended, 16 Not Running, 20 Service Closed |
| `unknown` | 19 Information or absent |

Descriptions are mode-specific in `/Line/Meta/Severity`; the table above is the
current mapping in `packages/shared/src/constants/severity.ts`.

## Core types

```ts
interface LineSummary {
  id: string;
  name: string;
  mode: string;
  colorHex: string | null;
  textColorHex: string | null;
  status: LineCurrentStatus | null; // severity, description, band, reason, validity, capturedAt
  disruptionCount: number;
  stationCount: number | null;
  updatedAt: string | null;
  dataQuality: 'reported' | 'derived' | 'unknown';
}

interface StationSummary {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zone: string | null;
  modes: string[];
  lineIds: string[];
  stepFree: boolean | null;
  stepFreeSource: string | null;
  facilities: {
    lifts: number | null;
    escalators: number | null;
    toilets: boolean | null;
    wifi: boolean | null;
    parking: boolean | null;
    ticketHalls: number | null;
  };
  status: {
    band: StatusBand;
    label: string;
    derivedFromLineIds: string[];
    confidence: 'derived';
  } | null;
  updatedAt: string | null;
}
```

```ts
interface LinePathData {
  lineId: string;
  direction: 'inbound' | 'outbound';
  branchId: number;
  routeName: string | null;
  geometry: GeoJSONLineString | GeoJSONMultiLineString;
  fetchedAt: string | null;
  derived: boolean;
}

interface NetworkSummary {
  linesTotal: number;
  stationsTotal: number;
  normal: number;
  attention: number;
  severe: number;
  closure: number;
  unknown: number;
  disruptionsActive: number;
  stationsAffected: number | null;
  lastCapturedAt: string | null;
}
```

```ts
interface DisruptionSummary {
  id: string;
  lineId: string | null;
  stationId: string | null;
  scope: 'line' | 'station' | 'network';
  category: string | null;
  type: string | null;
  categoryDescription: string | null;
  summary: string | null;
  description: string | null;
  additionalInfo: string | null;
  closureText: string | null;
  severityLevel: number | null;
  band: StatusBand;
  validityPeriods: unknown[];
  startsAt: string | null;
  endsAt: string | null;
  affectedStops: unknown[];
  affectedRoutes: unknown[];
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
}
```

```ts
interface ArrivalSummary {
  id: string;
  stationId: string;
  stationName: string | null;
  lineId: string | null;
  lineName: string | null;
  platformName: string | null;
  direction: string | null;
  towards: string | null;
  destinationName: string | null;
  destinationStationId: string | null;
  expectedArrival: string | null;
  timeToStationSeconds: number | null;
  currentLocation: string | null;
  modeName: string | null;
}
```

## Endpoint shapes

| Endpoint | `data` |
|---|---|
| `GET /network` | `{ lines, stations, paths, summary }` |
| `GET /network/status` | `{ summary, lines }` |
| `GET /lines` | `LineSummary[]` |
| `GET /lines/:id` | `{ line, statuses, disruptions, stations, paths }` |
| `GET /lines/:id/status` | `{ line, status, disruptions }` |
| `GET /lines/:id/disruptions` | `DisruptionSummary[]` |
| `GET /lines/:id/route` | `{ lineId, direction, derived, branches, paths }` |
| `GET /lines/:id/stations` | `StationSummary[]` |
| `GET /stations` | `StationSummary[]` |
| `GET /stations/:id` | `{ station, entrances, facilities, disruptions }` |
| `GET /stations/:id/arrivals` | `{ stationId, stationName, arrivals }` |
| `GET /stations/:id/disruptions` | `DisruptionSummary[]` |
| `GET /disruptions` | `DisruptionSummary[]` |
| `GET /dashboard/summary` | `{ summary, topLines, linesWithStatus, dataHealth }` |
| `GET /sources` | `DataSourceSummary[]` |

## Cache semantics

- `live`: fresh upstream fetch (only arrivals currently use this).
- `cached`: DB snapshot/reference within TTL.
- `stale`: served after TTL; `isStale = true`.
- `unavailable`: no usable data.
- Arrivals TTL 45 s, status TTL 60 s, reference TTL 24 h, route TTL 1 h.
- On TfL error, arrivals fall back to the last cached value and are marked stale.

## Privacy / security

- `TFL_APP_KEY` only in Edge Function secrets/Vault.
- `SUPABASE_SERVICE_ROLE_KEY` only server-side.
- Public RLS read is limited to reference/operational tables; `api_cache` and
  `data_sync_jobs` are not exposed to anon.
- No raw TfL payloads in public responses.
