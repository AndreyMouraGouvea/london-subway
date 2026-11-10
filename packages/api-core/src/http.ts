import type { Context, MiddlewareHandler } from 'hono';
import type { ApiErrorBody, ApiMeta } from '../../shared/src/types/api.ts';

export interface AppVariables {
  requestId: string;
  startedAt: number;
}

export type AppEnv = { Variables: AppVariables };

export const requestIdMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const incoming = c.req.header('x-request-id');
  const requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  c.set('requestId', requestId);
  c.set('startedAt', Date.now());
  c.header('X-Request-Id', requestId);
  await next();
};

export const loggingMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const startedAt = c.get('startedAt') ?? Date.now();
  const payload = {
    level: c.res.status >= 500 ? 'error' : 'info',
    event: 'http_request',
    requestId: c.get('requestId'),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
    cache: c.res.headers.get('x-cache') ?? undefined,
  };
  console.info(JSON.stringify(payload));
};

export function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return { code, message, ...(details === undefined ? {} : { details }) };
}

export function getRequestId(c: Context<AppEnv>): string {
  return c.get('requestId') ?? 'unknown';
}

export function setNoStore(c: Context<AppEnv>): void {
  c.header('Cache-Control', 'no-store');
}

export function metaUnavailable(meta: ApiMeta): ApiMeta {
  return {
    ...meta,
    fetchedAt: null,
    cachedAt: null,
    isStale: true,
    dataSourceStatus: 'unavailable',
    ageSeconds: null,
  };
}
