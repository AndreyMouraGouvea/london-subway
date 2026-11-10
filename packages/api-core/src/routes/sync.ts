import type { Context, Hono } from 'hono';
import type { ApiRuntimeDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { ApiHttpError } from '../errors.ts';
import { buildMeta } from '../meta.ts';
import { getRequestId, setNoStore } from '../http.ts';
import { getDb } from './helpers.ts';
import { syncCleanup, syncDisruptions, syncReference, syncStatus } from '../sync/index.ts';

export function registerSyncRoutes(app: Hono<AppEnv>, deps: ApiRuntimeDependencies): void {
  app.post('/sync/reference', async (c) => {
    assertCron(c, deps);
    const supabase = getDb(deps.supabase);
    const result = await syncReference({ supabase, tfl: deps.tfl });
    return syncResponse(c, deps, result);
  });

  app.post('/sync/status', async (c) => {
    assertCron(c, deps);
    const supabase = getDb(deps.supabase);
    const result = await syncStatus({ supabase, tfl: deps.tfl });
    return syncResponse(c, deps, result);
  });

  app.post('/sync/disruptions', async (c) => {
    assertCron(c, deps);
    const supabase = getDb(deps.supabase);
    const result = await syncDisruptions({ supabase, tfl: deps.tfl });
    return syncResponse(c, deps, result);
  });

  app.post('/sync/cleanup', async (c) => {
    assertCron(c, deps);
    const supabase = getDb(deps.supabase);
    const result = await syncCleanup({ supabase });
    return syncResponse(c, deps, result);
  });
}

function assertCron(c: Context<AppEnv>, deps: ApiRuntimeDependencies): void {
  if (!deps.config.cronSecret) {
    throw new ApiHttpError(
      503,
      'cron_not_configured',
      'CRON_SECRET não está configurado neste ambiente.',
    );
  }
  const provided = c.req.header('x-cron-secret');
  if (!provided || provided !== deps.config.cronSecret) {
    throw new ApiHttpError(401, 'unauthorized', 'Segredo de cron inválido.');
  }
}

function syncResponse(
  c: Context<AppEnv>,
  deps: ApiRuntimeDependencies,
  result: Awaited<ReturnType<typeof syncReference>>,
) {
  const now = new Date();
  setNoStore(c);
  return c.json({
    data: result,
    meta: buildMeta({
      source: 'derived',
      fetchedAt: now.toISOString(),
      cachedAt: now.toISOString(),
      cacheTtlSeconds: 0,
      cacheState: 'live',
      dataQuality: 'derived',
      requestId: getRequestId(c),
      schemaVersion: deps.config.schemaVersion,
      now,
    }),
  });
}
