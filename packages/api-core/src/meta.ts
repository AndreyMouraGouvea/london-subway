import type { ApiMeta } from '../../shared/src/types/api.ts';
import type { DataQuality, DataSourceStatus } from '../../shared/src/types/domain.ts';
import { ageInSeconds } from '../../shared/src/utils/date.ts';

export interface BuildMetaInput {
  source: ApiMeta['source'];
  fetchedAt?: string | null;
  cachedAt?: string | null;
  cacheTtlSeconds: number;
  cacheState?: DataSourceStatus;
  dataQuality?: DataQuality;
  requestId: string;
  schemaVersion: string;
  upstream?: ApiMeta['upstream'];
  warnings?: string[];
  now?: Date;
}

/**
 * Metadados canônicos. A regra é simples e explícita:
 * - sem fetchedAt => unavailable;
 * - cacheState explícito prevalece;
 * - se não informado, idade > TTL => stale, senão cached.
 */
export function buildMeta(input: BuildMetaInput): ApiMeta {
  const now = input.now ?? new Date();
  const fetchedAt = input.fetchedAt ?? null;
  const cachedAt = input.cachedAt ?? null;
  const age = ageInSeconds(fetchedAt, now.getTime());

  let dataSourceStatus: DataSourceStatus;
  if (!fetchedAt) {
    dataSourceStatus = 'unavailable';
  } else if (input.cacheState) {
    dataSourceStatus = input.cacheState;
  } else if (age !== null && age > input.cacheTtlSeconds) {
    dataSourceStatus = 'stale';
  } else {
    dataSourceStatus = 'cached';
  }

  const isStale = dataSourceStatus === 'stale' || (age !== null && age > input.cacheTtlSeconds);

  return {
    source: input.source,
    fetchedAt,
    cachedAt,
    cacheTtlSeconds: input.cacheTtlSeconds,
    isStale,
    dataSourceStatus,
    ageSeconds: age,
    requestId: input.requestId,
    schemaVersion: input.schemaVersion,
    dataQuality: input.dataQuality ?? 'reported',
    upstream: input.upstream,
    warnings: input.warnings,
  };
}
