import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCount, parseCsvLine } from '../footfall/parse.ts';
import {
  chunk,
  finishJob,
  loadCanonicalStations,
  markSource,
  requiredEnv,
  restFactory,
  startJob,
} from '../lib/supabase.ts';

export const NODES_URL = 'https://crowding.data.tfl.gov.uk/Crowding/StationNodesDescription.csv';
export const LINK_FLOWS_URL =
  'https://crowding.data.tfl.gov.uk/Crowding/StationPassengerLinkFlows.csv';
export const TRAIN_LOADING_URL = 'https://crowding.data.tfl.gov.uk/Crowding/LUTrainLoadingData.csv';
export const LINK_FLOWS_DATASET = 'tfl-station-link-flows-2017';
export const TRAIN_LOADING_DATASET = 'tfl-train-loading-2017';
const PROFILE_NAME = '2017 typical';

const LINE_BY_NAME: Readonly<Record<string, string>> = {
  Bakerloo: 'bakerloo',
  Central: 'central',
  Circle: 'circle',
  District: 'district',
  'Hammersmith & City': 'hammersmith-city',
  Jubilee: 'jubilee',
  Metropolitan: 'metropolitan',
  Northern: 'northern',
  Piccadilly: 'piccadilly',
  Victoria: 'victoria',
  'Waterloo & City': 'waterloo-city',
};

export interface CrowdingIngestReport {
  linkFlowRows: number;
  linkFlowProfiles: number;
  trainLoadingRows: number;
  trainLoadingProfiles: number;
  stationsWithLinkFlows: number;
  stationsWithTrainLoading: number;
  unmatchedNaptan: string[];
  jobId: number | null;
}

function downloadPath(name: string): string {
  return path.join(os.tmpdir(), `ldt-${name}`);
}

