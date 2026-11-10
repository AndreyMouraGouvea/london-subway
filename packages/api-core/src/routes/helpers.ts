import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiMeta, ApiEnvelope } from '../../../shared/src/types/api.ts';
import type { DataQuality, DataSourceStatus } from '../../../shared/src/types/domain.ts';
import { ageInSeconds } from '../../../shared/src/utils/date.ts';
import type { ApiConfig } from '../config.ts';
import { buildMeta } from '../meta.ts';
import { getRequestId, type AppEnv } from '../http.ts';
import { ApiHttpError } from '../errors.ts';
import { requireDb } from '../db.ts';

export interface DbMetaInput {
  fetchedAt: string | null;
  cacheTtlSeconds: number;
  requestId: string;
  config: ApiConfig;
  dataQuality?: DataQuality;
  source?: ApiMeta['source'];
  warnings?: string[];
}

export function dbMeta(input: DbMetaInput): ApiMeta {
  const age = ageInSeconds(input.fetchedAt);
  let dataSourceStatus: DataSourceStatus;
  if (!input.fetchedAt) {
    dataSourceStatus = 'unavailable';
  } else if (age !== null && age > input.cacheTtlSeconds) {
    dataSourceStatus = 'stale';
  } else {
    dataSourceStatus = 'cached';
  }

  return buildMeta({
    source: input.source ?? 'cache',
    fetchedAt: input.fetchedAt,
    cachedAt: input.fetchedAt,
    cacheTtlSeconds: input.cacheTtlSeconds,
    cacheState: dataSourceStatus,
    dataQuality: input.dataQuality ?? 'reported',
    requestId: input.requestId,
    schemaVersion: input.config.schemaVersion,
    warnings: input.warnings,
  });
}

export function getDb(supabase: SupabaseClient | undefined): SupabaseClient {
  return requireDb(supabase);
}

export function requestId(c: Context<AppEnv>): string {
  return getRequestId(c);
}

export function setPublicCache(
  c: Context<AppEnv>,
  maxAgeSeconds: number,
  staleWhileRevalidateSeconds = 60,
): void {
  c.header(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`,
  );
}

export function parseCount(
  value: string | undefined,
  options: { defaultValue?: number; min?: number; max?: number } = {},
): number {
  const fallback = options.defaultValue ?? 20;
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  const min = options.min ?? 1;
  const max = options.max ?? 100;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ApiHttpError(
      400,
      'invalid_count',
      `O parâmetro count deve ser um inteiro entre ${min} e ${max}.`,
    );
  }
  return parsed;
}

export function parseDirection(value: string | undefined): 'inbound' | 'outbound' {
  if (value === undefined || value === '' || value === 'outbound') return 'outbound';
  if (value === 'inbound') return 'inbound';
  throw new ApiHttpError(400, 'invalid_direction', 'direction deve ser inbound ou outbound.');
}

export function envelope<T>(data: T | null, meta: ApiMeta): ApiEnvelope<T> {
  return { data, meta };
}
