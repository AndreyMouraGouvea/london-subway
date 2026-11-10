import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unzipSync } from 'fflate';
import * as XLSX from 'xlsx';
import {
  buildStationIndex,
  rawKey,
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

export const RODS_URL = 'https://crowding.data.tfl.gov.uk/RODS/rods.zip';
export const RODS_DATASET = 'tfl-rods-2017';
const RODS_FILE = path.join(os.tmpdir(), 'ldt-rods-2017.zip');

const LINE_BY_NAME: Readonly<Record<string, string>> = {
  Bakerloo: 'bakerloo',
  Central: 'central',
  Circle: 'circle',
  District: 'district',
  'Hammersmith & C': 'hammersmith-city',
  Jubilee: 'jubilee',
  Metropolitan: 'metropolitan',
  Northern: 'northern',
  Piccadilly: 'piccadilly',
  Victoria: 'victoria',
  'Waterloo & City': 'waterloo-city',
};

type RodsMetric = 'boarders' | 'alighters';

export interface RodsIngestReport {
  rowsRead: number;
  boarders: number;
  alighters: number;
  profiles: number;
  stations: number;
  unmatchedStations: string[];
  unmappedLines: string[];
  jobId: number | null;
}

async function download(refresh: boolean): Promise<string> {
  if (!refresh && fs.existsSync(RODS_FILE) && fs.statSync(RODS_FILE).size > 1_000_000) {
    return RODS_FILE;
  }
  const response = await fetch(RODS_URL);
  if (!response.ok) throw new Error(`Download RODS falhou: ${response.status}`);
  await fsp.writeFile(RODS_FILE, Buffer.from(await response.arrayBuffer()));
  return RODS_FILE;
}

function intervalStart(label: unknown): string | null {
  const match = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(String(label).trim());
  if (!match) return null;
  return `${match[1]}:${match[2]}:00`;
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function resolveRodsStation(
  stationName: string,
  lineName: string,
  index: ReturnType<typeof buildStationIndex>,
): StationResolution {
  const key = rawKey(stationName);
  if (key === 'hammersmith') {
    return {
      stationId: lineName === 'Hammersmith & C' ? '940GZZLUHSC' : '940GZZLUHSD',
      via: 'alias',
      candidates: ['940GZZLUHSC', '940GZZLUHSD'],
    };
  }
  if (key === 'edgware road') {
    return {
      stationId: lineName === 'Bakerloo' ? '940GZZLUERB' : '940GZZLUERC',
      via: 'alias',
      candidates: ['940GZZLUERB', '940GZZLUERC'],
    };
  }
  if (key === 'paddington') {
    return {
      stationId: lineName === 'Hammersmith & C' ? '940GZZLUPAH' : '940GZZLUPAC',
      via: 'alias',
      candidates: ['940GZZLUPAC', '940GZZLUPAH'],
    };
  }
  return resolveStationName(stationName, index);
}

export async function runRodsIngest(
  options: { refresh?: boolean; dryRun?: boolean } = {},
): Promise<RodsIngestReport> {
  const { url, key } = requiredEnv();
  const rest = restFactory(url, key);
  const stations = await loadCanonicalStations(rest);
  const index = buildStationIndex(stations);
  const file = await download(Boolean(options.refresh));
  const archive = unzipSync(new Uint8Array(await fsp.readFile(file)));
  const entryName = Object.keys(archive).find((name) =>
    name.endsWith('Boarders and alighters by station-line-time of day 2017.xls'),
  );
  if (!entryName) {
    throw new Error('RODS: ficheiro de boarders/alighters não encontrado no ZIP.');
  }
  const buffer = Buffer.from(archive[entryName]!);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const rowsByKey = new Map<string, { passengers: number; metric: RodsMetric }>();
  const unmatched = new Set<string>();
  const unmappedLines = new Set<string>();
  let rowsRead = 0;
  let boarders = 0;
  let alighters = 0;

  for (const metric of ['boarders', 'alighters'] as const) {
    const sheetName = metric === 'boarders' ? 'Boarders' : 'Alighters';
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`RODS: sheet ${sheetName} em falta.`);
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });
    const header = matrix[2] ?? [];
    const intervals = header
      .map((label, column) => ({ label, column, start: intervalStart(label) }))
      .filter(
        (entry): entry is { label: unknown; column: number; start: string } =>
          entry.start !== null && entry.column >= 10,
      );

    for (let rowIndex = 3; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      const stationName = textValue(row[0]);
      const lineName = textValue(row[1]);
      const direction = textValue(row[2]);
      if (!stationName || !lineName) continue;
      rowsRead += 1;
      const resolution = resolveRodsStation(stationName, lineName, index);
      if (!resolution.stationId) {
        unmatched.add(stationName);
        continue;
      }
      const lineId = LINE_BY_NAME[lineName] ?? null;
      if (!lineId) unmappedLines.add(lineName);

      for (const interval of intervals) {
        const value = numberValue(row[interval.column]);
        if (value === null) continue;
        const key = `${metric}|${resolution.stationId}|${lineId ?? lineName}|${direction}|${interval.start}`;
        const current = rowsByKey.get(key);
        if (current) current.passengers += value;
        else rowsByKey.set(key, { passengers: value, metric });
      }
      if (metric === 'boarders') boarders += 1;
      else alighters += 1;
    }
  }

  const fetchedAt = new Date().toISOString();
  const profiles = [...rowsByKey.entries()].map(([profileKey, value]) => {
    const [metric, stationId, lineId, direction, interval] = profileKey.split('|');
    return {
      profile_key: `rods-2017|${profileKey}`,
      station_id: stationId!,
      source_dataset: RODS_DATASET,
      profile_name: `RODS 2017 ${metric}`,
      kind: 'entry_exit' as const,
      interval_start: interval!,
      passengers: Number(value.passengers.toFixed(2)),
      from_station_id: null,
      to_station_id: null,
      line_id: lineId && lineId !== '' ? lineId : null,
      platform_direction: direction && direction !== '' ? direction : null,
      fetched_at: fetchedAt,
    };
  });

  const stationCount = new Set(profiles.map((profile) => profile.station_id)).size;
  const report: RodsIngestReport = {
    rowsRead,
    boarders,
    alighters,
    profiles: profiles.length,
    stations: stationCount,
    unmatchedStations: [...unmatched].sort(),
    unmappedLines: [...unmappedLines].sort(),
    jobId: null,
  };
  if (options.dryRun) return report;

  const jobId = await startJob(rest, 'ingest-rods-2017');
  report.jobId = jobId;
  try {
    let upserted = 0;
    for (const batch of chunk(profiles, 1000)) {
      await rest('station_crowding_profiles?on_conflict=profile_key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      });
      upserted += batch.length;
    }
    await finishJob(rest, jobId, {
      status: unmatched.size > 0 || unmappedLines.size > 0 ? 'partial' : 'success',
      recordsRead: rowsRead,
      recordsUpserted: upserted,
      metadata: {
        dataset: RODS_DATASET,
        boarders,
        alighters,
        stations: stationCount,
        unmatched: [...unmatched].slice(0, 30),
        unmappedLines: [...unmappedLines],
      },
    });
    await markSource(rest, RODS_DATASET, 'ok');
    return report;
  } catch (error) {
    await markSource(rest, RODS_DATASET, 'error');
    await finishJob(rest, jobId, {
      status: 'failed',
      recordsRead: rowsRead,
      recordsUpserted: 0,
      error,
    });
    throw error;
  }
}
