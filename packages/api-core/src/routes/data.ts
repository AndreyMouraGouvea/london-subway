import type { SupabaseClient } from '@supabase/supabase-js';
import {
  STATUS_BAND_LABELS,
  getStatusBand,
  getStatusBandRank,
  sortStatusesBySeverity,
} from '../../../shared/src/index.ts';
import type {
  DisruptionSummary,
  GeoJSONLineString,
  GeoJSONMultiLineString,
  LineCurrentStatus,
  LinePathData,
  LineSummary,
  NetworkSummary,
  StationSummary,
} from '../../../shared/src/types/api.ts';
import type { StatusBand } from '../../../shared/src/types/domain.ts';
import { fetchAllRows } from '../db.ts';

export interface LineRow {
  id: string;
  name: string;
  mode_id: string;
  color_hex: string | null;
  text_color_hex: string | null;
  last_synced_at: string | null;
}

export interface StatusRow {
  line_id: string;
  captured_at: string;
  severity: number | null;
  severity_description: string | null;
  band: string | null;
  reason: string | null;
  category: string | null;
  validity_from: string | null;
  validity_to: string | null;
  is_now: boolean | null;
}

export interface StationRow {
  id: string;
  name: string;
  display_name: string;
  lat: number;
  lon: number;
  zone: string | null;
  modes: string[] | null;
  line_ids: string[] | null;
  step_free: boolean | null;
  step_free_source: string | null;
  has_lifts: boolean | null;
  has_escalators: boolean | null;
  has_toilets: boolean | null;
  has_wifi: boolean | null;
  has_parking: boolean | null;
  ticket_halls: number | null;
  facilities: Record<string, string> | null;
  last_synced_at: string | null;
}

export interface PathRow {
  line_id: string;
  direction: string;
  branch_id: number;
  route_name: string | null;
  geometry: unknown;
  fetched_at: string | null;
}

export interface DisruptionRow {
  id: string;
  line_id: string | null;
  station_id: string | null;
  scope: string;
  category: string | null;
  type: string | null;
  category_description: string | null;
  summary: string | null;
  description: string | null;
  additional_info: string | null;
  closure_text: string | null;
  severity_level: number | null;
  validity_periods: unknown;
  starts_at: string | null;
  ends_at: string | null;
  affected_stops: unknown;
  affected_routes: unknown;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
}

export interface LineStationRow {
  line_id: string;
  station_id: string;
}

export interface NetworkSnapshotRow {
  id: number;
  captured_at: string;
  lines_total: number;
  lines_normal: number;
  lines_attention: number;
  lines_severe: number;
  lines_closed: number;
  lines_unknown: number;
  disruptions_active: number;
  stations_affected: number | null;
  payload: Record<string, unknown>;
}

export interface DataSourceRow {
  id: string;
  name: string;
  publisher: string;
  url: string | null;
  license: string | null;
  license_url: string | null;
  attribution_text: string | null;
  refresh_policy: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  status: string;
  notes: string | null;
}

export interface ReferenceData {
  lines: LineSummary[];
  stations: StationSummary[];
  paths: LinePathData[];
  disruptions: DisruptionSummary[];
  summary: NetworkSummary;
  statusesByLine: Map<string, LineCurrentStatus>;
  lineRows: LineRow[];
  stationRows: StationRow[];
  lastReferenceAt: string | null;
  lastStatusAt: string | null;
}

