import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  buildStationIndex,
  resolveStationName,
  type StationResolution,
} from '../footfall/parse.ts';
import {
  chunk,
  finishJob,
  loadCanonicalStations,
  markSource,
  requiredEnv,
  restFactory,
  startJob,
} from '../lib/supabase.ts';

export const ANNUAL_URL =
  'https://crowding.data.tfl.gov.uk/Annual%20Station%20Counts/2025/AC2025_AnnualisedEntryExit_public.xlsx';
export const ANNUAL_DATASET = 'tfl-annual-station-counts-2025';
const ANNUAL_FILE = path.join(os.tmpdir(), 'ldt-annual-station-counts-2025.xlsx');
const ANNUAL_YEAR_END = '2025-12-31';

export interface AnnualIngestReport {
  sourceDataset: string;
  rowsRead: number;
  rowsMatched: number;
  rowsUnmatched: number;
  rowsSkipped: number;
  stationCount: number;
  totalAnnualEntriesExits: number;
  unmatchedNames: string[];
  heuristicNames: Array<{ name: string; stationId: string; candidates: string[] }>;
  upsertedRows: number;
  jobId: number | null;
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'result' in value) {
    const result = (value as { result?: unknown }).result;
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  }
  return null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText
      .map((part) => part.text)
      .join('')
      .trim();
  }
  return '';
}

async function downloadAnnual(refresh: boolean): Promise<string> {
  if (!refresh && fs.existsSync(ANNUAL_FILE) && fs.statSync(ANNUAL_FILE).size > 10_000) {
    return ANNUAL_FILE;
  }
  const response = await fetch(ANNUAL_URL);
  if (!response.ok) throw new Error(`Download annual counts falhou: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(ANNUAL_FILE, buffer);
  return ANNUAL_FILE;
}

export async function runAnnualIngest(
  options: {
    refresh?: boolean;
  } = {},
): Promise<AnnualIngestReport> {
  const { url, key } = requiredEnv();
  const rest = restFactory(url, key);
  const stations = await loadCanonicalStations(rest);
  const index = buildStationIndex(stations);
  const file = await downloadAnnual(Boolean(options.refresh));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('XLSX de annual counts sem sheets.');

  const resolutions = new Map<string, StationResolution>();
  const unmatched = new Set<string>();
  const heuristics = new Map<string, { stationId: string; candidates: string[] }>();
  const rows = new Map<string, { entriesExits: number; stationName: string }>();
  let read = 0;
  let matched = 0;
  let unmatchedRows = 0;
  let skipped = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 8) return;
    read += 1;
    const stationName = cellText(row.getCell(4).value);
    const annual = cellNumber(row.getCell(19).value);
    if (!stationName || annual === null || annual < 0) {
      skipped += 1;
      return;
    }

    let resolution = resolutions.get(stationName);
    if (!resolution) {
      resolution = resolveStationName(stationName, index);
      resolutions.set(stationName, resolution);
      if (resolution.via === 'heuristic' && resolution.stationId) {
        heuristics.set(stationName, {
          stationId: resolution.stationId,
          candidates: resolution.candidates,
        });
      }
    }
    if (!resolution.stationId) {
      unmatched.add(stationName);
      unmatchedRows += 1;
      return;
    }

    matched += 1;
    const current = rows.get(resolution.stationId);
    rows.set(resolution.stationId, {
      entriesExits: Math.round((current?.entriesExits ?? 0) + annual),
      stationName,
    });
  });

  const jobId = await startJob(rest, 'ingest-annual-station-counts');
  try {
    const fetchedAt = new Date().toISOString();
    let upserted = 0;
    for (const batch of chunk([...rows.entries()], 500)) {
      const payload = batch.map(([stationId, value]) => ({
        station_id: stationId,
        source_dataset: ANNUAL_DATASET,
        granularity: 'annual',
        travel_date: ANNUAL_YEAR_END,
        entries: null,
        exits: null,
        annual_entries_exits: value.entriesExits,
        fetched_at: fetchedAt,
      }));
      await rest(
        'station_traffic_snapshots?on_conflict=station_id,source_dataset,granularity,travel_date',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(payload),
        },
      );
      upserted += payload.length;
    }

    const status = unmatchedRows > 0 || skipped > 0 ? 'partial' : 'success';
    await finishJob(rest, jobId, {
      status,
      recordsRead: read,
      recordsUpserted: upserted,
      metadata: {
        dataset: ANNUAL_DATASET,
        unmatched: [...unmatched].slice(0, 30),
        skipped,
      },
    });
    await markSource(rest, ANNUAL_DATASET, 'ok');

    return {
      sourceDataset: ANNUAL_DATASET,
      rowsRead: read,
      rowsMatched: matched,
      rowsUnmatched: unmatchedRows,
      rowsSkipped: skipped,
      stationCount: rows.size,
      totalAnnualEntriesExits: [...rows.values()].reduce(
        (total, value) => total + value.entriesExits,
        0,
      ),
      unmatchedNames: [...unmatched].sort(),
      heuristicNames: [...heuristics.entries()].map(([name, value]) => ({ name, ...value })),
      upsertedRows: upserted,
      jobId,
    };
  } catch (error) {
    await markSource(rest, ANNUAL_DATASET, 'error');
    await finishJob(rest, jobId, {
      status: 'failed',
      recordsRead: read,
      recordsUpserted: 0,
      error,
    });
    throw error;
  }
}
