import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LINE_BRANDING_BY_ID,
  OVERGROUND_FALLBACK_COLOR,
  TFL_MODES,
  getStatusBand,
} from '../../../shared/src/index.ts';
import type { SyncResult } from '../../../shared/src/types/api.ts';
import type { TfLLine, TfLStopPoint } from '../../../shared/src/types/tfl.ts';
import type { TfLClient } from '../tfl/client.ts';
import { ApiHttpError } from '../errors.ts';
import { chunk, finishSyncJob, markSourceFailure, markSourceSuccess, startSyncJob } from '../db.ts';
import { mergeStation, stationFromMatchedStop, stationFromStopPoint } from './normalize.ts';
import type {
  LineStationUpsert,
  StationEntranceUpsert,
  StationUpsert,
  SyncCounters,
} from './types.ts';
import { createCounters } from './types.ts';
import { mapWithConcurrency, parseLineStrings, uniqueSorted } from './utils.ts';

export interface SyncDependencies {
  supabase: SupabaseClient;
  tfl: TfLClient;
  now?: Date;
}

interface LineFetchResult {
  line: TfLLine;
  route: Awaited<ReturnType<TfLClient['getRouteSequence']>>;
  stops: Awaited<ReturnType<TfLClient['getLineStopPoints']>>;
}