export async function loadReference(supabase: SupabaseClient): Promise<ReferenceData> {
  const [lineRows, statusRows, stationRows, pathRows, disruptionRows, lineStationRows] =
    await Promise.all([
      fetchAllRows<LineRow>(
        supabase,
        'lines',
        'id,name,mode_id,color_hex,text_color_hex,last_synced_at',
        { eq: { is_active: true }, order: { column: 'name' } },
      ),
      fetchAllRows<StatusRow>(
        supabase,
        'v_line_status_current',
        'line_id,captured_at,severity,severity_description,band,reason,category,validity_from,validity_to,is_now',
      ),
      fetchAllRows<StationRow>(
        supabase,
        'stations',
        'id,name,display_name,lat,lon,zone,modes,line_ids,step_free,step_free_source,has_lifts,has_escalators,has_toilets,has_wifi,has_parking,ticket_halls,facilities,last_synced_at',
        {
          eq: { is_active: true },
          in: { stop_type: ['NaptanMetroStation', 'NaptanRailStation'] },
          order: { column: 'display_name' },
        },
      ),
      fetchAllRows<PathRow>(
        supabase,
        'v_line_paths_geojson',
        'line_id,direction,branch_id,route_name,geometry,fetched_at',
      ),
      fetchAllRows<DisruptionRow>(
        supabase,
        'disruptions',
        'id,line_id,station_id,scope,category,type,category_description,summary,description,additional_info,closure_text,severity_level,validity_periods,starts_at,ends_at,affected_stops,affected_routes,first_seen_at,last_seen_at,is_active',
        { eq: { is_active: true }, order: { column: 'last_seen_at', ascending: false } },
      ),
      fetchAllRows<LineStationRow>(supabase, 'line_stations', 'line_id,station_id', {
        eq: { is_active: true },
      }),
    ]);

  const statusesByLine = new Map(statusRows.map((row) => [row.line_id, mapStatus(row)]));
  const disruptionCounts = new Map<string, number>();
  for (const disruption of disruptionRows) {
    if (!disruption.line_id) continue;
    disruptionCounts.set(disruption.line_id, (disruptionCounts.get(disruption.line_id) ?? 0) + 1);
  }

  const stationCounts = new Map<string, Set<string>>();
  for (const row of lineStationRows) {
    const set = stationCounts.get(row.line_id) ?? new Set<string>();
    set.add(row.station_id);
    stationCounts.set(row.line_id, set);
  }

  const lines = lineRows.map((row) =>
    mapLine(
      row,
      statusesByLine.get(row.id) ?? null,
      disruptionCounts.get(row.id) ?? 0,
      stationCounts.get(row.id)?.size ?? 0,
    ),
  );
  const stations = stationRows.map((row) => mapStation(row, statusesByLine));
  const paths = pathRows.map(mapPath).filter((path): path is LinePathData => path !== null);
  const disruptions = disruptionRows.map(mapDisruption);

  return {
    lines,
    stations,
    paths,
    disruptions,
    statusesByLine,
    lineRows,
    stationRows,
    summary: buildNetworkSummary(lines, disruptions, statusRows, stationRows.length),
    lastReferenceAt: maxIso([
      ...lineRows.map((row) => row.last_synced_at),
      ...stationRows.map((row) => row.last_synced_at),
    ]),
    lastStatusAt: maxIso(statusRows.map((row) => row.captured_at)),
  };
}

export function mapStatus(row: StatusRow): LineCurrentStatus {
  return {
    severity: row.severity ?? -1,
    description: row.severity_description ?? 'Sem informação',
    band: (row.band as StatusBand | null) ?? getStatusBand(row.severity),
    reason: row.reason,
    category: row.category,
    validityFrom: row.validity_from,
    validityTo: row.validity_to,
    isNow: row.is_now,
    capturedAt: row.captured_at,
  };
}

export function mapLine(
  row: LineRow,
  status: LineCurrentStatus | null,
  disruptionCount: number,
  stationCount: number,
): LineSummary {
  return {
    id: row.id,
    name: row.name,
    mode: row.mode_id,
    colorHex: row.color_hex,
    textColorHex: row.text_color_hex,
    status,
    disruptionCount,
    stationCount,
    updatedAt: status?.capturedAt ?? row.last_synced_at,
    dataQuality: status ? 'reported' : 'unknown',
  };
}

export function mapStation(
  row: StationRow,
  statusesByLine: Map<string, LineCurrentStatus>,
): StationSummary {
  const lineIds = row.line_ids ?? [];
  const status = deriveStationStatus(lineIds, statusesByLine);

  return {
    id: row.id,
    name: row.display_name || row.name,
    lat: row.lat,
    lon: row.lon,
    zone: row.zone,
    modes: row.modes ?? [],
    lineIds,
    stepFree: row.step_free,
    stepFreeSource: row.step_free_source,
    facilities: {
      lifts: facilityCount(row.facilities, 'Lifts') ?? (row.has_lifts === true ? 1 : null),
      escalators:
        facilityCount(row.facilities, 'Escalators') ?? (row.has_escalators === true ? 1 : null),
      toilets: row.has_toilets,
      wifi: row.has_wifi,
      parking: row.has_parking,
      ticketHalls: row.ticket_halls,
    },
    status,
    updatedAt: row.last_synced_at,
  };
}

