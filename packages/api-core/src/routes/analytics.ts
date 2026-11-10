import type { Hono } from 'hono';
import type {
  AnalyticsCriticalStation,
  AnalyticsLineImpact,
  AnalyticsNetworkData,
  AnalyticsScenarioData,
  AnnualStationCount,
  AnnualStationCountsData,
  ApiEnvelope,
  CrowdingInterval,
  FootfallDay,
  FootfallSummaryData,
  FootfallTopStation,
  LineAnnualBoardingsData,
  LineAnnualBoardingsRow,
  RodsStationData,
  ScenarioAffectedStation,
  ScenarioType,
  StationCrowdingData,
  StationFootfallData,
} from '../../../shared/src/types/api.ts';
import type { ApiDependencies } from '../router.ts';
import type { AppEnv } from '../http.ts';
import { fetchAllRows } from '../db.ts';
import { ApiHttpError } from '../errors.ts';
import { dbMeta, getDb, parseCount, requestId, setPublicCache } from './helpers.ts';
import { maxIso } from './data.ts';
import {
  analyseScenario,
  articulationPoints,
  buildGraph,
  connectedComponents,
  uniqueTransferLinks,
  uniqueUndirectedLinks,
  type OrderedStationRow,
  type StationGraph,
} from '../analytics/graph.ts';
import { summariseAccessibility } from '../analytics/accessibility.ts';

const FOOTFALL_DATASET = 'tfl-station-footfall-2025-2026';
const FOOTFALL_NOTE =
  'Footfall histórico diário por estação. Não é ocupação nem afluência em tempo real.';
const ANNUAL_DATASET = 'tfl-annual-station-counts-2025';
const ANNUAL_NOTE =
  'Entradas/saídas anuais por estação em 2025. Dados históricos; não é procura em tempo real.';
const LINK_FLOWS_DATASET = 'tfl-station-link-flows-2017';
const CROWDING_NOTE =
  'Perfil típico de 2017 por intervalos de 15 minutos. Histórico; não representa ocupação em tempo real.';
const RODS_DATASET = 'tfl-rods-2017';
const RODS_NOTE =
  'Estimativas ponderadas do RODS 2017, reconciliadas com contagens de Autumn 2017. Histórico; não é ocupação em tempo real.';

interface AnalyticsStationRow {
  id: string;
  name: string;
  display_name: string;
  zone: string | null;
  line_ids: string[] | null;
  hub_naptan_code: string | null;
  step_free: boolean | null;
  has_lifts: boolean | null;
  has_toilets: boolean | null;
  has_wifi: boolean | null;
  facilities: Record<string, string> | null;
  last_synced_at: string | null;
}

interface AnalyticsLineRow {
  id: string;
  name: string;
  color_hex: string | null;
}

interface FootfallRow {
  station_id: string;
  travel_date: string;
  entries: number | null;
  exits: number | null;
  fetched_at: string;
}

interface StationNameRow {
  id: string;
  display_name: string;
  line_ids: string[] | null;
}

