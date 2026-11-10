import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildStationIndex,
  parseFootfallCsv,
  resolveStationName,
  type CanonicalStation,
  type StationResolution,
} from './parse.ts';

export const FOOTFALL_URL =
  'https://crowding.data.tfl.gov.uk/Network%20Demand/StationFootfall_2025_2026%20.csv';
export const FOOTFALL_DATASET = 'tfl-station-footfall-2025-2026';
export const FOOTFALL_DEFAULT_FILE = path.join(os.tmpdir(), 'ldt-station-footfall-2025-2026.csv');

export interface FootfallIngestOptions {
  file?: string;
  from?: string;
  to?: string;
  limit?: number;
  dryRun?: boolean;
  refresh?: boolean;
  reportPath?: string;
}

interface StationRow {
  id: string;
  name: string;
  display_name: string;
  stop_type: string | null;
  modes: string[] | null;
  line_ids: string[] | null;
}

interface AggregateRow {
  stationId: string;
  travelDate: string;
  entries: number | null;
  exits: number | null;
}

export interface FootfallIngestReport {
  sourceDataset: string;
  sourceUrl: string;
  file: string;
  window: { from: string | null; to: string | null };
  rowsRead: number;
  rowsInWindow: number;
  rowsMatched: number;
  rowsUnmatched: number;
  rowsSkipped: number;
  stationCount: number;
  resolution: Record<string, number>;
  heuristicNames: Array<{ name: string; stationId: string; candidates: string[] }>;
  unmatchedNames: Array<{ name: string; rows: number }>;
  aggregatedRows: number;
  upsertedRows: number;
  firstDate: string | null;
  lastDate: string | null;
  dryRun: boolean;
  jobId: number | null;
}

function requiredEnv(): { url: string; key: string } {
  const url = (process.env.LOCAL_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(
    /\/+$/,
    '',
  );
  const key =
    process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (ou aliases LOCAL_*) não estão definidos.',
    );
  }
  return { url, key };
}

function restFactory(url: string, key: string) {
  return async function rest<T = unknown>(
    pathname: string,
    init: RequestInit = {},
  ): Promise<T | null> {
    const response = await fetch(`${url}/rest/v1/${pathname}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${pathname} → ${response.status}: ${text}`);
    }
    return text ? (JSON.parse(text) as T) : null;
  };
}

async function loadStations(rest: ReturnType<typeof restFactory>): Promise<CanonicalStation[]> {
  const rows = await rest<StationRow[]>(
    'stations?select=id,name,display_name,stop_type,modes,line_ids&is_active=eq.true&stop_type=in.(NaptanMetroStation,NaptanRailStation)&limit=1000',
  );
  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    stopType: row.stop_type,
    modes: row.modes ?? [],
    lineIds: row.line_ids ?? [],
  }));
}

