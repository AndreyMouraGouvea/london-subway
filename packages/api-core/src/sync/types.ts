export interface StationUpsert {
  id: string;
  name: string;
  display_name: string;
  stop_type: string | null;
  lat: number;
  lon: number;
  zone: string | null;
  modes: string[];
  line_ids: string[];
  accessibility_summary: string | null;
  step_free: boolean | null;
  step_free_source: string | null;
  has_lifts: boolean | null;
  has_escalators: boolean | null;
  has_toilets: boolean | null;
  has_wifi: boolean | null;
  has_parking: boolean | null;
  ticket_halls: number | null;
  facilities: Record<string, string>;
  hub_naptan_code: string | null;
  ics_code: string | null;
  is_active: boolean;
  last_synced_at: string;
}

export interface StationEntranceUpsert {
  id: string;
  station_id: string;
  name: string | null;
  stop_type: string | null;
  lat: number;
  lon: number;
  is_active: boolean;
  last_synced_at: string;
}

export interface LineStationUpsert {
  line_id: string;
  station_id: string;
  direction: 'inbound' | 'outbound';
  branch_id: number;
  sequence: number;
  service_type: string;
  route_name: string | null;
  is_active: boolean;
  last_synced_at: string;
}

export interface LineStatusUpsert {
  snapshot_key: string;
  line_id: string;
  captured_at: string;
  severity: number | null;
  severity_description: string | null;
  band: string;
  reason: string | null;
  category: string | null;
  validity_from: string | null;
  validity_to: string | null;
  is_now: boolean | null;
  is_primary: boolean;
  source_modified_at: string | null;
}

export interface NetworkSnapshotUpsert {
  snapshot_key: string;
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

export interface DisruptionUpsert {
  id: string;
  line_id: string | null;
  station_id: string | null;
  scope: 'line' | 'station' | 'network';
  category: string | null;
  type: string | null;
  category_description: string | null;
  summary: string | null;
  description: string | null;
  additional_info: string | null;
  closure_text: string | null;
  severity_level: number | null;
  validity_periods: unknown[];
  starts_at: string | null;
  ends_at: string | null;
  affected_stops: unknown[];
  affected_routes: unknown[];
  source_created_at: string | null;
  source_updated_at: string | null;
  last_seen_at: string;
  is_active: boolean;
}

export interface SyncCounters {
  read: number;
  upserted: number;
  warnings: string[];
}

export function createCounters(): SyncCounters {
  return { read: 0, upserted: 0, warnings: [] };
}
