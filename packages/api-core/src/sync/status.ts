import type { SupabaseClient } from '@supabase/supabase-js';
import { getStatusBand, selectPrimaryStatus } from '../../../shared/src/index.ts';
import type { SyncResult } from '../../../shared/src/types/api.ts';
import type { TfLLine, TfLLineStatus } from '../../../shared/src/types/tfl.ts';
import type { TfLClient } from '../tfl/client.ts';
import { ApiHttpError } from '../errors.ts';
import {
  fetchAllRows,
  finishSyncJob,
  markSourceFailure,
  markSourceSuccess,
  startSyncJob,
} from '../db.ts';
import type { LineStatusUpsert, NetworkSnapshotUpsert } from './types.ts';
import { minutesSince, sha256Hex, toIsoOrNull } from './utils.ts';

export interface SyncStatusResult extends SyncResult {
  lines: number;
  snapshotsInserted: number;
}

interface CurrentStatusRow {
  line_id: string;
  captured_at: string;
  severity: number | null;
  severity_description: string | null;
  band: string;
  reason: string | null;
}

export async function syncStatus(deps: {
  supabase: SupabaseClient;
  tfl: TfLClient;
  now?: Date;
}): Promise<SyncStatusResult> {
  const { supabase, tfl } = deps;
  const now = deps.now ?? new Date();
  const job = await startSyncJob(supabase, 'sync-status', 'api');
  let read = 0;
  let upserted = 0;
  const warnings: string[] = [];

  try {
    const response = await tfl.getLineStatusByMode();
    read = response.data.length;
    const capturedAt = response.fetchedAt;

    const currentRows = await fetchAllRows<CurrentStatusRow>(
      supabase,
      'v_line_status_current',
      'line_id,captured_at,severity,severity_description,band,reason',
    );
    const currentByLine = new Map(currentRows.map((row) => [row.line_id, row]));

    const statusRows: LineStatusUpsert[] = [];
    for (const line of response.data) {
      const row = await buildStatusRow(line, capturedAt, currentByLine.get(line.id), now);
      if (row) statusRows.push(row);
    }

    if (statusRows.length > 0) {
      const { error } = await supabase
        .from('line_status_snapshots')
        .upsert(statusRows, { onConflict: 'snapshot_key', ignoreDuplicates: true });
      if (error) {
        throw new ApiHttpError(500, 'database_error', error.message);
      }
      upserted += statusRows.length;
    }

    const networkSnapshot = await buildNetworkSnapshot(response.data, capturedAt, now);
    const { error: networkError } = await supabase
      .from('network_status_snapshots')
      .upsert(networkSnapshot, { onConflict: 'snapshot_key', ignoreDuplicates: true });
    if (networkError) {
      throw new ApiHttpError(500, 'database_error', networkError.message);
    }
    upserted += 1;

    // Agrega as últimas horas em buckets horários (tabelas particionadas).
    // Uma falha aqui não invalida o snapshot em bruto: fica como aviso.
    const { error: rollupError } = await supabase.rpc('ldt_rollup_status_hourly', {
      p_hours: 6,
    });
    if (rollupError) {
      warnings.push(`hourly_rollup_failed: ${rollupError.message}`);
    }

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
      lines: response.data.length,
      snapshotsInserted: statusRows.length,
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

async function buildStatusRow(
  line: TfLLine,
  capturedAt: string,
  previous: CurrentStatusRow | undefined,
  now: Date,
): Promise<LineStatusUpsert | null> {
  const candidates = (line.lineStatuses ?? []).map((status) => ({
    status,
    severity: status.statusSeverity ?? null,
    description: status.statusSeverityDescription ?? null,
    reason: normalizeText(status.reason),
    band: getStatusBand(status.statusSeverity),
    isNow: status.validityPeriods?.some((period) => period.isNow === true) ?? null,
  }));

  const primary = selectPrimaryStatus(
    candidates.map((candidate) => ({
      severity: candidate.severity ?? -1,
      description: candidate.description ?? 'Sem informação',
      reason: candidate.reason,
      band: candidate.band,
      isNow: candidate.isNow,
      original: candidate,
    })),
  );
  const selected: (typeof candidates)[number] | undefined = primary?.original ?? candidates[0];

  const severity = selected?.severity ?? null;
  const description = selected?.description ?? 'Sem informação';
  const band = selected?.band ?? 'unknown';
  const reason = selected?.reason ?? null;
  const validity = selected?.status.validityPeriods ?? [];
  const validityFrom = toIsoOrNull(validity.find((period) => period.fromDate)?.fromDate);
  const validityTo = toIsoOrNull(validity.find((period) => period.toDate)?.toDate);

  const sameAsPrevious =
    previous &&
    previous.severity === severity &&
    previous.severity_description === description &&
    previous.band === band &&
    previous.reason === reason;
  const ageMinutes = minutesSince(previous?.captured_at, now.getTime());
  const heartbeatDue = ageMinutes === null || ageMinutes >= 5;
  if (sameAsPrevious && !heartbeatDue) return null;

  const bucket = Math.floor(now.getTime() / 300_000);
  const snapshotKey = await sha256Hex(
    [
      line.id,
      severity ?? 'null',
      description,
      reason ?? '',
      validityFrom ?? '',
      validityTo ?? '',
      bucket,
    ].join('|'),
  );

  return {
    snapshot_key: snapshotKey,
    line_id: line.id,
    captured_at: capturedAt,
    severity,
    severity_description: description,
    band,
    reason,
    category: selected?.status.disruption?.category ?? null,
    validity_from: validityFrom,
    validity_to: validityTo,
    is_now: selected?.isNow ?? null,
    is_primary: true,
    source_modified_at: toIsoOrNull(line.modified),
  };
}

async function buildNetworkSnapshot(
  lines: readonly TfLLine[],
  capturedAt: string,
  now: Date,
): Promise<NetworkSnapshotUpsert> {
  const counts = {
    normal: 0,
    attention: 0,
    severe: 0,
    closure: 0,
    unknown: 0,
  };
  const disruptions = new Set<string>();
  const affectedStops = new Set<string>();
  const linePayload: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    const status = selectLineStatus(line);
    const band = status ? getStatusBand(status.statusSeverity) : 'unknown';
    counts[band] += 1;

    for (const disruption of line.disruptions ?? []) {
      if (disruption.description) disruptions.add(disruption.description);
      for (const stop of disruption.affectedStops ?? []) {
        const id = stop.id ?? stop.naptanId;
        if (id) affectedStops.add(id);
      }
    }
    for (const lineStatus of line.lineStatuses ?? []) {
      if (lineStatus.disruption?.description) {
        disruptions.add(lineStatus.disruption.description);
      }
      for (const stop of lineStatus.disruption?.affectedStops ?? []) {
        const id = stop.id ?? stop.naptanId;
        if (id) affectedStops.add(id);
      }
    }

    linePayload.push({
      id: line.id,
      name: line.name,
      mode: line.modeName,
      severity: status?.statusSeverity ?? null,
      description: status?.statusSeverityDescription ?? null,
      band,
    });
  }

  const bucket = Math.floor(now.getTime() / 60_000);
  const snapshotKey = await sha256Hex(`network|${bucket}`);

  return {
    snapshot_key: snapshotKey,
    captured_at: capturedAt,
    lines_total: lines.length,
    lines_normal: counts.normal,
    lines_attention: counts.attention,
    lines_severe: counts.severe,
    lines_closed: counts.closure,
    lines_unknown: counts.unknown,
    disruptions_active: disruptions.size,
    stations_affected: affectedStops.size > 0 ? affectedStops.size : null,
    payload: { lines: linePayload },
  };
}

function selectLineStatus(line: TfLLine): TfLLineStatus | null {
  const statuses = line.lineStatuses ?? [];
  if (statuses.length === 0) return null;
  const primary = selectPrimaryStatus(
    statuses.map((status) => ({
      severity: status.statusSeverity ?? -1,
      description: status.statusSeverityDescription ?? 'Sem informação',
      reason: status.reason ?? null,
      band: getStatusBand(status.statusSeverity),
      isNow: status.validityPeriods?.some((period) => period.isNow === true) ?? null,
      original: status,
    })),
  );
  return primary?.original ?? null;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
