# Phase 3 — CCO map and panels

Goal: render the real network in MapLibre and make lines/stations interactive
without losing the CCO context.

## Data

`GET /network` returns:

```ts
interface NetworkData {
  lines: LineSummary[];
  stations: StationSummary[];
  paths: LinePathData[];
  summary: NetworkSummary;
}
```

`LinePathData.geometry` is already a GeoJSON `MultiLineString` or `LineString`.
`StationSummary` has `lon`, `lat`, `lineIds`, `status.band`, facilities.

Add `useNetwork()` in `apps/web/src/hooks/useOperations.ts` with 60s refetch.

Add API client method:

```ts
getNetwork: () => request<NetworkData>('/network'),
```

## GeoJSON transforms

```ts
const lineFeatures = paths.map((path) => ({
  type: 'Feature',
  id: `${path.lineId}:${path.direction}:${path.branchId}`,
  properties: {
    lineId: path.lineId,
    direction: path.direction,
    colorHex: lineById.get(path.lineId)?.colorHex ?? '#7A879C',
    statusColor: STATUS_BAND_COLORS[lineById.get(path.lineId)?.status?.band ?? 'unknown'],
    statusBand: lineById.get(path.lineId)?.status?.band ?? 'unknown',
    name: lineById.get(path.lineId)?.name ?? path.lineId,
    mode: lineById.get(path.lineId)?.mode ?? 'unknown',
  },
  geometry: path.geometry,
}));
```

Stations:

```ts
const stationFeatures = stations.map((station) => ({
  type: 'Feature',
  id: station.id,
  properties: {
    id: station.id,
    name: station.name,
    lineIds: station.lineIds, // MapLibre serializes arrays; use JSON string if needed
    interchange: station.lineIds.length,
    statusColor: STATUS_BAND_COLORS[station.status?.band ?? 'unknown'],
    statusBand: station.status?.band ?? 'unknown',
    zone: station.zone,
  },
  geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
}));
```

Prefer `properties.lineIdsJson = JSON.stringify(station.lineIds)` for popup use.

## Layer order

1. `network-lines-halo` — dark casing, width 4–10 by zoom.
2. `network-lines` — official or status colour, width 2–6.
3. `network-lines-hit` — transparent/0.01 opacity, width 18 for clicks.
4. `network-stations-selected` — larger glow/halo, filter by selected id.
5. `network-stations` — circle fill `#0B111B`, stroke line/status colour,
   radius 3–6 (interchange larger).
6. `network-stations-labels` — text at zoom >= 12.5, collision on.

Use `promoteId: 'id'` on GeoJSON sources if using feature-state later.

## Selection dimming

Build a paint expression in JS:

```ts
const lineOpacity = selectedLineIds.length
  ? ['case', ['in', ['get', 'lineId'], ['literal', selectedLineIds]], 1, 0.15]
  : 0.9;
map.setPaintProperty('network-lines', 'line-opacity', lineOpacity);
```

When a line is selected, its station points should remain visible. Optionally
dim stations whose `lineIds` do not intersect the selection.

## Colour modes

- `brand`: `line-color` = `['get', 'colorHex']`.
- `status`: `line-color` = `['get', 'statusColor']`.

Keep the official colour as the default; status mode is an explicit toggle.

## Interactions

Prefer one map-level click handler:

```ts
map.on('click', (event) => {
  const stations = map.queryRenderedFeatures(event.point, {
    layers: ['network-stations'],
  });
  if (stations[0]) {
    onSelectStation(String(stations[0].properties?.id));
    return;
  }
  const lines = map.queryRenderedFeatures(event.point, {
    layers: ['network-lines-hit'],
  });
  if (lines[0]) {
    onToggleLine(String(lines[0].properties?.lineId));
    return;
  }
  onClearSelection();
});
```

Cursor:

```ts
map.on('mousemove', (event) => {
  const hits = map.queryRenderedFeatures(event.point, {
    layers: ['network-stations', 'network-lines-hit'],
  });
  map.getCanvas().style.cursor = hits.length ? 'pointer' : '';
});
```

Popup: create one `maplibregl.Popup({ closeButton: false })`, set lngLat and
HTML with escaped text. Remove on mouseleave.

## Search / flyTo

Expose a `focus` prop or imperative ref:

```ts
export interface MapFocus {
  lon: number;
  lat: number;
  zoom?: number;
}
```

On change:

```ts
map.flyTo({ center: [focus.lon, focus.lat], zoom: focus.zoom ?? 14, essential: true });
```

Search should match station name/id and line name/id. Selecting a line sets
selection; selecting a station sets station and focus.

## Panels

### Line panel

- Header: colour dot, official name, mode, TfL id.
- Status: raw description, band, reason, validity, `fetchedAt` + age.
- Disruptions: description, category, validity, affected station count.
- Stations: ordered list with interchange, status, step-free unknown.
- Arrivals: `<select>` a station in the line; call
  `GET /stations/:id/arrivals?lineId=:lineId&count=5`; show empty message when
  none.
- Paths: highlighted on map via selection.
- Data badge: `live/cached/stale/unavailable`.

### Station panel

- Name, id, lines, zone, status (derived), facilities, step-free (unknown).
- Entrances from `/stations/:id`.
- Disruptions from station detail.
- Arrivals from `/stations/:id/arrivals`.
- Buttons: “ver no mapa”, “copiar link”.

### Multi-selection

If 2–3 lines selected, show a comparison panel with one row per line:
name, status, reason, disruption count, station count, last update. Keep the
full detail panel for a single line.

## Filters

Store in Zustand:

```ts
interface Filters {
  modes: TfLMode[];
  lineId: string | null;
  band: StatusBand | 'all';
  onlyLifts: boolean;
  onlyToilets: boolean;
  onlyWifi: boolean;
  query: string;
}
```

Filter lines first, then derive visible line ids. A station is visible if any of
its `lineIds` is visible. Apply station facility filters only when the source
value is non-null; otherwise show “não informado” and do not hide silently
unless the user chose an explicit filter.

## Performance

- Keep one GeoJSON source per kind; use `setData` on updates.
- Do not recreate the map on selection changes.
- Use `setPaintProperty` for dimming and colour mode.
- 509 stations and 20 MultiLineStrings are small; no clustering needed at city
  zoom.
- Add labels only at zoom >= 12.5.

## Acceptance checklist

- [ ] 20 lines and 509 stations visible.
- [ ] Official colours + status toggle.
- [ ] Click line highlights only it; others dim.
- [ ] Click station opens station panel.
- [ ] Click empty map clears selection.
- [ ] Search flies to station/line.
- [ ] Filters change map and panel counts.
- [ ] Line panel has status, reason, validity, disruptions, stations, arrivals.
- [ ] Station panel has facilities, entrances, disruptions, arrivals.
- [ ] Data state badge shows real freshness.
- [ ] Map remains visible with panels open.
- [ ] No fake data; empty/stale states explicit.
- [ ] `npm run typecheck`, `lint`, `test`, `build` pass.