export function registerAnalyticsRoutes(app: Hono<AppEnv>, deps: ApiDependencies): void {
  app.get('/analytics/network', async (c) => {
    const supabase = getDb(deps.supabase);
    const context = await loadGraphContext(supabase);
    const components = connectedComponents(context.graph.nodes, context.graph.edges);
    const largestComponent = components.reduce((largest, component) => {
      return component.length > largest ? component.length : largest;
    }, 0);
    const articulation = articulationPoints(context.graph);
    const stationById = new Map(context.stations.map((station) => [station.id, station]));

    const criticalStations: AnalyticsCriticalStation[] = context.graph.nodes
      .map((stationId) => {
        const station = stationById.get(stationId);
        return {
          stationId,
          name: station?.display_name || station?.name || stationId,
          lineIds: station?.line_ids ?? [],
          degree: context.graph.adjacency.get(stationId)?.size ?? 0,
          articulation: articulation.has(stationId),
        };
      })
      .filter((station) => station.degree > 0)
      .sort((a, b) => {
        if (a.articulation !== b.articulation) return a.articulation ? -1 : 1;
        if (a.degree !== b.degree) return b.degree - a.degree;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 12);

    const lineImpact: AnalyticsLineImpact[] = context.lines
      .map((line) => {
        const lineEdges = context.graph.edges.filter((edge) => edge.lineId === line.id);
        const stationsServed = new Set<string>();
        for (const edge of lineEdges) {
          stationsServed.add(edge.from);
          stationsServed.add(edge.to);
        }
        const result = analyseScenario(context.graph, 'line_failure', line.id);
        return {
          lineId: line.id,
          lineName: line.name,
          colorHex: line.color_hex,
          stationsServed: stationsServed.size,
          isolatedStations: result.isolated.length,
          componentsAfter: result.components.length,
          stationsOutsideLargest: result.outsideLargest.length,
        };
      })
      .sort(
        (a, b) =>
          b.stationsOutsideLargest - a.stationsOutsideLargest ||
          b.isolatedStations - a.isolatedStations ||
          a.lineName.localeCompare(b.lineName),
      );

    const data: AnalyticsNetworkData = {
      graph: {
        stations: context.graph.nodes.length,
        undirectedLinks: uniqueUndirectedLinks(context.graph),
        transferLinks: uniqueTransferLinks(context.graph),
        lines: context.lines.length,
        components: components.length,
        largestComponent,
        isolatedStations: components.filter((component) => component.length === 1).length,
      },
      accessibility: summariseAccessibility(
        context.stations.map((station) => ({
          lineIds: station.line_ids ?? [],
          zone: station.zone,
          stepFree: station.step_free,
          hasLifts: station.has_lifts,
          hasToilets: station.has_toilets,
          hasWifi: station.has_wifi,
          facilities: station.facilities,
        })),
      ),
      criticalStations,
      lineImpact,
      generatedAt: new Date().toISOString(),
    };

    setPublicCache(c, 60, 120);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: context.lastReferenceAt,
        cacheTtlSeconds: 3600,
        requestId: requestId(c),
        config: deps.config,
        source: 'derived',
        dataQuality: 'derived',
      }),
    } satisfies ApiEnvelope<AnalyticsNetworkData>);
  });

  app.get('/analytics/scenarios', async (c) => {
    const type = parseScenarioType(c.req.query('type'));
    const id = c.req.query('id')?.trim();
    if (!id) {
      throw new ApiHttpError(400, 'invalid_scenario', 'O parâmetro id é obrigatório.');
    }
    const supabase = getDb(deps.supabase);
    const context = await loadGraphContext(supabase);

    if (type === 'station_closure' && !context.stations.some((station) => station.id === id)) {
      throw new ApiHttpError(404, 'scenario_target_not_found', 'Estação desconhecida.', { id });
    }
    if (type === 'line_failure' && !context.lines.some((line) => line.id === id)) {
      throw new ApiHttpError(404, 'scenario_target_not_found', 'Linha desconhecida.', { id });
    }

    const baselineComponents = connectedComponents(context.graph.nodes, context.graph.edges);
    const baselineLargest = baselineComponents.reduce(
      (largest, component) => Math.max(largest, component.length),
      0,
    );
    const result = analyseScenario(context.graph, type, id);
    const stationById = new Map(context.stations.map((station) => [station.id, station]));
    const affectedStations: ScenarioAffectedStation[] = result.affected
      .map((entry) => {
        const station = stationById.get(entry.stationId);
        return {
          stationId: entry.stationId,
          name: station?.display_name || station?.name || entry.stationId,
          lineIds: station?.line_ids ?? [],
          reason: entry.reason,
        };
      })
      .sort((a, b) => {
        const order = { removed: 0, isolated: 1, outside_largest: 2 };
        return order[a.reason] - order[b.reason] || a.name.localeCompare(b.name);
      });

    const target =
      type === 'station_closure'
        ? context.stations.find((station) => station.id === id)
        : context.lines.find((line) => line.id === id);
    const label =
      type === 'station_closure'
        ? (target as AnalyticsStationRow | undefined)?.display_name || id
        : (target as AnalyticsLineRow | undefined)?.name || id;
    const remainingStations = context.graph.nodes.length - result.removedNodes.size;

    const assumptions =
      type === 'station_closure'
        ? [
            'A estação e todas as ligações incidentes são removidas do grafo.',
            'Não são simuladas rotas alternativas, autocarros de substituição nem tempos de viagem.',
            'O resultado mede conectividade topológica, não o serviço em tempo real.',
          ]
        : [
            'Todas as ligações da linha são removidas do grafo.',
            'Estações servidas por outras linhas permanecem ligadas por essas linhas.',
            'Não são simuladas frequências, capacidade, transbordo ou tempos de viagem.',
          ];

    const data: AnalyticsScenarioData = {
      scenario: {
        type,
        id,
        label,
        assumptions,
        generatedAt: new Date().toISOString(),
      },
      baseline: {
        stations: context.graph.nodes.length,
        links: uniqueUndirectedLinks(context.graph),
        components: baselineComponents.length,
        largestComponent: baselineLargest,
      },
      impact: {
        removedStations: result.removedNodes.size,
        removedLinks: result.removedEdges.length,
        isolatedStations: result.isolated.length,
        componentsAfter: result.components.length,
        largestComponent: result.largestComponent.length,
        stationsOutsideLargest: result.outsideLargest.length,
        connectivityLoss:
          remainingStations > 0
            ? Number((result.outsideLargest.length / remainingStations).toFixed(4))
            : 0,
      },
      affectedStations,
    };

    setPublicCache(c, 30, 60);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: context.lastReferenceAt,
        cacheTtlSeconds: 300,
        requestId: requestId(c),
        config: deps.config,
        source: 'derived',
        dataQuality: 'scenario',
      }),
    } satisfies ApiEnvelope<AnalyticsScenarioData>);
  });

  app.get('/analytics/footfall/summary', async (c) => {
    const days = parseDays(c.req.query('days'), 30);
    const limit = parseCount(c.req.query('limit'), { defaultValue: 12, min: 1, max: 30 });
    const supabase = getDb(deps.supabase);
    const latest = await loadLatestFootfallDate(supabase);
    if (!latest) {
      const empty: FootfallSummaryData = {
        dataset: FOOTFALL_DATASET,
        granularity: 'daily',
        windowDays: days,
        latestDate: null,
        firstDate: null,
        lastDate: null,
        stationsWithData: 0,
        totalEntries: null,
        totalExits: null,
        series: [],
        topStations: [],
        note: FOOTFALL_NOTE,
      };
      return c.json({
        data: empty,
        meta: dbMeta({
          fetchedAt: null,
          cacheTtlSeconds: 86400,
          requestId: requestId(c),
          config: deps.config,
          source: 'tfl-open-data',
          dataQuality: 'historical',
          warnings: ['Sem footfall ingerido. Execute npm run ingest:footfall.'],
        }),
      } satisfies ApiEnvelope<FootfallSummaryData>);
    }

    const since = minusDays(latest.travel_date, days - 1);
    const rows = await fetchAllRows<FootfallRow>(
      supabase,
      'station_traffic_snapshots',
      'station_id,travel_date,entries,exits,fetched_at',
      {
        eq: { source_dataset: FOOTFALL_DATASET, granularity: 'daily' },
        gte: { travel_date: since },
        lte: { travel_date: latest.travel_date },
        order: { column: 'travel_date' },
      },
    );
    const stationNames = await fetchAllRows<StationNameRow>(
      supabase,
      'stations',
      'id,display_name,line_ids',
      { eq: { is_active: true } },
    );
    const nameById = new Map(stationNames.map((station) => [station.id, station]));

    const byDate = new Map<string, { entries: number | null; exits: number | null }>();
    const byStation = new Map<string, { entries: number | null; exits: number | null }>();
    let totalEntries: number | null = null;
    let totalExits: number | null = null;
    let fetchedAt: string | null = null;

    for (const row of rows) {
      const date = byDate.get(row.travel_date) ?? { entries: null, exits: null };
      date.entries = sumCount(date.entries, row.entries);
      date.exits = sumCount(date.exits, row.exits);
      byDate.set(row.travel_date, date);

      const station = byStation.get(row.station_id) ?? { entries: null, exits: null };
      station.entries = sumCount(station.entries, row.entries);
      station.exits = sumCount(station.exits, row.exits);
      byStation.set(row.station_id, station);

      totalEntries = sumCount(totalEntries, row.entries);
      totalExits = sumCount(totalExits, row.exits);
      if (!fetchedAt || row.fetched_at > fetchedAt) fetchedAt = row.fetched_at;
    }

    const series: FootfallDay[] = [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, entries: value.entries, exits: value.exits }));

    const topStations: FootfallTopStation[] = [...byStation.entries()]
      .map(([stationId, value]) => {
        const station = nameById.get(stationId);
        const entries = value.entries ?? 0;
        const exits = value.exits ?? 0;
        return {
          stationId,
          name: station?.display_name ?? stationId,
          lineIds: station?.line_ids ?? [],
          entries,
          exits,
          total: entries + exits,
        };
      })
      .filter((station) => station.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    const data: FootfallSummaryData = {
      dataset: FOOTFALL_DATASET,
      granularity: 'daily',
      windowDays: days,
      latestDate: latest.travel_date,
      firstDate: series[0]?.date ?? null,
      lastDate: series.at(-1)?.date ?? null,
      stationsWithData: byStation.size,
      totalEntries,
      totalExits,
      series,
      topStations,
      note: FOOTFALL_NOTE,
    };

    setPublicCache(c, 300, 600);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: fetchedAt ?? latest.fetched_at,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        source: 'tfl-open-data',
        dataQuality: 'historical',
      }),
    } satisfies ApiEnvelope<FootfallSummaryData>);
  });

  app.get('/analytics/footfall/stations/:stationId', async (c) => {
    const stationId = c.req.param('stationId');
    const days = parseDays(c.req.query('days'), 90);
    const supabase = getDb(deps.supabase);
    const { data: station, error } = await supabase
      .from('stations')
      .select('id,display_name,line_ids')
      .eq('id', stationId)
      .maybeSingle();
    if (error) {
      throw new ApiHttpError(500, 'database_error', error.message);
    }
    if (!station) {
      throw new ApiHttpError(404, 'station_not_found', 'Estação desconhecida.', {
        stationId,
      });
    }

    const latest = await loadLatestFootfallDate(supabase, stationId);
    if (!latest) {
      const empty: StationFootfallData = {
        station: {
          id: station.id,
          name: station.display_name,
          lineIds: station.line_ids ?? [],
        },
        dataset: FOOTFALL_DATASET,
        latestDate: null,
        series: [],
        totals: { entries: null, exits: null, days: 0 },
        note: FOOTFALL_NOTE,
      };
      return c.json({
        data: empty,
        meta: dbMeta({
          fetchedAt: null,
          cacheTtlSeconds: 86400,
          requestId: requestId(c),
          config: deps.config,
          source: 'tfl-open-data',
          dataQuality: 'historical',
          warnings: ['Sem footfall para esta estação.'],
        }),
      } satisfies ApiEnvelope<StationFootfallData>);
    }

    const since = minusDays(latest.travel_date, days - 1);
    const rows = await fetchAllRows<FootfallRow>(
      supabase,
      'station_traffic_snapshots',
      'station_id,travel_date,entries,exits,fetched_at',
      {
        eq: {
          station_id: stationId,
          source_dataset: FOOTFALL_DATASET,
          granularity: 'daily',
        },
        gte: { travel_date: since },
        lte: { travel_date: latest.travel_date },
        order: { column: 'travel_date' },
      },
    );

    let totalEntries: number | null = null;
    let totalExits: number | null = null;
    let fetchedAt: string | null = null;
    for (const row of rows) {
      totalEntries = sumCount(totalEntries, row.entries);
      totalExits = sumCount(totalExits, row.exits);
      if (!fetchedAt || row.fetched_at > fetchedAt) fetchedAt = row.fetched_at;
    }

    const data: StationFootfallData = {
      station: {
        id: station.id,
        name: station.display_name,
        lineIds: station.line_ids ?? [],
      },
      dataset: FOOTFALL_DATASET,
      latestDate: latest.travel_date,
      series: rows.map((row) => ({
        date: row.travel_date,
        entries: row.entries,
        exits: row.exits,
      })),
      totals: { entries: totalEntries, exits: totalExits, days: rows.length },
      note: FOOTFALL_NOTE,
    };

    setPublicCache(c, 300, 600);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt: fetchedAt ?? latest.fetched_at,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        source: 'tfl-open-data',
        dataQuality: 'historical',
      }),
    } satisfies ApiEnvelope<StationFootfallData>);
  });

  app.get('/analytics/annual/summary', async (c) => {
    const limit = parseCount(c.req.query('limit'), { defaultValue: 12, min: 1, max: 50 });
    const supabase = getDb(deps.supabase);
    const [rows, stations] = await Promise.all([
      fetchAllRows<{
        station_id: string;
        annual_entries_exits: number | null;
        fetched_at: string;
      }>(supabase, 'station_traffic_snapshots', 'station_id,annual_entries_exits,fetched_at', {
        eq: { source_dataset: ANNUAL_DATASET, granularity: 'annual' },
      }),
      fetchAllRows<StationNameRow>(supabase, 'stations', 'id,display_name,line_ids', {
        eq: { is_active: true },
      }),
    ]);
    const nameById = new Map(stations.map((station) => [station.id, station]));
    const totals = new Map<string, number>();
    let fetchedAt: string | null = null;
    for (const row of rows) {
      if (row.annual_entries_exits === null) continue;
      totals.set(row.station_id, (totals.get(row.station_id) ?? 0) + row.annual_entries_exits);
      if (!fetchedAt || row.fetched_at > fetchedAt) fetchedAt = row.fetched_at;
    }
    const topStations: AnnualStationCount[] = [...totals.entries()]
      .map(([stationId, annualEntriesExits]) => {
        const station = nameById.get(stationId);
        return {
          stationId,
          name: station?.display_name ?? stationId,
          lineIds: station?.line_ids ?? [],
          annualEntriesExits,
        };
      })
      .sort((a, b) => b.annualEntriesExits - a.annualEntriesExits)
      .slice(0, limit);

    const data: AnnualStationCountsData = {
      dataset: ANNUAL_DATASET,
      year: 2025,
      stationCount: totals.size,
      totalAnnualEntriesExits: [...totals.values()].reduce((total, value) => total + value, 0),
      topStations,
      note: ANNUAL_NOTE,
    };

    setPublicCache(c, 300, 600);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        source: 'tfl-open-data',
        dataQuality: 'historical',
        warnings:
          rows.length === 0 ? ['Sem annual counts. Execute npm run ingest:annual.'] : undefined,
      }),
    } satisfies ApiEnvelope<AnnualStationCountsData>);
  });

  app.get('/analytics/boardings', async (c) => {
    const supabase = getDb(deps.supabase);
    const rows = await fetchAllRows<{
      line_id: string | null;
      line_code: string;
      line_name: string;
      mode: string;
      year: number;
      boardings: number;
      fetched_at: string;
    }>(
      supabase,
      'line_annual_boardings',
      'line_id,line_code,line_name,mode,year,boardings,fetched_at',
      { order: { column: 'year' } },
    );

    const years = [...new Set(rows.map((row) => Number(row.year)))].sort((a, b) => a - b);
    const byLine = new Map<string, LineAnnualBoardingsRow>();
    let fetchedAt: string | null = null;
    for (const row of rows) {
      const key = `${row.line_code}|${row.line_name}`;
      const entry = byLine.get(key) ?? {
        lineId: row.line_id,
        lineCode: row.line_code,
        lineName: row.line_name,
        mode: row.mode,
        latestYear: null,
        latestBoardings: null,
        series: [],
      };
      const year = Number(row.year);
      const boardings = Number(row.boardings);
      entry.series.push({ year, boardings });
      if (entry.latestYear === null || year > entry.latestYear) {
        entry.latestYear = year;
        entry.latestBoardings = boardings;
      }
      byLine.set(key, entry);
      if (!fetchedAt || row.fetched_at > fetchedAt) fetchedAt = row.fetched_at;
    }

    const lines = [...byLine.values()]
      .map((line) => ({
        ...line,
        series: line.series.sort((a, b) => a.year - b.year),
      }))
      .sort((a, b) => (b.latestBoardings ?? 0) - (a.latestBoardings ?? 0));
    const latestYear = years.at(-1) ?? null;

    const data: LineAnnualBoardingsData = {
      dataset: 'tfl-numbat',
      years,
      latestYear,
      lines,
      note: 'Boardings anuais estimados pela TfL (NUMBAT). Dados históricos; não é procura em tempo real.',
    };

    setPublicCache(c, 300, 600);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        source: 'tfl-open-data',
        dataQuality: 'historical',
        warnings: rows.length === 0 ? ['Sem NUMBAT. Execute npm run ingest:numbat.'] : undefined,
      }),
    } satisfies ApiEnvelope<LineAnnualBoardingsData>);
  });

  app.get('/analytics/crowding/stations/:stationId', async (c) => {
    const stationId = c.req.param('stationId');
    const supabase = getDb(deps.supabase);
    const { data: station, error } = await supabase
      .from('stations')
      .select('id,display_name,line_ids')
      .eq('id', stationId)
      .maybeSingle();
    if (error) throw new ApiHttpError(500, 'database_error', error.message);
    if (!station) {
      throw new ApiHttpError(404, 'station_not_found', 'Estação desconhecida.', { stationId });
    }

    const rows = await fetchAllRows<{
      interval_start: string;
      passengers: number;
      profile_name: string;
      fetched_at: string;
    }>(supabase, 'station_crowding_profiles', 'interval_start,passengers,profile_name,fetched_at', {
      eq: {
        station_id: stationId,
        source_dataset: LINK_FLOWS_DATASET,
        kind: 'link_flow',
      },
      order: { column: 'interval_start' },
    });

    const intervals: CrowdingInterval[] = rows.map((row) => ({
      intervalStart: String(row.interval_start).slice(0, 5),
      passengers: Number(row.passengers),
    }));
    const totalPassengers = intervals.reduce((total, interval) => total + interval.passengers, 0);
    const fetchedAt = rows.reduce<string | null>(
      (latest, row) => (!latest || row.fetched_at > latest ? row.fetched_at : latest),
      null,
    );

    const data: StationCrowdingData = {
      station: {
        id: station.id,
        name: station.display_name,
        lineIds: station.line_ids ?? [],
      },
      dataset: LINK_FLOWS_DATASET,
      profileName: rows[0]?.profile_name ?? '2017 typical',
      kind: 'link_flow',
      intervals,
      totalPassengers,
      note: CROWDING_NOTE,
    };

    setPublicCache(c, 300, 600);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        source: 'tfl-open-data',
        dataQuality: 'historical',
        warnings:
          rows.length === 0
            ? ['Sem perfil de crowding. Execute npm run ingest:crowding.']
            : undefined,
      }),
    } satisfies ApiEnvelope<StationCrowdingData>);
  });

  app.get('/analytics/rods/stations/:stationId', async (c) => {
    const stationId = c.req.param('stationId');
    const metricParam = c.req.query('metric') ?? 'boarders';
    if (metricParam !== 'boarders' && metricParam !== 'alighters') {
      throw new ApiHttpError(400, 'invalid_metric', 'metric deve ser boarders ou alighters.');
    }
    const metric = metricParam;
    const supabase = getDb(deps.supabase);
    const { data: station, error } = await supabase
      .from('stations')
      .select('id,display_name,line_ids')
      .eq('id', stationId)
      .maybeSingle();
    if (error) throw new ApiHttpError(500, 'database_error', error.message);
    if (!station) {
      throw new ApiHttpError(404, 'station_not_found', 'Estação desconhecida.', { stationId });
    }

    const rows = await fetchAllRows<{
      interval_start: string;
      passengers: number;
      fetched_at: string;
    }>(supabase, 'station_crowding_profiles', 'interval_start,passengers,fetched_at', {
      eq: {
        station_id: stationId,
        source_dataset: RODS_DATASET,
        profile_name: `RODS 2017 ${metric}`,
      },
      order: { column: 'interval_start' },
    });

    const byInterval = new Map<string, number>();
    let fetchedAt: string | null = null;
    for (const row of rows) {
      const start = String(row.interval_start).slice(0, 5);
      byInterval.set(start, (byInterval.get(start) ?? 0) + Number(row.passengers));
      if (!fetchedAt || row.fetched_at > fetchedAt) fetchedAt = row.fetched_at;
    }
    const intervals: CrowdingInterval[] = [...byInterval.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([intervalStart, passengers]) => ({
        intervalStart,
        passengers: Number(passengers.toFixed(2)),
      }));
    const totalPassengers = intervals.reduce((total, interval) => total + interval.passengers, 0);

    const data: RodsStationData = {
      station: {
        id: station.id,
        name: station.display_name,
        lineIds: station.line_ids ?? [],
      },
      dataset: RODS_DATASET,
      metric,
      intervals,
      totalPassengers: Number(totalPassengers.toFixed(2)),
      note: RODS_NOTE,
    };

    setPublicCache(c, 300, 600);
    return c.json({
      data,
      meta: dbMeta({
        fetchedAt,
        cacheTtlSeconds: 86400,
        requestId: requestId(c),
        config: deps.config,
        source: 'tfl-open-data',
        dataQuality: 'historical',
        warnings:
          rows.length === 0
            ? ['Sem RODS para esta estação. Execute npm run ingest:rods.']
            : undefined,
      }),
    } satisfies ApiEnvelope<RodsStationData>);
  });
}

