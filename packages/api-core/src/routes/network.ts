import type { Hono } from 'hono';
import type { ApiEnvelope, NetworkData, NetworkStatusData } from '../../../shared/src/types/api.ts';
import type { ApiDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { dbMeta, getDb, requestId, setPublicCache } from './helpers.ts';
import { loadReference } from './data.ts';

export function registerNetworkRoutes(app: Hono<AppEnv>, deps: ApiDependencies): void {
  app.get('/network', async (c) => {
    const reference = await loadReference(getDb(deps.supabase));
    if (reference.lines.length === 0 || reference.stations.length === 0) {
      return c.json(
        {
          data: null,
          meta: dbMeta({
            fetchedAt: reference.lastReferenceAt,
            cacheTtlSeconds: 86400,
            requestId: requestId(c),
            config: deps.config,
            warnings: ['Sem dados de referência. Executa /sync/reference.'],
          }),
          error: {
            code: 'no_reference_data',
            message: 'Sem dados de referência sincronizados.',
          },
        },
        503,
      );
    }

    const data: NetworkData = {
      lines: reference.lines,
      stations: reference.stations,
      paths: reference.paths,
      summary: reference.summary,
    };

    setPublicCache(c, 30, 90);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: reference.lastStatusAt ?? reference.lastReferenceAt,
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
        warnings: [
          ...(reference.paths.length === 0 ? ['Sem geometrias sincronizadas.'] : []),
          ...(reference.lastStatusAt ? [] : ['Sem snapshots de status.']),
        ],
      }),
    } satisfies ApiEnvelope<NetworkData>);
  });

  app.get('/network/status', async (c) => {
    const reference = await loadReference(getDb(deps.supabase));
    const data: NetworkStatusData = {
      summary: reference.summary,
      lines: reference.lines,
    };

    setPublicCache(c, 20, 40);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: reference.lastStatusAt,
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
        warnings: reference.lastStatusAt ? undefined : ['Sem snapshots de status.'],
      }),
    } satisfies ApiEnvelope<NetworkStatusData>);
  });
}
