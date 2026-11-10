import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetentionPolicy, SyncResult } from '../../../shared/src/types/api.ts';
import { finishSyncJob, startSyncJob } from '../db.ts';
import { ApiHttpError } from '../errors.ts';

export const RETENTION_DEFAULTS: RetentionPolicy = {
  arrivalPredictionsHours: 24,
  cacheStaleHours: 48,
  statusSnapshotsDays: 90,
  syncJobsDays: 30,
};

export interface SyncCleanupResult extends SyncResult {
  deleted: {
    arrivalPredictions: number;
    expiredCache: number;
    lineStatusSnapshots: number;
    networkStatusSnapshots: number;
    syncJobs: number;
    hourlyPartitionsDropped: number;
  };
}

/**
 * Retenção executada na base de dados (função `ldt_apply_retention`): apaga
 * snapshots/cache/jobs antigos e faz drop das partições horárias que saíram
 * da janela. Uma única chamada RPC evita vários round-trips e mantém a regra
 * de retenção num só lugar.
 */
export async function syncCleanup(deps: {
  supabase: SupabaseClient;
  now?: Date;
  retention?: Partial<RetentionPolicy>;
}): Promise<SyncCleanupResult> {
  const { supabase } = deps;
  const job = await startSyncJob(supabase, 'cleanup', 'api');
  const retention: RetentionPolicy = {
    arrivalPredictionsHours:
      deps.retention?.arrivalPredictionsHours ?? RETENTION_DEFAULTS.arrivalPredictionsHours,
    cacheStaleHours: deps.retention?.cacheStaleHours ?? RETENTION_DEFAULTS.cacheStaleHours,
    statusSnapshotsDays:
      deps.retention?.statusSnapshotsDays ?? RETENTION_DEFAULTS.statusSnapshotsDays,
    syncJobsDays: deps.retention?.syncJobsDays ?? RETENTION_DEFAULTS.syncJobsDays,
  };

  try {
    const { data, error } = await supabase.rpc('ldt_apply_retention', {
      p_status_days: retention.statusSnapshotsDays,
      p_jobs_days: retention.syncJobsDays,
      p_cache_hours: retention.cacheStaleHours,
      p_arrivals_hours: retention.arrivalPredictionsHours,
    });
    if (error) {
      throw new ApiHttpError(500, 'database_error', error.message);
    }

    const counts = (data ?? {}) as Record<string, unknown>;
    const deleted = {
      arrivalPredictions: toCount(counts.arrivalPredictions),
      expiredCache: toCount(counts.expiredCache),
      lineStatusSnapshots: toCount(counts.lineStatusSnapshots),
      networkStatusSnapshots: toCount(counts.networkStatusSnapshots),
      syncJobs: toCount(counts.syncJobs),
      hourlyPartitionsDropped: toCount(counts.hourlyPartitionsDropped),
    };
    const removed =
      deleted.arrivalPredictions +
      deleted.expiredCache +
      deleted.lineStatusSnapshots +
      deleted.networkStatusSnapshots +
      deleted.syncJobs;

    const finishedAt = new Date().toISOString();
    await finishSyncJob(supabase, job, {
      status: 'success',
      recordsRead: removed,
      recordsUpserted: 0,
    });

    return {
      jobId: job.id,
      jobName: job.jobName,
      status: 'success',
      startedAt: job.startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(job.startedAt),
      recordsRead: removed,
      recordsUpserted: 0,
      warnings: [],
      deleted,
    };
  } catch (error) {
    await finishSyncJob(supabase, job, {
      status: 'failed',
      recordsRead: 0,
      recordsUpserted: 0,
      error,
    });
    throw new ApiHttpError(
      500,
      'cleanup_failed',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
