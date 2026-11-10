import type { Hono } from 'hono';
import type {
  ApiEnvelope,
  DashboardDisruptedLine,
  DashboardHistoryData,
  DashboardHistoryPoint,
  DashboardSummaryData,
  DashboardTopLine,
} from '../../../shared/src/types/api.ts';
import type { ApiDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { fetchAllRows } from '../db.ts';
import { ApiHttpError } from '../errors.ts';
import { dbMeta, getDb, requestId, setPublicCache } from './helpers.ts';
import { loadReference, type DataSourceRow, type NetworkSnapshotRow } from './data.ts';

interface NetworkHistoryRow {
  bucket_start: string;
  samples: number;
  lines_total: number;
  lines_normal: number;
  lines_attention: number;
  lines_severe: number;
  lines_closed: number;
  lines_unknown: number;
  disruptions_active: number;
  stations_affected: number | null;
}

interface TopLineRow {
  line_id: string;
  disrupted_buckets: number;
  total_buckets: number;
}

export function registerDashboardRoutes(app: Hono<AppEnv>, deps: ApiDependencies): void {
  app.get('/dashboard/history', async (c) => {
    const hours = parseHours(c.req.query('hours'));
    const supabase = getDb(deps.supabase);
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();

    const [networkHistory, topLineRows, lineRows, latestSnapshot] = await Promise.all([
      supabase.rpc('ldt_network_history', { p_since: since }),
      supabase.rpc('ldt_top_disrupted_lines', { p_since: since }),
      fetchAllRows<{ id: string; name: string }>(supabase, 'lines', 'id,name'),
      supabase
        .from('network_status_snapshots')
        .select('captured_at')
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (networkHistory.error) {
      throw new ApiHttpError(500, 'database_error', networkHistory.error.message);
    }
    if (topLineRows.error) {
      throw new ApiHttpError(500, 'database_error', topLineRows.error.message);
    }

    const series: DashboardHistoryPoint[] = (
      (networkHistory.data ?? []) as NetworkHistoryRow[]
    ).map((row) => ({
      bucketStart: row.bucket_start,
      samples: Number(row.samples ?? 0),
      linesTotal: Number(row.lines_total ?? 0),
      normal: Number(row.lines_normal ?? 0),
      attention: Number(row.lines_attention ?? 0),
      severe: Number(row.lines_severe ?? 0),
      closure: Number(row.lines_closed ?? 0),
      unknown: Number(row.lines_unknown ?? 0),
      disruptionsActive: Number(row.disruptions_active ?? 0),
      stationsAffected: row.stations_affected ?? null,
    }));

    const lineNames = new Map(lineRows.map((line) => [line.id, line.name]));
    const topDisruptedLines: DashboardDisruptedLine[] = (
      (topLineRows.data ?? []) as TopLineRow[]
    ).map((row) => {
      const totalBuckets = Number(row.total_buckets ?? 0);
      const disruptedBuckets = Number(row.disrupted_buckets ?? 0);
      return {
        lineId: row.line_id,
        lineName: lineNames.get(row.line_id) ?? null,
        disruptedBuckets,
        totalBuckets,
        disruptionRate: totalBuckets > 0 ? Number((disruptedBuckets / totalBuckets).toFixed(4)) : 0,
      };
    });

    const data: DashboardHistoryData = {
      windowHours: hours,
      series,
      topDisruptedLines,
      coverage: {
        firstBucket: series[0]?.bucketStart ?? null,
        lastBucket: series.at(-1)?.bucketStart ?? null,
        buckets: series.length,
        samples: series.reduce((total, point) => total + point.samples, 0),
      },
    };

    setPublicCache(c, 20, 40);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: latestSnapshot.data?.captured_at ?? data.coverage.lastBucket,
        cacheTtlSeconds: 300,
        requestId: requestId(c),
        config: deps.config,
        source: 'derived',
        dataQuality: 'historical',
        warnings:
          series.length === 0
            ? ['Sem agregados horários para a janela pedida. Execute sync/status.']
            : undefined,
      }),
    } satisfies ApiEnvelope<DashboardHistoryData>);
  });

  app.get('/dashboard/summary', async (c) => {
    const supabase = getDb(deps.supabase);
    const [reference, sources, latestSnapshot] = await Promise.all([
      loadReference(supabase),
      fetchAllRows<DataSourceRow>(
        supabase,
        'data_sources',
        'id,name,publisher,url,license,license_url,attribution_text,refresh_policy,last_attempt_at,last_success_at,status,notes',
        { order: { column: 'name' } },
      ),
      supabase
        .from('network_status_snapshots')
        .select(
          'id,captured_at,lines_total,lines_normal,lines_attention,lines_severe,lines_closed,lines_unknown,disruptions_active,stations_affected,payload',
        )
        .order('captured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const byLine = new Map<string, number>();
    for (const disruption of reference.disruptions) {
      if (!disruption.lineId) continue;
      byLine.set(disruption.lineId, (byLine.get(disruption.lineId) ?? 0) + 1);
    }
    const lineNames = new Map(reference.lines.map((line) => [line.id, line.name]));
    const topLines: DashboardTopLine[] = [...byLine.entries()]
      .map(([lineId, disruptionCount]) => ({
        lineId,
        lineName: lineNames.get(lineId) ?? null,
        disruptionCount,
      }))
      .sort((a, b) => b.disruptionCount - a.disruptionCount)
      .slice(0, 8);

    const snapshot = (latestSnapshot.data as NetworkSnapshotRow | null) ?? null;
    const stationsAffected =
      reference.summary.stationsAffected ?? snapshot?.stations_affected ?? null;

    const data: DashboardSummaryData = {
      summary: {
        ...reference.summary,
        stationsAffected,
        lastCapturedAt: reference.lastStatusAt ?? snapshot?.captured_at ?? null,
      },
      topLines,
      linesWithStatus: reference.lines.filter((line) => line.status !== null).length,
      dataHealth: {
        sourcesOk: sources.filter((source) => source.status === 'ok').length,
        sourcesError: sources.filter((source) => source.status === 'error').length,
        lastStatusAt: reference.lastStatusAt,
        lastReferenceAt: reference.lastReferenceAt,
      },
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
    } satisfies ApiEnvelope<DashboardSummaryData>);
  });
}

function parseHours(value: string | undefined): number {
  if (value === undefined || value === '') return 24;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168) {
    throw new ApiHttpError(
      400,
      'invalid_hours',
      'O parâmetro hours deve ser um inteiro entre 1 e 168.',
    );
  }
  return parsed;
}
