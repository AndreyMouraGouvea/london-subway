import type { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApiEnvelope,
  LineDetailData,
  LineRouteData,
  LineSummary,
  StationSummary,
} from '../../../shared/src/types/api.ts';
import type { ApiDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { ApiHttpError } from '../errors.ts';
import { dbMeta, getDb, parseDirection, requestId, setPublicCache } from './helpers.ts';
import { loadReference, type ReferenceData } from './data.ts';

interface LineStationOrderRow {
  station_id: string;
  direction: string;
  branch_id: number;
  sequence: number;
  route_name: string | null;
  service_type: string;
}

export function registerLineRoutes(app: Hono<AppEnv>, deps: ApiDependencies): void {
  app.get('/lines', async (c) => {
    const supabase = getDb(deps.supabase);
    const reference = await loadReference(supabase);
    if (reference.lines.length === 0) {
      return c.json(
        {
          data: null,
          meta: dbMeta({
            fetchedAt: null,
            cacheTtlSeconds: 86400,
            requestId: requestId(c),
            config: deps.config,
            warnings: ['Nenhuma linha sincronizada. Executa /sync/reference.'],
          }),
          error: { code: 'no_reference_data', message: 'Nenhuma linha sincronizada.' },
        },
        503,
      );
    }

    setPublicCache(c, 60, 120);
    const meta = dbMeta({
      fetchedAt: reference.lastReferenceAt,
      cacheTtlSeconds: 86400,
      requestId: requestId(c),
      config: deps.config,
    });
    return c.json({ data: reference.lines, meta } satisfies ApiEnvelope<LineSummary[]>);
  });

  app.get('/lines/:id', async (c) => {
    const lineId = c.req.param('id');
    const supabase = getDb(deps.supabase);
    const [reference, ordered] = await Promise.all([
      loadReference(supabase),
      loadLineOrder(supabase, lineId, 'outbound'),
    ]);
    const line = findLine(reference, lineId);
    const stations = stationsForLine(reference, ordered.rows, lineId);
    const paths = reference.paths.filter((path) => path.lineId === lineId);
    const disruptions = reference.disruptions.filter((disruption) => disruption.lineId === lineId);

    setPublicCache(c, 30, 60);
    const data: LineDetailData = {
      line,
      statuses: line.status ? [line.status] : [],
      disruptions,
      stations,
      paths,
    };
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: line.updatedAt ?? reference.lastReferenceAt,
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
      }),
    } satisfies ApiEnvelope<LineDetailData>);
  });

  app.get('/lines/:id/status', async (c) => {
    const lineId = c.req.param('id');
    const reference = await loadReference(getDb(deps.supabase));
    const line = findLine(reference, lineId);
    const disruptions = reference.disruptions.filter((disruption) => disruption.lineId === lineId);
    const fetchedAt = line.status?.capturedAt ?? null;

    setPublicCache(c, 30, 60);
    return c.json({
      data: { line, status: line.status, disruptions },
      meta: dbMeta({
        fetchedAt,
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
        warnings: fetchedAt ? undefined : ['Sem snapshot de status para esta linha.'],
      }),
    });
  });

  app.get('/lines/:id/disruptions', async (c) => {
    const lineId = c.req.param('id');
    const reference = await loadReference(getDb(deps.supabase));
    findLine(reference, lineId);
    const disruptions = reference.disruptions.filter((disruption) => disruption.lineId === lineId);

    setPublicCache(c, 30, 60);
    return c.json({
      data: disruptions,
      meta: dbMeta({
        fetchedAt: reference.lastStatusAt,
        cacheTtlSeconds: 60,
        requestId: requestId(c),
        config: deps.config,
      }),
    });
  });

  app.get('/lines/:id/route', async (c) => {
    const lineId = c.req.param('id');
    const direction = parseDirection(c.req.query('direction'));
    const reference = await loadReference(getDb(deps.supabase));
    findLine(reference, lineId);
    const ordered = await loadLineOrder(getDb(deps.supabase), lineId, direction);
    const branches = buildBranches(reference, ordered.rows);

    const directPaths = reference.paths.filter(
      (path) => path.lineId === lineId && path.direction === direction,
    );
    const paths =
      directPaths.length > 0
        ? directPaths
        : reference.paths
            .filter((path) => path.lineId === lineId && path.direction === 'outbound')
            .map((path) => ({ ...path, direction, derived: true }));

    const data: LineRouteData = {
      lineId,
      direction,
      derived: ordered.derived || paths.some((path) => path.derived),
      branches,
      paths,
    };

    setPublicCache(c, 60, 120);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: reference.lastReferenceAt,
        cacheTtlSeconds: 3600,
        requestId: requestId(c),
        config: deps.config,
        warnings: data.derived
          ? ['Geometria/ordem inbound derivada por reversão do sentido outbound.']
          : undefined,
      }),
    } satisfies ApiEnvelope<LineRouteData>);
  });

  app.get('/lines/:id/stations', async (c) => {
    const lineId = c.req.param('id');
    const direction = parseDirection(c.req.query('direction'));
    const [reference, ordered] = await Promise.all([
      loadReference(getDb(deps.supabase)),
      loadLineOrder(getDb(deps.supabase), lineId, direction),
    ]);
    findLine(reference, lineId);
    const stations = stationsForLine(reference, ordered.rows, lineId);

    setPublicCache(c, 60, 120);
    return c.json({
      data: stations,
      meta: dbMeta({
        fetchedAt: reference.lastReferenceAt,
        cacheTtlSeconds: 3600,
        requestId: requestId(c),
        config: deps.config,
        warnings: ordered.derived
          ? ['Ordem inbound derivada por reversão do sentido outbound.']
          : undefined,
      }),
    } satisfies ApiEnvelope<StationSummary[]>);
  });
}

