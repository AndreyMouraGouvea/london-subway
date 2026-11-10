import type { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApiEnvelope,
  ArrivalSummary,
  DisruptionSummary,
  StationArrivalsData,
  StationDetailData,
  StationEntranceSummary,
  StationSummary,
} from '../../../shared/src/types/api.ts';
import type { ApiRuntimeDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { ApiHttpError } from '../errors.ts';
import { buildMeta } from '../meta.ts';
import { TfLError } from '../tfl/client.ts';
import type { TfLStopPoint } from '../../../shared/src/types/tfl.ts';
import { dbMeta, getDb, parseCount, requestId, setPublicCache } from './helpers.ts';
import {
  loadReference,
  mapDisruption,
  mapStation,
  type DisruptionRow,
  type StationRow,
} from './data.ts';
import { facilitiesFrom, toIsoOrNull } from '../sync/utils.ts';

const DISRUPTION_COLUMNS =
  'id,line_id,station_id,scope,category,type,category_description,summary,description,additional_info,closure_text,severity_level,validity_periods,starts_at,ends_at,affected_stops,affected_routes,first_seen_at,last_seen_at,is_active';

const STATION_COLUMNS =
  'id,name,display_name,lat,lon,zone,modes,line_ids,step_free,step_free_source,has_lifts,has_escalators,has_toilets,has_wifi,has_parking,ticket_halls,facilities,last_synced_at';

export function registerStationRoutes(app: Hono<AppEnv>, deps: ApiRuntimeDependencies): void {
  app.get('/stations', async (c) => {
    const lineId = c.req.query('lineId')?.trim() || null;
    const reference = await loadReference(getDb(deps.supabase));
    const stations = lineId
      ? reference.stations.filter((station) => station.lineIds.includes(lineId))
      : reference.stations;

    setPublicCache(c, 60, 120);
    return c.json({
      data: stations,
      meta: dbMeta({
        fetchedAt: reference.lastReferenceAt,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        warnings: reference.lastReferenceAt ? undefined : ['Sem referência sincronizada.'],
      }),
    } satisfies ApiEnvelope<StationSummary[]>);
  });

  app.get('/stations/:id', async (c) => {
    const stationId = c.req.param('id');
    const supabase = getDb(deps.supabase);

    const { data: stationRow, error: stationError } = await supabase
      .from('stations')
      .select(STATION_COLUMNS)
      .eq('id', stationId)
      .maybeSingle();
    if (stationError) throw new ApiHttpError(500, 'database_error', stationError.message);
    if (!stationRow) {
      throw new ApiHttpError(404, 'station_not_found', `Estação não encontrada: ${stationId}`);
    }

    const [reference, entrancesResult, disruptions] = await Promise.all([
      loadReference(supabase),
      supabase
        .from('station_entrances')
        .select('id,name,stop_type,lat,lon')
        .eq('station_id', stationId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      activeDisruptionsForStation(supabase, stationId),
    ]);

    if (entrancesResult.error) {
      throw new ApiHttpError(500, 'database_error', entrancesResult.error.message);
    }

    const station = mapStation(stationRow as StationRow, reference.statusesByLine);
    const dbEntrances: StationEntranceSummary[] = (entrancesResult.data ?? []).map((row) => ({
      id: String(row.id),
      name: row.name ?? null,
      stopType: row.stop_type ?? null,
      lat: Number(row.lat),
      lon: Number(row.lon),
    }));
    let entrances = dbEntrances.filter((entrance) => !(entrance.lat === 0 && entrance.lon === 0));
    let facilities = (stationRow.facilities as Record<string, string> | null) ?? {};
    const enrichmentWarnings: string[] = [];
    const cacheKey = `station-detail:${stationId}`;
    const cached = await deps.cache.get<{
      entrances: StationEntranceSummary[];
      facilities: Record<string, string>;
    }>(cacheKey);

    if (cached) {
      entrances = cached.value.entrances;
      facilities = { ...facilities, ...cached.value.facilities };
    } else {
      const needsEnrichment =
        entrances.length === 0 ||
        dbEntrances.some((entrance) => entrance.lat === 0 && entrance.lon === 0) ||
        Object.keys(facilities).length === 0;

      if (needsEnrichment) {
        try {
          const detail = await deps.tfl.getStopPoint(stationId);
          const detailedEntrances: StationEntranceSummary[] = (detail.data.children ?? [])
            .filter(
              (child): child is TfLStopPoint & { id: string; lat: number; lon: number } =>
                typeof child.id === 'string' &&
                typeof child.lat === 'number' &&
                typeof child.lon === 'number' &&
                !(child.lat === 0 && child.lon === 0),
            )
            .map((child) => ({
              id: child.id,
              name: child.commonName ?? null,
              stopType: child.stopType ?? null,
              lat: child.lat,
              lon: child.lon,
            }));

          if (detailedEntrances.length > 0) entrances = detailedEntrances;
          facilities = {
            ...facilities,
            ...facilitiesFrom(detail.data.additionalProperties),
          };
          await deps.cache.set(cacheKey, { entrances, facilities }, 86_400, {
            fetchedAt: detail.fetchedAt,
            statusCode: detail.status,
          });
        } catch (error) {
          enrichmentWarnings.push(
            `Detalhe TfL da estação indisponível: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    const data: StationDetailData = {
      station,
      entrances,
      facilities,
      disruptions,
    };

    setPublicCache(c, 30, 60);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: station.updatedAt ?? reference.lastReferenceAt,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        warnings: enrichmentWarnings.length > 0 ? enrichmentWarnings : undefined,
      }),
    } satisfies ApiEnvelope<StationDetailData>);
  });

  app.get('/stations/:id/disruptions', async (c) => {
    const stationId = c.req.param('id');
    const disruptions = await activeDisruptionsForStation(getDb(deps.supabase), stationId);
    setPublicCache(c, 30, 60);
    return c.json({
      data: disruptions,
      meta: dbMeta({
        fetchedAt: new Date().toISOString(),
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
      }),
    } satisfies ApiEnvelope<DisruptionSummary[]>);
  });

  app.get('/stations/:id/arrivals', async (c) => {
    const stationId = c.req.param('id');
    const count = parseCount(c.req.query('count'));
    const lineId = c.req.query('lineId')?.trim() || null;
    const cacheKey = `arrivals:${stationId}:${lineId ?? 'all'}:${count}`;
    const requestIdValue = requestId(c);

    const cached = await deps.cache.get<StationArrivalsData>(cacheKey);
    if (cached) {
      c.header('Cache-Control', 'private, max-age=15');
      return c.json({
        data: cached.value,
        meta: buildMeta({
          source: 'cache',
          fetchedAt: cached.fetchedAt,
          cachedAt: cached.cachedAt,
          cacheTtlSeconds: deps.config.cacheTtlSeconds.arrivals,
          cacheState: 'cached',
          dataQuality: 'reported',
          requestId: requestIdValue,
          schemaVersion: deps.config.schemaVersion,
        }),
      } satisfies ApiEnvelope<StationArrivalsData>);
    }

    try {
      const response = await deps.tfl.getArrivals(stationId, count);
      const predictions = response.data
        .filter((prediction) => !lineId || prediction.lineId === lineId)
        .sort(
          (a, b) =>
            (a.timeToStation ?? Number.MAX_SAFE_INTEGER) -
            (b.timeToStation ?? Number.MAX_SAFE_INTEGER),
        )
        .slice(0, count);
      const arrivals: ArrivalSummary[] = predictions
        .map((prediction) => ({
          id: prediction.id,
          stationId: prediction.naptanId ?? stationId,
          stationName: prediction.stationName ?? null,
          lineId: prediction.lineId ?? null,
          lineName: prediction.lineName ?? null,
          platformName: prediction.platformName ?? null,
          direction: prediction.direction ?? null,
          towards: prediction.towards ?? null,
          destinationName: prediction.destinationName ?? null,
          destinationStationId: prediction.destinationNaptanId ?? null,
          expectedArrival: toIsoOrNull(prediction.expectedArrival),
          timeToStationSeconds: prediction.timeToStation ?? null,
          currentLocation: prediction.currentLocation ?? null,
          modeName: prediction.modeName ?? null,
        }))
        .sort((a, b) => {
          const aTime = a.expectedArrival ? Date.parse(a.expectedArrival) : Number.MAX_SAFE_INTEGER;
          const bTime = b.expectedArrival ? Date.parse(b.expectedArrival) : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        });

      const data: StationArrivalsData = {
        stationId,
        stationName: arrivals[0]?.stationName ?? null,
        arrivals,
      };
      const entry = await deps.cache.set(cacheKey, data, deps.config.cacheTtlSeconds.arrivals, {
        fetchedAt: response.fetchedAt,
        statusCode: response.status,
      });

      c.header('Cache-Control', 'private, max-age=15');
      return c.json({
        data,
        meta: buildMeta({
          source: 'tfl-unified-api',
          fetchedAt: entry.fetchedAt,
          cachedAt: entry.cachedAt,
          cacheTtlSeconds: deps.config.cacheTtlSeconds.arrivals,
          cacheState: 'live',
          dataQuality: 'reported',
          requestId: requestIdValue,
          schemaVersion: deps.config.schemaVersion,
          upstream: {
            status: response.status,
            ttlSeconds: response.ttlSeconds ?? undefined,
          },
          warnings:
            arrivals.length === 0
              ? ['Previsões não disponíveis para esta estação/linha neste momento.']
              : undefined,
        }),
      } satisfies ApiEnvelope<StationArrivalsData>);
    } catch (error) {
      const stale = await deps.cache.get<StationArrivalsData>(cacheKey, {
        allowExpired: true,
      });
      if (stale) {
        c.header('Cache-Control', 'private, max-age=15');
        return c.json({
          data: stale.value,
          meta: buildMeta({
            source: 'cache',
            fetchedAt: stale.fetchedAt,
            cachedAt: stale.cachedAt,
            cacheTtlSeconds: deps.config.cacheTtlSeconds.arrivals,
            cacheState: 'stale',
            dataQuality: 'reported',
            requestId: requestIdValue,
            schemaVersion: deps.config.schemaVersion,
            upstream: {
              status: error instanceof TfLError ? error.status : 0,
              error: error instanceof Error ? error.message : String(error),
            },
            warnings: ['A TfL falhou; a devolver o último cache disponível.'],
          }),
        } satisfies ApiEnvelope<StationArrivalsData>);
      }

      throw new ApiHttpError(
        502,
        'arrivals_unavailable',
        error instanceof Error ? error.message : 'Previsões indisponíveis.',
      );
    }
  });
}

async function activeDisruptionsForStation(
  supabase: SupabaseClient,
  stationId: string,
): Promise<DisruptionSummary[]> {
  const [directResult, linksResult] = await Promise.all([
    supabase
      .from('disruptions')
      .select(DISRUPTION_COLUMNS)
      .eq('station_id', stationId)
      .eq('is_active', true),
    supabase
      .from('disruption_affected_stations')
      .select('disruption_id')
      .eq('station_id', stationId),
  ]);

  if (directResult.error) {
    throw new ApiHttpError(500, 'database_error', directResult.error.message);
  }
  if (linksResult.error) {
    throw new ApiHttpError(500, 'database_error', linksResult.error.message);
  }

  const linkIds = (linksResult.data ?? []).map((row) => String(row.disruption_id)).filter(Boolean);
  let linked: DisruptionRow[] = [];
  if (linkIds.length > 0) {
    const { data, error } = await supabase
      .from('disruptions')
      .select(DISRUPTION_COLUMNS)
      .in('id', linkIds)
      .eq('is_active', true);
    if (error) throw new ApiHttpError(500, 'database_error', error.message);
    linked = (data ?? []) as DisruptionRow[];
  }

  const byId = new Map<string, DisruptionSummary>();
  for (const row of [...((directResult.data ?? []) as DisruptionRow[]), ...linked]) {
    byId.set(row.id, mapDisruption(row));
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}