async function download(url: string, target: string, refresh: boolean): Promise<string> {
  if (!refresh && fs.existsSync(target) && fs.statSync(target).size > 1_000) return target;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download falhou (${url}): ${response.status}`);
  await fsp.writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

function intervalStart(label: string): string | null {
  const match = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(label.trim());
  if (!match) return null;
  return `${match[1]}:${match[2]}:00`;
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const header = parseCsvLine(lines.shift() ?? '');
  return { header, rows: lines.map(parseCsvLine) };
}

export async function runCrowdingIngest(
  options: { refresh?: boolean } = {},
): Promise<CrowdingIngestReport> {
  const { url, key } = requiredEnv();
  const rest = restFactory(url, key);
  const stations = await loadCanonicalStations(rest);
  const stationIds = new Set(stations.map((station) => station.id));

  const [nodesFile, linkFlowsFile, trainLoadingFile] = await Promise.all([
    download(NODES_URL, downloadPath('crowding-nodes-2017.csv'), Boolean(options.refresh)),
    download(LINK_FLOWS_URL, downloadPath('link-flows-2017.csv'), Boolean(options.refresh)),
    download(TRAIN_LOADING_URL, downloadPath('train-loading-2017.csv'), Boolean(options.refresh)),
  ]);

  const nodesCsv = parseCsv(await fsp.readFile(nodesFile, 'utf8'));
  const nodeNaptan = new Map<string, string>();
  for (const row of nodesCsv.rows) {
    const naptan = (row[10] ?? '').trim();
    if (naptan) nodeNaptan.set((row[0] ?? '').trim(), naptan);
  }

  const linkCsv = parseCsv(await fsp.readFile(linkFlowsFile, 'utf8'));
  const linkIntervals = linkCsv.header
    .map((label, index) => ({ label, index, start: intervalStart(label) }))
    .filter(
      (entry): entry is { label: string; index: number; start: string } => entry.start !== null,
    );

  const linkTotals = new Map<string, { stationId: string; start: string; passengers: number }>();
  const unmatched = new Set<string>();
  let linkFlowRows = 0;
  for (const row of linkCsv.rows) {
    linkFlowRows += 1;
    const naptan = (row[4] ?? '').trim() || nodeNaptan.get((row[0] ?? '').trim()) || '';
    if (!stationIds.has(naptan)) {
      if (naptan) unmatched.add(naptan);
      continue;
    }
    for (const interval of linkIntervals) {
      const value = parseCount(row[interval.index]);
      if (value === null) continue;
      const key = `${naptan}|${interval.start}`;
      const current = linkTotals.get(key);
      if (current) current.passengers += value;
      else linkTotals.set(key, { stationId: naptan, start: interval.start, passengers: value });
    }
  }

  const trainCsv = parseCsv(await fsp.readFile(trainLoadingFile, 'utf8'));
  const trainIntervals = trainCsv.header
    .map((label, index) => ({ label, index, start: intervalStart(label) }))
    .filter(
      (entry): entry is { label: string; index: number; start: string } => entry.start !== null,
    );

  const trainProfiles: Array<{
    profile_key: string;
    station_id: string;
    source_dataset: string;
    profile_name: string;
    kind: 'train_loading';
    interval_start: string;
    passengers: number;
    from_station_id: string;
    to_station_id: string | null;
    line_id: string | null;
    platform_direction: string | null;
    fetched_at: string;
  }> = [];
  const fetchedAt = new Date().toISOString();
  const trainStations = new Set<string>();
  let trainLoadingRows = 0;

  for (const row of trainCsv.rows) {
    trainLoadingRows += 1;
    const from = (row[5] ?? '').trim();
    const to = (row[6] ?? '').trim() || null;
    if (!stationIds.has(from)) {
      if (from) unmatched.add(from);
      continue;
    }
    if (to && !stationIds.has(to)) unmatched.add(to);
    const lineId = LINE_BY_NAME[(row[2] ?? '').trim()] ?? null;
    const direction = (row[3] ?? '').trim() || (row[7] ?? '').trim() || null;
    trainStations.add(from);
    for (const interval of trainIntervals) {
      const value = parseCount(row[interval.index]);
      if (value === null) continue;
      trainProfiles.push({
        profile_key: `tfl-train-loading-2017|${from}|${to ?? ''}|${lineId ?? 'unknown'}|${direction ?? ''}|${interval.start}`,
        station_id: from,
        source_dataset: TRAIN_LOADING_DATASET,
        profile_name: PROFILE_NAME,
        kind: 'train_loading',
        interval_start: interval.start,
        passengers: value,
        from_station_id: from,
        to_station_id: to,
        line_id: lineId,
        platform_direction: direction,
        fetched_at: fetchedAt,
      });
    }
  }

  const linkProfiles = [...linkTotals.entries()].map(([key, value]) => ({
    profile_key: `tfl-station-link-flows-2017|${key}`,
    station_id: value.stationId,
    source_dataset: LINK_FLOWS_DATASET,
    profile_name: PROFILE_NAME,
    kind: 'link_flow' as const,
    interval_start: value.start,
    passengers: value.passengers,
    from_station_id: null,
    to_station_id: null,
    line_id: null,
    platform_direction: null,
    fetched_at: fetchedAt,
  }));

  const jobId = await startJob(rest, 'ingest-crowding-2017');
  try {
    let upserted = 0;
    for (const batch of chunk([...linkProfiles, ...trainProfiles], 1000)) {
      await rest('station_crowding_profiles?on_conflict=profile_key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(batch),
      });
      upserted += batch.length;
    }

    await finishJob(rest, jobId, {
      status: unmatched.size > 0 ? 'partial' : 'success',
      recordsRead: linkFlowRows + trainLoadingRows,
      recordsUpserted: upserted,
      metadata: {
        linkFlowRows,
        linkFlowProfiles: linkProfiles.length,
        trainLoadingRows,
        trainLoadingProfiles: trainProfiles.length,
        unmatched: [...unmatched].slice(0, 30),
      },
    });
    await markSource(rest, LINK_FLOWS_DATASET, 'ok');
    await markSource(rest, TRAIN_LOADING_DATASET, 'ok');

    return {
      linkFlowRows,
      linkFlowProfiles: linkProfiles.length,
      trainLoadingRows,
      trainLoadingProfiles: trainProfiles.length,
      stationsWithLinkFlows: new Set(linkProfiles.map((profile) => profile.station_id)).size,
      stationsWithTrainLoading: trainStations.size,
      unmatchedNaptan: [...unmatched].sort(),
      jobId,
    };
  } catch (error) {
    await markSource(rest, LINK_FLOWS_DATASET, 'error');
    await markSource(rest, TRAIN_LOADING_DATASET, 'error');
    await finishJob(rest, jobId, {
      status: 'failed',
      recordsRead: linkFlowRows + trainLoadingRows,
      recordsUpserted: 0,
      error,
    });
    throw error;
  }
}
