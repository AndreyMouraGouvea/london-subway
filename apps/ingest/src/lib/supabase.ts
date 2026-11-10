import type { CanonicalStation } from '../footfall/parse.ts';

export function requiredEnv(): { url: string; key: string } {
  const url = (process.env.LOCAL_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(
    /\/+$/,
    '',
  );
  const key =
    process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (ou aliases LOCAL_*) não estão definidos.',
    );
  }
  return { url, key };
}

export type RestClient = <T = unknown>(pathname: string, init?: RequestInit) => Promise<T | null>;

export function restFactory(url: string, key: string): RestClient {
  return async function rest<T = unknown>(
    pathname: string,
    init: RequestInit = {},
  ): Promise<T | null> {
    const response = await fetch(`${url}/rest/v1/${pathname}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${pathname} → ${response.status}: ${text}`);
    }
    return text ? (JSON.parse(text) as T) : null;
  };
}

interface StationRow {
  id: string;
  name: string;
  display_name: string;
  stop_type: string | null;
  modes: string[] | null;
  line_ids: string[] | null;
}

export async function loadCanonicalStations(rest: RestClient): Promise<CanonicalStation[]> {
  const rows = await rest<StationRow[]>(
    'stations?select=id,name,display_name,stop_type,modes,line_ids&is_active=eq.true&stop_type=in.(NaptanMetroStation,NaptanRailStation)&limit=1000',
  );
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    stopType: row.stop_type,
    modes: row.modes ?? [],
    lineIds: row.line_ids ?? [],
  }));
}

export async function startJob(rest: RestClient, jobName: string): Promise<number | null> {
  const [job] = (await rest<Array<{ id: number }>>('data_sync_jobs?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      job_name: jobName,
      function_name: 'ingest',
      started_at: new Date().toISOString(),
      status: 'running',
    }),
  })) ?? [{ id: 0 }];
  return job?.id ?? null;
}

export async function finishJob(
  rest: RestClient,
  jobId: number | null,
  payload: {
    status: 'success' | 'partial' | 'failed';
    recordsRead: number;
    recordsUpserted: number;
    metadata?: Record<string, unknown>;
    error?: unknown;
  },
): Promise<void> {
  if (!jobId) return;
  await rest(`data_sync_jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      finished_at: new Date().toISOString(),
      status: payload.status,
      records_read: payload.recordsRead,
      records_upserted: payload.recordsUpserted,
      metadata: payload.metadata ?? {},
      error_message: payload.error
        ? (payload.error instanceof Error ? payload.error.message : String(payload.error)).slice(
            0,
            800,
          )
        : null,
    }),
  });
}

export async function markSource(
  rest: RestClient,
  sourceId: string,
  status: 'ok' | 'error',
): Promise<void> {
  const now = new Date().toISOString();
  await rest(`data_sources?id=eq.${sourceId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      last_attempt_at: now,
      ...(status === 'ok' ? { last_success_at: now } : {}),
      status,
    }),
  }).catch(() => undefined);
}

/** Divide uma lista em lotes para upserts REST. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
