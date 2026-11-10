import type { Hono } from 'hono';
import type { ApiEnvelope, DataSourceSummary } from '../../../shared/src/types/api.ts';
import type { ApiDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { fetchAllRows } from '../db.ts';
import { dbMeta, getDb, requestId, setPublicCache } from './helpers.ts';
import { maxIso, type DataSourceRow } from './data.ts';

export function mapDataSource(source: DataSourceRow): DataSourceSummary {
  return {
    id: source.id,
    name: source.name,
    publisher: source.publisher,
    url: source.url,
    license: source.license,
    licenseUrl: source.license_url,
    attributionText: source.attribution_text,
    refreshPolicy: source.refresh_policy,
    lastAttemptAt: source.last_attempt_at,
    lastSuccessAt: source.last_success_at,
    status: source.status,
    notes: source.notes,
  };
}

export function registerSourceRoutes(app: Hono<AppEnv>, deps: ApiDependencies): void {
  app.get('/sources', async (c) => {
    const sources = await fetchAllRows<DataSourceRow>(
      getDb(deps.supabase),
      'data_sources',
      'id,name,publisher,url,license,license_url,attribution_text,refresh_policy,last_attempt_at,last_success_at,status,notes',
      { order: { column: 'name' } },
    );

    const data: DataSourceSummary[] = sources.map(mapDataSource);

    setPublicCache(c, 60, 120);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: maxIso(sources.map((source) => source.last_success_at)),
        cacheTtlSeconds: 300,
        requestId: requestId(c),
        config: deps.config,
      }),
    } satisfies ApiEnvelope<DataSourceSummary[]>);
  });
}