export async function syncReference(deps: SyncDependencies): Promise<SyncResult> {
  const { supabase, tfl } = deps;
  const now = deps.now ?? new Date();
  const syncedAt = now.toISOString();
  const job = await startSyncJob(supabase, 'sync-reference', 'api');
  const counters = createCounters();
  let fatal: unknown = null;

  try {
    const [modesResponse, severityResponse, linesResponse] = await Promise.all([
      tfl.getModes(),
      tfl.getSeverityLevels(),
      tfl.getLinesByMode(),
    ]);

    counters.read += modesResponse.data.length + severityResponse.data.length;
    const targetModes = new Set<string>(TFL_MODES);

    const modeRows = modesResponse.data
      .filter((mode) => targetModes.has(mode.modeName))
      .map((mode) => ({
        id: mode.modeName,
        name: mode.modeName,
        is_tfl_service: mode.isTflService ?? null,
        is_fare_paying: mode.isFarePaying ?? null,
        is_scheduled_service: mode.isScheduledService ?? null,
      }));
    counters.upserted += await upsertRows(supabase, 'modes', modeRows, 'id');

    const severityRows = severityResponse.data
      .filter((level) => targetModes.has(level.modeName))
      .map((level) => ({
        mode_name: level.modeName,
        severity_level: level.severityLevel,
        description: level.description,
        band: getStatusBand(level.severityLevel),
      }));
    counters.upserted += await upsertRows(
      supabase,
      'severity_levels',
      severityRows,
      'mode_name,severity_level',
    );

    const lines = linesResponse.data.filter((line) => targetModes.has(line.modeName));
    const lineRows = lines.map((line) => {
      const branding = LINE_BRANDING_BY_ID[line.id];
      const fallback = line.modeName === 'overground' ? OVERGROUND_FALLBACK_COLOR : null;
      return {
        id: line.id,
        name: line.name,
        mode_id: line.modeName,
        color_hex: branding?.colorHex ?? fallback,
        text_color_hex: branding?.textColorHex ?? (fallback ? '#000000' : null),
        color_source: branding ? 'TfL Colour Standard, Issue 11 (Aug 2026)' : null,
        color_source_url: branding ? 'https://content.tfl.gov.uk/tfl-colour-standard.pdf' : null,
        is_active: true,
        last_synced_at: syncedAt,
      };
    });
    counters.upserted += await upsertRows(supabase, 'lines', lineRows, 'id');

    const lineResults = await mapWithConcurrency(
      lines,
      2,
      async (line): Promise<LineFetchResult | null> => {
        try {
          const [route, stops] = await Promise.all([
            tfl.getRouteSequence(line.id, 'outbound'),
            tfl.getLineStopPoints(line.id),
          ]);
          counters.read += 1 + stops.data.length + (route.data.stations?.length ?? 0);
          return { line, route, stops };
        } catch (error) {
          counters.warnings.push(
            `Falha ao obter topologia de ${line.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return null;
        }
      },
    );

    const stationMap = new Map<string, StationUpsert>();
    const entranceMap = new Map<string, StationEntranceUpsert>();

    for (const result of lineResults) {
      if (!result) continue;
      const { line, route, stops } = result;
      const lineId = line.id;

      for (const stop of stops.data) {
        const station = stationFromStopPoint(stop, lineId, syncedAt);
        addStation(stationMap, station);
        if (!station) continue;

        for (const childRaw of stop.children ?? []) {
          const child = childRaw as unknown as TfLStopPoint;
          if (!child.id || typeof child.lat !== 'number' || typeof child.lon !== 'number') {
            continue;
          }
          entranceMap.set(child.id, {
            id: child.id,
            station_id: station.id,
            name: child.commonName ?? null,
            stop_type: child.stopType ?? null,
            lat: child.lat,
            lon: child.lon,
            is_active: true,
            last_synced_at: syncedAt,
          });
        }
      }

      for (const stop of route.data.stations ?? []) {
        addStation(stationMap, stationFromMatchedStop(stop, lineId, syncedAt));
      }

      for (const sequence of route.data.stopPointSequences ?? []) {
        for (const stop of sequence.stopPoint ?? []) {
          addStation(stationMap, stationFromMatchedStop(stop, lineId, syncedAt));
        }
      }
    }

    // Entradas com coordenadas mais precisas são enriquecidas on-demand em
    // GET /stations/:id para não multiplicar chamadas no sync de referência.
    const stationRows = [...stationMap.values()].map((station) => ({
      ...station,
      line_ids: uniqueSorted(station.line_ids),
    }));
    counters.upserted += await upsertRows(supabase, 'stations', stationRows, 'id', 100);
    counters.upserted += await upsertRows(
      supabase,
      'station_entrances',
      [...entranceMap.values()],
      'id',
      200,
    );

    const lineStationRows: LineStationUpsert[] = [];
    const pathWarnings: string[] = [];

    for (const result of lineResults) {
      if (!result) continue;
      const { line, route } = result;
      const lineId = line.id;
      const sequences = route.data.stopPointSequences ?? [];

      if (sequences.length > 0) {
        for (const sequence of sequences) {
          const branchId = sequence.branchId ?? 0;
          const serviceType = sequence.serviceType ?? 'Regular';
          (sequence.stopPoint ?? []).forEach((stop, index) => {
            const stationId = stop.stationId ?? stop.id;
            if (!stationId || !stationMap.has(stationId)) return;
            lineStationRows.push({
              line_id: lineId,
              station_id: stationId,
              direction: 'outbound',
              branch_id: branchId,
              sequence: index,
              service_type: serviceType,
              route_name: null,
              is_active: true,
              last_synced_at: syncedAt,
            });
          });
        }
      } else if (route.data.stations?.length) {
        route.data.stations.forEach((stop, index) => {
          const stationId = stop.stationId ?? stop.id;
          if (!stationId || !stationMap.has(stationId)) return;
          lineStationRows.push({
            line_id: lineId,
            station_id: stationId,
            direction: 'outbound',
            branch_id: 0,
            sequence: index,
            service_type: 'Regular',
            route_name: null,
            is_active: true,
            last_synced_at: syncedAt,
          });
        });
      }

      const geometry = parseLineStrings(route.data.lineStrings);
      if (!geometry) {
        pathWarnings.push(`Sem geometria para ${lineId} (outbound).`);
        continue;
      }

      const { error } = await supabase.rpc('upsert_line_path', {
        p_line_id: lineId,
        p_direction: 'outbound',
        p_branch_id: 0,
        p_route_name: null,
        p_geojson: geometry,
      });
      if (error) {
        pathWarnings.push(`Falha ao guardar geometria de ${lineId}: ${error.message}`);
      } else {
        counters.upserted += 1;
      }
    }

    counters.upserted += await upsertRows(
      supabase,
      'line_stations',
      dedupeLineStations(lineStationRows),
      'line_id,station_id,direction,branch_id,service_type',
      500,
    );

    counters.warnings.push(...pathWarnings);
    await markSourceSuccess(supabase, 'tfl-unified-api');
  } catch (error) {
    fatal = error;
    await markSourceFailure(supabase, 'tfl-unified-api');
  }

  const finished = await finishAndReturn(supabase, job, counters, fatal);
  if (fatal) throw fatal;
  return finished;
}

function addStation(map: Map<string, StationUpsert>, station: StationUpsert | null): void {
  if (!station) return;
  const existing = map.get(station.id);
  if (!existing) {
    map.set(station.id, station);
    return;
  }
  map.set(station.id, mergeStation(existing, station));
}

function dedupeLineStations(rows: readonly LineStationUpsert[]): LineStationUpsert[] {
  const map = new Map<string, LineStationUpsert>();
  for (const row of rows) {
    const key = `${row.line_id}|${row.station_id}|${row.direction}|${row.branch_id}|${row.service_type}`;
    map.set(key, row);
  }
  return [...map.values()];
}

async function upsertRows<T extends object>(
  supabase: SupabaseClient,
  table: string,
  rows: readonly T[],
  onConflict: string,
  batchSize = 100,
): Promise<number> {
  let upserted = 0;
  for (const batch of chunk(rows, batchSize)) {
    if (batch.length === 0) continue;
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      throw new ApiHttpError(500, 'database_error', `${table}: ${error.message}`, {
        table,
        code: error.code,
      });
    }
    upserted += batch.length;
  }
  return upserted;
}

async function finishAndReturn(
  supabase: SupabaseClient,
  job: Awaited<ReturnType<typeof startSyncJob>>,
  counters: SyncCounters,
  fatal: unknown,
): Promise<SyncResult> {
  const finishedAt = new Date().toISOString();
  const status = fatal ? 'failed' : counters.warnings.length > 0 ? 'partial' : 'success';
  await finishSyncJob(supabase, job, {
    status,
    recordsRead: counters.read,
    recordsUpserted: counters.upserted,
    warnings: counters.warnings,
    error: fatal,
  });

  return {
    jobId: job.id,
    jobName: job.jobName,
    status,
    startedAt: job.startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(job.startedAt),
    recordsRead: counters.read,
    recordsUpserted: counters.upserted,
    warnings: counters.warnings,
  };
}
