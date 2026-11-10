import type { Hono } from 'hono';
import type { ApiEnvelope, DisruptionSummary } from '../../../shared/src/types/api.ts';
import type { StatusBand } from '../../../shared/src/types/domain.ts';
import type { ApiDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { ApiHttpError } from '../errors.ts';
import { dbMeta, getDb, requestId, setPublicCache } from './helpers.ts';
import { loadReference } from './data.ts';

const BANDS: readonly StatusBand[] = ['normal', 'attention', 'severe', 'closure', 'unknown'];
const SCOPES = ['line', 'station', 'network'] as const;

export function registerDisruptionRoutes(app: Hono<AppEnv>, deps: ApiDependencies): void {
  app.get('/disruptions', async (c) => {
    const lineId = c.req.query('lineId')?.trim() || null;
    const stationId = c.req.query('stationId')?.trim() || null;
    const category = c.req.query('category')?.trim().toLowerCase() || null;
    const query = c.req.query('q')?.trim().toLowerCase() || null;
    const band = parseBand(c.req.query('band'));
    const scope = parseScope(c.req.query('scope'));

    const reference = await loadReference(getDb(deps.supabase));
    const disruptions = reference.disruptions.filter((disruption) => {
      if (lineId && disruption.lineId !== lineId) return false;
      if (band && disruption.band !== band) return false;
      if (scope && disruption.scope !== scope) return false;
      if (category && disruption.category?.toLowerCase() !== category) return false;
      if (stationId && !matchesStation(disruption, stationId)) return false;
      if (query) {
        const haystack = [
          disruption.summary,
          disruption.description,
          disruption.additionalInfo,
          disruption.categoryDescription,
          disruption.closureText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    setPublicCache(c, 20, 40);
    return c.json({
      data: disruptions,
      meta: dbMeta({
        fetchedAt: reference.lastStatusAt,
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
        warnings: reference.lastStatusAt ? undefined : ['Sem snapshots de status.'],
      }),
    } satisfies ApiEnvelope<DisruptionSummary[]>);
  });
}

function parseBand(value: string | undefined): StatusBand | null {
  if (value === undefined || value === '') return null;
  if (!BANDS.includes(value as StatusBand)) {
    throw new ApiHttpError(400, 'invalid_band', `band deve ser um de: ${BANDS.join(', ')}.`);
  }
  return value as StatusBand;
}

function parseScope(value: string | undefined): (typeof SCOPES)[number] | null {
  if (value === undefined || value === '') return null;
  if (!SCOPES.includes(value as (typeof SCOPES)[number])) {
    throw new ApiHttpError(400, 'invalid_scope', `scope deve ser um de: ${SCOPES.join(', ')}.`);
  }
  return value as (typeof SCOPES)[number];
}

function matchesStation(disruption: DisruptionSummary, stationId: string): boolean {
  if (disruption.stationId === stationId) return true;
  return disruption.affectedStops.some((stop) => {
    if (!stop || typeof stop !== 'object') return false;
    const candidate = stop as { id?: unknown; naptanId?: unknown };
    return candidate.id === stationId || candidate.naptanId === stationId;
  });
}