async function loadCsv(options: FootfallIngestOptions): Promise<{ text: string; file: string }> {
  if (options.file) {
    return { text: await fsp.readFile(options.file, 'utf8'), file: options.file };
  }
  const file = FOOTFALL_DEFAULT_FILE;
  if (!options.refresh && fs.existsSync(file) && fs.statSync(file).size > 1_000_000) {
    return { text: await fsp.readFile(file, 'utf8'), file };
  }
  const response = await fetch(FOOTFALL_URL);
  if (!response.ok) {
    throw new Error(`Download do footfall falhou: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, 'utf8');
  return { text, file };
}

function sumCount(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

export async function runFootfallIngest(
  options: FootfallIngestOptions = {},
): Promise<FootfallIngestReport> {
  const { url, key } = requiredEnv();
  const rest = restFactory(url, key);
  const stations = await loadStations(rest);
  if (stations.length === 0) {
    throw new Error('Sem estações canónicas; execute sync-reference primeiro.');
  }
  const index = buildStationIndex(stations);
  const { text, file } = await loadCsv(options);
  const parsed = parseFootfallCsv(text);

  const window = { from: options.from ?? null, to: options.to ?? null };
  const filtered = parsed.rows.filter(
    (row) =>
      (!window.from || row.travelDate >= window.from) &&
      (!window.to || row.travelDate <= window.to),
  );
  const limited = options.limit ? filtered.slice(0, options.limit) : filtered;

  const resolutions = new Map<string, StationResolution>();
  const unmatched = new Map<string, number>();
  const heuristics = new Map<string, { stationId: string; candidates: string[] }>();
  const resolutionCounts: Record<string, number> = {
    alias: 0,
    unique: 0,
    suffix: 0,
    heuristic: 0,
    unmatched: 0,
  };
  const aggregates = new Map<string, AggregateRow>();
  let matched = 0;
  let unmatchedRows = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const row of limited) {
    let resolution = resolutions.get(row.stationName);
    if (!resolution) {
      resolution = resolveStationName(row.stationName, index);
      resolutions.set(row.stationName, resolution);
      resolutionCounts[resolution.via] = (resolutionCounts[resolution.via] ?? 0) + 1;
      if (resolution.via === 'heuristic' && resolution.stationId) {
        heuristics.set(row.stationName, {
          stationId: resolution.stationId,
          candidates: resolution.candidates,
        });
      }
    }

    if (!resolution.stationId) {
      unmatchedRows += 1;
      unmatched.set(row.stationName, (unmatched.get(row.stationName) ?? 0) + 1);
      continue;
    }

    matched += 1;
    const key = `${resolution.stationId}|${row.travelDate}`;
    const current = aggregates.get(key);
    if (current) {
      current.entries = sumCount(current.entries, row.entries);
      current.exits = sumCount(current.exits, row.exits);
    } else {
      aggregates.set(key, {
        stationId: resolution.stationId,
        travelDate: row.travelDate,
        entries: row.entries,
        exits: row.exits,
      });
    }
    if (!firstDate || row.travelDate < firstDate) firstDate = row.travelDate;
    if (!lastDate || row.travelDate > lastDate) lastDate = row.travelDate;
  }

  const aggregated = [...aggregates.values()];
  const stationCount = new Set(aggregated.map((row) => row.stationId)).size;
  const report: FootfallIngestReport = {
    sourceDataset: FOOTFALL_DATASET,
    sourceUrl: FOOTFALL_URL,
    file,
    window,
    rowsRead: parsed.rows.length,
    rowsInWindow: limited.length,
    rowsMatched: matched,
    rowsUnmatched: unmatchedRows,
    rowsSkipped: parsed.skipped,
    stationCount,
    resolution: resolutionCounts,
    heuristicNames: [...heuristics.entries()].map(([name, value]) => ({ name, ...value })),
    unmatchedNames: [...unmatched.entries()]
      .map(([name, rows]) => ({ name, rows }))
      .sort((a, b) => b.rows - a.rows),
    aggregatedRows: aggregated.length,
    upsertedRows: 0,
    firstDate,
    lastDate,
    dryRun: Boolean(options.dryRun),
    jobId: null,
  };

  if (options.dryRun) return report;

  const startedAt = new Date().toISOString();
  const [job] = (await rest<Array<{ id: number }>>('data_sync_jobs?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      job_name: 'ingest-footfall',
      function_name: 'ingest',
      started_at: startedAt,
      status: 'running',
    }),
  })) ?? [{ id: 0 }];
  report.jobId = job?.id ?? null;

  try {
    const fetchedAt = new Date().toISOString();
    const batchSize = 1000;
    for (let offset = 0; offset < aggregated.length; offset += batchSize) {
      const batch = aggregated.slice(offset, offset + batchSize).map((row) => ({
        station_id: row.stationId,
        source_dataset: FOOTFALL_DATASET,
        granularity: 'daily',
        travel_date: row.travelDate,
        entries: row.entries,
        exits: row.exits,
        fetched_at: fetchedAt,
      }));
      await rest(
        'station_traffic_snapshots?on_conflict=station_id,source_dataset,granularity,travel_date',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(batch),
        },
      );
      report.upsertedRows += batch.length;
    }

    const status = report.rowsUnmatched > 0 || report.rowsSkipped > 0 ? 'partial' : 'success';
    await rest(`data_sync_jobs?id=eq.${report.jobId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        finished_at: new Date().toISOString(),
        status,
        records_read: report.rowsRead,
        records_upserted: report.upsertedRows,
        metadata: {
          dataset: FOOTFALL_DATASET,
          firstDate,
          lastDate,
          stations: stationCount,
          unmatched: report.unmatchedNames.slice(0, 20),
          skipped: report.rowsSkipped,
        },
      }),
    });
    await rest('data_sources?id=eq.tfl-station-footfall', {
      method: 'PATCH',
      body: JSON.stringify({
        last_attempt_at: fetchedAt,
        last_success_at: fetchedAt,
        status: 'ok',
      }),
    });
  } catch (error) {
    await rest('data_sources?id=eq.tfl-station-footfall', {
      method: 'PATCH',
      body: JSON.stringify({ last_attempt_at: new Date().toISOString(), status: 'error' }),
    }).catch(() => undefined);
    if (report.jobId) {
      await rest(`data_sync_jobs?id=eq.${report.jobId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          finished_at: new Date().toISOString(),
          status: 'failed',
          records_read: report.rowsRead,
          records_upserted: report.upsertedRows,
          error_message: (error instanceof Error ? error.message : String(error)).slice(0, 800),
        }),
      }).catch(() => undefined);
    }
    throw error;
  }

  if (options.reportPath) {
    await fsp.mkdir(path.dirname(options.reportPath), { recursive: true });
    await fsp.writeFile(options.reportPath, JSON.stringify(report, null, 2), 'utf8');
  }

  return report;
}
