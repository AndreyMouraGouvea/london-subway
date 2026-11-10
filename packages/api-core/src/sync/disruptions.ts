import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncResult } from '../../../shared/src/types/api.ts';
import type { TfLDisruption } from '../../../shared/src/types/tfl.ts';
import type { TfLClient } from '../tfl/client.ts';
import { ApiHttpError } from '../errors.ts';
import {
  chunk,
  fetchAllRows,
  finishSyncJob,
  markSourceFailure,
  markSourceSuccess,
  startSyncJob,
} from '../db.ts';
import { disruptionFromTfL } from './normalize.ts';
import type { DisruptionUpsert } from './types.ts';
import { sha256Hex } from './utils.ts';

export interface SyncDisruptionsResult extends SyncResult {
  disruptions: number;
  affectedStationLinks: number;
}

interface StationIdRow {
  id: string;
}

export async function syncDisruptions(deps: {
  supabase: SupabaseClient;
  tfl: TfLClient;
  now?: Date;
}): Promise<SyncDisruptionsResult> {
  const { supabase, tfl } = deps;
  const now = deps.now ?? new Date();
  const job = await startSyncJob(supabase, 'sync-disruptions', 'api');
  let read = 0;
  let upserted = 0;
  const warnings: string[] = [];

  try {
    const [modeDisruptions, statusResponse] = await Promise.all([
      tfl.getModeDisruptions(),
      tfl.getLineStatusByMode(),
    ]);
    read = modeDisruptions.data.length + statusResponse.data.length;
    const seenAt = statusResponse.fetchedAt;

    const rows = new Map<string, DisruptionUpsert>();
    const severityByLine = new Map<string, number>();

    for (const line of statusResponse.data) {
      for (const status of line.lineStatuses ?? []) {
        if (typeof status.statusSeverity === 'number') {
          severityByLine.set(line.id, status.statusSeverity);
        }
        if (!status.disruption) continue;
        const row = await buildDisruptionRow(
          status.disruption,
          line.id,
          null,
          status.statusSeverity ?? null,
          status.validityPeriods ?? [],
          'line',
          seenAt,
        );
        rows.set(row.id, row);
      }

      for (const disruption of line.disruptions ?? []) {
        const row = await buildDisruptionRow(
          disruption,
          line.id,
          null,
          severityByLine.get(line.id) ?? null,
          [],
          'line',
          seenAt,
        );
        rows.set(row.id, row);
      }
    }

    for (const disruption of modeDisruptions.data) {
      const lineId = disruption.affectedRoutes?.find((route) => route.id)?.id ?? null;
      const row = await buildDisruptionRow(
        disruption,
        lineId,
        null,
        lineId ? (severityByLine.get(lineId) ?? null) : null,
        [],
        lineId ? 'line' : 'network',
        seenAt,
      );
      rows.set(row.id, row);
    }

    const disruptionRows = [...rows.values()];
    for (const batch of chunk(disruptionRows, 100)) {
      const { error } = await supabase.from('disruptions').upsert(batch, { onConflict: 'id' });
      if (error) throw new ApiHttpError(500, 'database_error', error.message);
      upserted += batch.length;
    }

    const stationIds = new Set(
      (await fetchAllRows<StationIdRow>(supabase, 'stations', 'id')).map((row) => row.id),
    );
    const links = new Map<string, { disruption_id: string; station_id: string }>();
    for (const row of disruptionRows) {
      for (const stop of row.affected_stops as Array<Record<string, unknown>>) {
        const stationId = String(stop.id ?? stop.naptanId ?? '');
        if (!stationId || !stationIds.has(stationId)) continue;
        links.set(`${row.id}|${stationId}`, {
          disruption_id: row.id,
          station_id: stationId,
        });
      }
    }
    for (const batch of chunk([...links.values()], 500)) {
      const { error } = await supabase
        .from('disruption_affected_stations')
        .upsert(batch, { onConflict: 'disruption_id,station_id', ignoreDuplicates: true });
      if (error) throw new ApiHttpError(500, 'database_error', error.message);
      upserted += batch.length;
    }

    // Disrupções que deixaram de aparecer há mais de 10 minutos ficam inativas.
    const cutoff = new Date(now.getTime() - 10 * 60_000).toISOString();
    await supabase
      .from('disruptions')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('last_seen_at', cutoff);

    await markSourceSuccess(supabase, 'tfl-unified-api');
    const finishedAt = new Date().toISOString();
    await finishSyncJob(supabase, job, {
      status: warnings.length > 0 ? 'partial' : 'success',
      recordsRead: read,
      recordsUpserted: upserted,
      warnings,
    });

    return {
      jobId: job.id,
      jobName: job.jobName,
      status: warnings.length > 0 ? 'partial' : 'success',
      startedAt: job.startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(job.startedAt),
      recordsRead: read,
      recordsUpserted: upserted,
      warnings,
      disruptions: disruptionRows.length,
      affectedStationLinks: links.size,
    };
  } catch (error) {
    await markSourceFailure(supabase, 'tfl-unified-api');
    await finishSyncJob(supabase, job, {
      status: 'failed',
      recordsRead: read,
      recordsUpserted: upserted,
      warnings,
      error,
    });
    throw error;
  }
}

async function buildDisruptionRow(
  disruption: TfLDisruption,
  lineId: string | null,
  stationId: string | null,
  severityLevel: number | null,
  validityPeriods: Array<{ fromDate?: string; toDate?: string; isNow?: boolean }>,
  scope: 'line' | 'station' | 'network',
  seenAt: string,
): Promise<DisruptionUpsert> {
  const affectedStops = disruption.affectedStops ?? [];
  const stopIds = affectedStops
    .map((stop) => stop.id ?? stop.naptanId ?? '')
    .filter(Boolean)
    .sort();
  const id = await sha256Hex(
    [
      lineId ?? '',
      stationId ?? '',
      scope,
      disruption.category ?? '',
      disruption.type ?? '',
      disruption.description ?? '',
      stopIds.join(','),
    ].join('|'),
  );

  return disruptionFromTfL({
    disruption,
    lineId,
    stationId,
    severityLevel,
    validityPeriods,
    scope,
    seenAt,
    id,
  });
}