async function loadGraphContext(supabase: ReturnType<typeof getDb>) {
  const [stations, orderedRows, lines] = await Promise.all([
    fetchAllRows<AnalyticsStationRow>(
      supabase,
      'stations',
      'id,name,display_name,zone,line_ids,hub_naptan_code,step_free,has_lifts,has_toilets,has_wifi,facilities,last_synced_at',
      {
        eq: { is_active: true },
        in: { stop_type: ['NaptanMetroStation', 'NaptanRailStation'] },
        order: { column: 'display_name' },
      },
    ),
    fetchAllRows<OrderedStationRow>(
      supabase,
      'line_stations',
      'line_id,station_id,direction,branch_id,sequence',
      { eq: { is_active: true } },
    ),
    fetchAllRows<AnalyticsLineRow>(supabase, 'lines', 'id,name,color_hex', {
      eq: { is_active: true },
      order: { column: 'name' },
    }),
  ]);

  const graph: StationGraph = buildGraph(
    stations.map((station) => station.id),
    orderedRows,
    new Map(
      stations
        .filter((station) => station.hub_naptan_code)
        .map((station) => [station.id, station.hub_naptan_code as string]),
    ),
  );
  return {
    stations,
    lines,
    graph,
    lastReferenceAt: maxIso(stations.map((station) => station.last_synced_at)),
  };
}

async function loadLatestFootfallDate(
  supabase: ReturnType<typeof getDb>,
  stationId?: string,
): Promise<{ travel_date: string; fetched_at: string } | null> {
  let query = supabase
    .from('station_traffic_snapshots')
    .select('travel_date,fetched_at')
    .eq('source_dataset', FOOTFALL_DATASET)
    .eq('granularity', 'daily');
  if (stationId) query = query.eq('station_id', stationId);
  const { data, error } = await query
    .order('travel_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new ApiHttpError(500, 'database_error', error.message);
  }
  return (data as { travel_date: string; fetched_at: string } | null) ?? null;
}

function sumCount(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

function minusDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function parseDays(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 730) {
    throw new ApiHttpError(400, 'invalid_days', 'days deve ser um inteiro entre 1 e 730.');
  }
  return parsed;
}

function parseScenarioType(value: string | undefined): ScenarioType {
  if (value === 'station_closure' || value === 'line_failure') return value;
  throw new ApiHttpError(
    400,
    'invalid_scenario_type',
    'type deve ser station_closure ou line_failure.',
  );
}
