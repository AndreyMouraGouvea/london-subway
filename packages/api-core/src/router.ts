import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiEnvelope, HealthCheckResult } from '../../shared/src/types/api.ts';
import type { ApiConfig } from './config.ts';
import type { CacheStore } from './cache.ts';
import { buildMeta } from './meta.ts';
import {
  errorBody,
  getRequestId,
  loggingMiddleware,
  metaUnavailable,
  requestIdMiddleware,
  setNoStore,
  type AppEnv,
} from './http.ts';
import { TfLError, TfLClient } from './tfl/client.ts';
import { ApiHttpError } from './errors.ts';
import {
  registerAnalyticsRoutes,
  registerDashboardRoutes,
  registerDisruptionRoutes,
  registerHealthRoutes,
  registerLineRoutes,
  registerNetworkRoutes,
  registerSourceRoutes,
  registerStationRoutes,
  registerSyncRoutes,
} from './routes/index.ts';

export interface ApiDependencies {
  config: ApiConfig;
  cache: CacheStore;
  supabase?: SupabaseClient;
  tfl?: TfLClient;
  checkDatabase?: () => Promise<'ok' | 'error' | 'not_configured'>;
  /**
   * Prefixo interno da função. O runtime do Supabase inclui o nome da função
   * no caminho (ex.: /api/health), então a Edge Function usa "/api".
   * O harness local usa "" e expõe /health.
   */
  basePath?: string;
}

export type ApiRuntimeDependencies = ApiDependencies & { tfl: TfLClient };

