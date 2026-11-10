import type {
  TfLAdditionalProperty,
  TfLDisruption,
  TfLMatchedStop,
  TfLStopPoint,
  TfLValidityPeriod,
} from '../../../shared/src/types/tfl.ts';
import {
  cleanStationName,
  countFrom,
  facilitiesFrom,
  isYes,
  toIsoOrNull,
  uniqueSorted,
} from './utils.ts';
import type { DisruptionUpsert, StationUpsert } from './types.ts';

export function stationFromStopPoint(
  stop: TfLStopPoint,
  lineId: string,
  syncedAt: string,
): StationUpsert | null {
  // Hubs são transport interchanges, não estações canónicas.
  if (stop.stopType === 'TransportInterchange') return null;
  if (typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return null;

  // Tram devolve plataformas (NaptanMetroPlatform); stationNaptan aponta
  // para a estação canónica (NaptanMetroStation).
  const canonicalId =
    stop.stopType === 'NaptanMetroPlatform' ? (stop.stationNaptan ?? stop.naptanId) : stop.naptanId;

  const facilities = facilitiesFrom(stop.additionalProperties);
  const zone = stop.zone ?? facilities.Zone ?? null;
  const lifts = countFrom(facilities.Lifts);
  const escalators = countFrom(facilities.Escalators);
  const accessViaLift = isYes(facilities.AccessViaLift);
  const hasLifts = lifts !== null ? lifts > 0 || accessViaLift === true : accessViaLift;

  return {
    id: canonicalId,
    name: stop.commonName,
    display_name: cleanStationName(stop.commonName),
    stop_type: stop.stopType ?? null,
    lat: stop.lat,
    lon: stop.lon,
    zone,
    modes: uniqueSorted(stop.modes ?? []),
    line_ids: [lineId],
    accessibility_summary: stop.accessibilitySummary ?? null,
    step_free: null,
    step_free_source: null,
    has_lifts: hasLifts,
    has_escalators: escalators !== null ? escalators > 0 : null,
    has_toilets: isYes(facilities.Toilets ?? facilities.Toilet),
    has_wifi: isYes(facilities.WiFi),
    has_parking: isYes(facilities['Car park']),
    ticket_halls: countFrom(facilities['Ticket Halls']),
    facilities,
    hub_naptan_code:
      stop.hubNaptanCode ??
      (stop.stationNaptan?.startsWith('HUB') ? stop.stationNaptan : null) ??
      null,
    ics_code: stop.icsCode ?? null,
    is_active: true,
    last_synced_at: syncedAt,
  };
}

export function stationFromMatchedStop(
  stop: TfLMatchedStop,
  lineId: string,
  syncedAt: string,
): StationUpsert | null {
  // A lista `stations` pode incluir hubs de interchange; as paradas reais
  // estão em stopPointSequences e têm stationId próprio.
  if (stop.stopType === 'TransportInterchange') return null;
  const id = stop.stationId ?? stop.id;
  if (!id || typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return null;

  const name = stop.name ?? id;
  return {
    id,
    name,
    display_name: cleanStationName(name),
    stop_type: stop.stopType ?? null,
    lat: stop.lat,
    lon: stop.lon,
    zone: stop.zone ?? null,
    modes: uniqueSorted(stop.modes ?? []),
    line_ids: [lineId],
    accessibility_summary: stop.accessibilitySummary ?? null,
    step_free: null,
    step_free_source: null,
    has_lifts: null,
    has_escalators: null,
    has_toilets: null,
    has_wifi: null,
    has_parking: null,
    ticket_halls: null,
    facilities: {},
    hub_naptan_code: stop.topMostParentId?.startsWith('HUB') ? stop.topMostParentId : null,
    ics_code: stop.icsId ?? null,
    is_active: true,
    last_synced_at: syncedAt,
  };
}

/** Mescla dois registos da mesma estação sem perder facilities. */
export function mergeStation(base: StationUpsert, incoming: StationUpsert): StationUpsert {
  return {
    ...base,
    name: incoming.name || base.name,
    display_name: incoming.display_name || base.display_name,
    stop_type: incoming.stop_type ?? base.stop_type,
    zone: incoming.zone ?? base.zone,
    modes: uniqueSorted([...base.modes, ...incoming.modes]),
    line_ids: uniqueSorted([...base.line_ids, ...incoming.line_ids]),
    accessibility_summary: incoming.accessibility_summary ?? base.accessibility_summary,
    has_lifts: incoming.has_lifts ?? base.has_lifts,
    has_escalators: incoming.has_escalators ?? base.has_escalators,
    has_toilets: incoming.has_toilets ?? base.has_toilets,
    has_wifi: incoming.has_wifi ?? base.has_wifi,
    has_parking: incoming.has_parking ?? base.has_parking,
    ticket_halls: incoming.ticket_halls ?? base.ticket_halls,
    facilities: { ...base.facilities, ...incoming.facilities },
    hub_naptan_code: incoming.hub_naptan_code ?? base.hub_naptan_code,
    ics_code: incoming.ics_code ?? base.ics_code,
  };
}

export interface DisruptionInput {
  disruption: TfLDisruption;
  lineId: string | null;
  stationId: string | null;
  severityLevel: number | null;
  validityPeriods: TfLValidityPeriod[];
  scope: 'line' | 'station' | 'network';
  seenAt: string;
  id: string;
}

export function disruptionFromTfL(input: DisruptionInput): DisruptionUpsert {
  const validity = input.validityPeriods
    .map((period) => ({
      fromDate: toIsoOrNull(period.fromDate),
      toDate: toIsoOrNull(period.toDate),
      isNow: period.isNow ?? null,
    }))
    .filter((period) => period.fromDate || period.toDate);

  const startsAt =
    validity
      .map((period) => period.fromDate)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  const endsAt =
    validity
      .map((period) => period.toDate)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    id: input.id,
    line_id: input.lineId,
    station_id: input.stationId,
    scope: input.scope,
    category: input.disruption.category ?? null,
    type: input.disruption.type ?? null,
    category_description: input.disruption.categoryDescription ?? null,
    summary: input.disruption.summary ?? null,
    description: input.disruption.description ?? null,
    additional_info: input.disruption.additionalInfo ?? null,
    closure_text: input.disruption.closureText ?? null,
    severity_level: input.severityLevel,
    validity_periods: validity,
    starts_at: startsAt,
    ends_at: endsAt,
    affected_stops: input.disruption.affectedStops ?? [],
    affected_routes: input.disruption.affectedRoutes ?? [],
    source_created_at: toIsoOrNull(input.disruption.created),
    source_updated_at: toIsoOrNull(input.disruption.lastUpdate),
    last_seen_at: input.seenAt,
    is_active: true,
  };
}

export function additionalPropertyMap(
  properties: readonly TfLAdditionalProperty[] | undefined,
): Record<string, string> {
  return facilitiesFrom(properties);
}