function findLine(reference: ReferenceData, lineId: string): LineSummary {
  const line = reference.lines.find((candidate) => candidate.id === lineId);
  if (!line) {
    throw new ApiHttpError(404, 'line_not_found', `Linha não encontrada: ${lineId}`);
  }
  return line;
}

async function loadLineOrder(
  supabase: SupabaseClient,
  lineId: string,
  direction: 'inbound' | 'outbound',
): Promise<{ rows: LineStationOrderRow[]; derived: boolean }> {
  const load = (requested: 'inbound' | 'outbound') =>
    supabase
      .from('line_stations')
      .select('station_id,direction,branch_id,sequence,route_name,service_type')
      .eq('line_id', lineId)
      .eq('direction', requested)
      .eq('is_active', true)
      .order('branch_id', { ascending: true })
      .order('sequence', { ascending: true });

  const { data, error } = await load(direction);
  if (error) throw new ApiHttpError(500, 'database_error', error.message);

  let rows = (data ?? []) as LineStationOrderRow[];
  let derived = false;

  if (rows.length === 0 && direction === 'inbound') {
    const fallback = await load('outbound');
    if (fallback.error) {
      throw new ApiHttpError(500, 'database_error', fallback.error.message);
    }
    rows = reverseBranches((fallback.data ?? []) as LineStationOrderRow[]);
    derived = rows.length > 0;
  }

  return { rows, derived };
}

function reverseBranches(rows: readonly LineStationOrderRow[]): LineStationOrderRow[] {
  const branches = new Map<number, LineStationOrderRow[]>();
  for (const row of rows) {
    const branch = branches.get(row.branch_id) ?? [];
    branch.push(row);
    branches.set(row.branch_id, branch);
  }
  const reversed: LineStationOrderRow[] = [];
  for (const branch of branches.values()) {
    const ordered = [...branch].sort((a, b) => a.sequence - b.sequence);
    reversed.push(
      ...ordered.reverse().map((row, index) => ({
        ...row,
        direction: 'inbound',
        sequence: index,
      })),
    );
  }
  return reversed;
}

function buildBranches(
  reference: ReferenceData,
  rows: readonly LineStationOrderRow[],
): LineRouteData['branches'] {
  const stationMap = new Map(reference.stations.map((station) => [station.id, station]));
  const branches = new Map<number, LineRouteData['branches'][number]>();

  for (const row of rows) {
    const station = stationMap.get(row.station_id);
    if (!station) continue;
    const branch = branches.get(row.branch_id) ?? {
      branchId: row.branch_id,
      routeName: row.route_name,
      stations: [],
    };
    branch.stations.push(station);
    branches.set(row.branch_id, branch);
  }

  return [...branches.values()].sort((a, b) => a.branchId - b.branchId);
}

function stationsForLine(
  reference: ReferenceData,
  rows: readonly LineStationOrderRow[],
  lineId: string,
): StationSummary[] {
  const stationMap = new Map(reference.stations.map((station) => [station.id, station]));
  const seen = new Set<string>();
  const ordered: StationSummary[] = [];

  for (const row of rows) {
    if (seen.has(row.station_id)) continue;
    const station = stationMap.get(row.station_id);
    if (!station) continue;
    seen.add(row.station_id);
    ordered.push(station);
  }

  if (ordered.length > 0) return ordered;
  return reference.stations.filter((station) => station.lineIds.includes(lineId));
}