export function createApi(deps: ApiDependencies): Hono<AppEnv> {
  const app = deps.basePath ? new Hono<AppEnv>().basePath(deps.basePath) : new Hono<AppEnv>();
  const { config } = deps;
  const runtimeDeps: ApiRuntimeDependencies = {
    ...deps,
    tfl:
      deps.tfl ??
      new TfLClient({
        baseUrl: config.tfl.baseUrl,
        appKey: config.tfl.appKey,
        timeoutMs: config.tfl.timeoutMs,
        maxRetries: config.tfl.maxRetries,
      }),
  };

  // O browser normaliza scheme e host do header Origin para minúsculas.
  // Comparar com a lista configurada sem distinguir maiúsculas evita 403 em
  // origens introduzidas à mão (ex.: `https://Andrey.github.io`).
  const allowedOrigins = new Set(config.allowedOrigins.map((origin) => origin.toLowerCase()));
  const isAllowedOrigin = (origin: string) => allowedOrigins.has(origin.toLowerCase());

  app.use('*', requestIdMiddleware);
  app.use('*', loggingMiddleware);

  // CORS não é autenticação. Além do header, rejeitamos origens não permitidas
  // para que um proxy que injete "*" não abra a API para qualquer site.
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !isAllowedOrigin(origin)) {
      const now = new Date();
      const meta = metaUnavailable(
        buildMeta({
          source: 'derived',
          fetchedAt: null,
          cachedAt: null,
          cacheTtlSeconds: 0,
          cacheState: 'unavailable',
          dataQuality: 'unknown',
          requestId: getRequestId(c),
          schemaVersion: config.schemaVersion,
          now,
        }),
      );
      return c.json(
        {
          data: null,
          meta,
          error: errorBody('origin_not_allowed', 'Origem não permitida pelo CORS.'),
        },
        403,
      );
    }
    await next();
  });

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return '*';
        return isAllowedOrigin(origin) ? origin : null;
      },
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposeHeaders: ['X-Request-Id', 'X-Cache'],
      maxAge: 86400,
    }),
  );

  app.get('/', (c) => {
    const now = new Date();
    const meta = buildMeta({
      source: 'derived',
      fetchedAt: now.toISOString(),
      cachedAt: now.toISOString(),
      cacheTtlSeconds: 0,
      cacheState: 'live',
      dataQuality: 'derived',
      requestId: getRequestId(c),
      schemaVersion: config.schemaVersion,
      now,
    });
    setNoStore(c);
    return c.json({
      data: {
        service: config.serviceName,
        version: config.version,
        docs: '/functions/v1/api/health',
        endpoints: ['/health', '/version'],
      },
      meta,
    });
  });

  app.get('/version', (c) => {
    const now = new Date();
    const meta = buildMeta({
      source: 'derived',
      fetchedAt: now.toISOString(),
      cachedAt: now.toISOString(),
      cacheTtlSeconds: 0,
      cacheState: 'live',
      dataQuality: 'derived',
      requestId: getRequestId(c),
      schemaVersion: config.schemaVersion,
      now,
    });
    setNoStore(c);
    return c.json({
      data: {
        service: config.serviceName,
        version: config.version,
        schemaVersion: config.schemaVersion,
        time: now.toISOString(),
        cronConfigured: Boolean(config.cronSecret),
      },
      meta,
    });
  });

  app.get('/health', async (c) => {
    const now = new Date();
    const requestId = getRequestId(c);

    const [cacheHealth, databaseHealth] = await Promise.all([
      deps.cache.healthCheck(),
      deps.checkDatabase ? deps.checkDatabase() : Promise.resolve('not_configured' as const),
    ]);

    const checks: HealthCheckResult['checks'] = {
      database: databaseHealth,
      cache: cacheHealth,
      tfl: 'not_checked',
    };

    const status: HealthCheckResult['status'] =
      checks.database === 'error' || checks.cache === 'error' ? 'degraded' : 'ok';

    const data: HealthCheckResult = {
      status,
      service: config.serviceName,
      version: config.version,
      time: now.toISOString(),
      checks,
    };

    const meta = buildMeta({
      source: 'derived',
      fetchedAt: now.toISOString(),
      cachedAt: now.toISOString(),
      cacheTtlSeconds: 0,
      cacheState: 'live',
      dataQuality: 'derived',
      requestId,
      schemaVersion: config.schemaVersion,
      now,
    });

    setNoStore(c);
    c.header('X-Cache', 'BYPASS');
    const body: ApiEnvelope<HealthCheckResult> = { data, meta };
    return c.json(body, status === 'ok' ? 200 : 503);
  });

  registerNetworkRoutes(app, runtimeDeps);
  registerLineRoutes(app, runtimeDeps);
  registerStationRoutes(app, runtimeDeps);
  registerDisruptionRoutes(app, runtimeDeps);
  registerDashboardRoutes(app, runtimeDeps);
  registerAnalyticsRoutes(app, runtimeDeps);
  registerHealthRoutes(app, runtimeDeps);
  registerSourceRoutes(app, runtimeDeps);
  registerSyncRoutes(app, runtimeDeps);

  app.notFound((c) => {
    const now = new Date();
    const meta = metaUnavailable(
      buildMeta({
        source: 'derived',
        fetchedAt: null,
        cachedAt: null,
        cacheTtlSeconds: 0,
        cacheState: 'unavailable',
        dataQuality: 'unknown',
        requestId: getRequestId(c),
        schemaVersion: config.schemaVersion,
        now,
      }),
    );
    return c.json(
      {
        data: null,
        meta,
        error: errorBody('not_found', `Rota não encontrada: ${c.req.path}`),
      },
      404,
    );
  });

  app.onError((error, c) => {
    const requestId = getRequestId(c);
    const now = new Date();
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'unhandled_error',
        requestId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    const isTfL = error instanceof TfLError;
    const isHttp = error instanceof ApiHttpError;
    const status = isHttp ? error.status : isTfL ? (error.status === 429 ? 429 : 502) : 500;

    const meta = metaUnavailable(
      buildMeta({
        source: 'derived',
        fetchedAt: null,
        cachedAt: null,
        cacheTtlSeconds: 0,
        cacheState: 'unavailable',
        dataQuality: 'unknown',
        requestId,
        schemaVersion: config.schemaVersion,
        now,
      }),
    );

    return c.json(
      {
        data: null,
        meta,
        error: errorBody(
          isHttp ? error.code : isTfL ? error.code : 'internal_error',
          isHttp ? error.message : isTfL ? error.message : 'Erro interno na API',
          isHttp
            ? error.details
            : isTfL
              ? { upstreamStatus: error.status, url: error.url }
              : undefined,
        ),
      },
      status as 400,
    );
  });

  return app;
}