function deriveStationStatus(
  lineIds: readonly string[],
  statusesByLine: Map<string, LineCurrentStatus>,
): StationSummary['status'] {
  const contributing = lineIds
    .map((lineId) => ({ lineId, status: statusesByLine.get(lineId) }))
    .filter(
      (entry): entry is { lineId: string; status: LineCurrentStatus } => entry.status !== undefined,
    );

  if (contributing.length === 0) return null;

  const sorted = sortStatusesBySeverity(contributing.map((entry) => entry.status));
  const worst = sorted[0]?.band ?? 'unknown';
  const label =
    worst === 'closure'
      ? 'Linha fechada'
      : worst === 'severe'
        ? 'Disrupção severa'
        : worst === 'attention'
          ? STATUS_BAND_LABELS.attention
          : worst === 'normal'
            ? 'Normal'
            : 'Sem informação';

  return {
    band: worst,
    label,
    derivedFromLineIds: contributing.map((entry) => entry.lineId),
    confidence: 'derived',
  };
}

export function mapPath(row: PathRow): LinePathData | null {
  const geometry = parseGeometry(row.geometry);
  if (!geometry) return null;
  const direction = row.direction === 'inbound' ? 'inbound' : 'outbound';
  return {
    lineId: row.line_id,
    direction,
    branchId: row.branch_id ?? 0,
    routeName: row.route_name,
    geometry,
    fetchedAt: row.fetched_at,
    derived: false,
  };
}

export function mapDisruption(row: DisruptionRow): DisruptionSummary {
  return {
    id: row.id,
    lineId: row.line_id,
    stationId: row.station_id,
    scope: row.scope === 'station' || row.scope === 'network' ? row.scope : 'line',
    category: row.category,
    type: row.type,
    categoryDescription: row.category_description,
    summary: row.summary,
    description: row.description,
    additionalInfo: row.additional_info,
    closureText: row.closure_text,
    severityLevel: row.severity_level,
    band: getStatusBand(row.severity_level),
    validityPeriods: Array.isArray(row.validity_periods) ? row.validity_periods : [],
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    affectedStops: Array.isArray(row.affected_stops) ? row.affected_stops : [],
    affectedRoutes: Array.isArray(row.affected_routes) ? row.affected_routes : [],
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    isActive: row.is_active,
  };
}

export function buildNetworkSummary(
  lines: readonly LineSummary[],
  disruptions: readonly DisruptionSummary[],
  statusRows: readonly StatusRow[],
  stationsTotal: number,
): NetworkSummary {
  const counts: Record<StatusBand, number> = {
    normal: 0,
    attention: 0,
    severe: 0,
    closure: 0,
    unknown: 0,
  };
  for (const line of lines) {
    counts[line.status?.band ?? 'unknown'] += 1;
  }

  const affectedStops = new Set<string>();
  for (const disruption of disruptions) {
    for (const stop of disruption.affectedStops as Array<Record<string, unknown>>) {
      const id = String(stop.id ?? stop.naptanId ?? '');
      if (id) affectedStops.add(id);
    }
  }

  return {
    linesTotal: lines.length,
    stationsTotal,
    normal: counts.normal,
    attention: counts.attention,
    severe: counts.severe,
    closure: counts.closure,
    unknown: counts.unknown,
    disruptionsActive: disruptions.length,
    stationsAffected: affectedStops.size > 0 ? affectedStops.size : null,
    lastCapturedAt: maxIso(statusRows.map((row) => row.captured_at)),
  };
}

export function maxIso(values: ReadonlyArray<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!max || Date.parse(value) > Date.parse(max)) max = value;
  }
  return max;
}

function facilityCount(facilities: Record<string, string> | null, key: string): number | null {
  const raw = facilities?.[key];
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseGeometry(value: unknown): GeoJSONLineString | GeoJSONMultiLineString | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = parsed as { type?: string; coordinates?: unknown };
  if (candidate.type === 'LineString' && Array.isArray(candidate.coordinates)) {
    return parsed as GeoJSONLineString;
  }
  if (candidate.type === 'MultiLineString' && Array.isArray(candidate.coordinates)) {
    return parsed as GeoJSONMultiLineString;
  }
  return null;
}

export function statusRank(band: StatusBand): number {
  return getStatusBandRank(band);
}
