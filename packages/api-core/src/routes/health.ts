import type { Hono } from 'hono';
import type {
  ApiEnvelope,
  DataHealthData,
  DataSourceSummary,
  SyncJobStatus,
  SyncJobSummary,
} from '../../../shared/src/types/api.ts';
import type { ApiDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { fetchAllRows } from '../db.ts';
import { ApiHttpError } from '../errors.ts';
import { RETENTION_DEFAULTS } from '../sync/cleanup.ts';
import { dbMeta, getDb, parseCount, requestId, setPublicCache } from './helpers.ts';
import { maxIso, type DataSourceRow } from './data.ts';
import { mapDataSource } from './sources.ts';

interface JobRow {
  id: number;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: SyncJobStatus;
  records_read: number | null;
  records_upserted: number | null;
  duration_ms: number | null;
}

const JOB_COLUMNS =
  'id,job_name,started_at,finished_at,status,records_read,records_upserted,duration_ms';

export function registerHealthRoutes(app: Hono<AppEnv>, deps: ApiDependencies): void {
  app.get('/jobs', async (c) => {
    const limit = parseCount(c.req.query('limit'), { defaultValue: 10, min: 1, max: 50 });
    const jobs = await loadJobs(getDb(deps.supabase), limit);

    setPublicCache(c, 20, 40);
    return c.json({
      data: jobs,
      meta: dbMeta({
        fetchedAt: maxIso(jobs.map((job) => job.startedAt)),
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
        dataQuality: 'derived',
      }),
    } satisfies ApiEnvelope<SyncJobSummary[]>);
  });

  app.get('/data-health', async (c) => {
    const supabase = getDb(deps.supabase);
    const [sourceRows, jobs] = await Promise.all([
      fetchAllRows<DataSourceRow>(
        supabase,
        'data_sources',
        'id,name,publisher,url,license,license_url,attribution_text,refresh_policy,last_attempt_at,last_success_at,status,notes',
        { order: { column: 'name' } },
      ),
      loadJobs(supabase, 10),
    ]);
    const sources: DataSourceSummary[] = sourceRows.map(mapDataSource);

    const data: DataHealthData = {
      sources,
      jobs,
      retention: { ...RETENTION_DEFAULTS },
    };

    setPublicCache(c, 20, 40);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: maxIso([
          ...sources.map((source) => source.lastSuccessAt),
          ...jobs.map((job) => job.startedAt),
        ]),
        cacheTtlSeconds: 300,
        requestId: requestId(c),
        config: deps.config,
        dataQuality: 'derived',
      }),
    } satisfies ApiEnvelope<DataHealthData>);
  });
}

async function loadJobs(
  supabase: ReturnType<typeof getDb>,
  limit: number,
): Promise<SyncJobSummary[]> {
  const { data, error } = await supabase
    .from('v_sync_jobs_public')
    .select(JOB_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new ApiHttpError(500, 'database_error', error.message);
  }
  return ((data ?? []) as JobRow[]).map((row) => ({
    id: Number(row.id),
    jobName: row.job_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    recordsRead: row.records_read === null ? null : Number(row.records_read),
    recordsUpserted: row.records_upserted === null ? null : Number(row.records_upserted),
  }));
}
