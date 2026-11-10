/**
 * Ingestão de datasets grandes da TfL.
 *
 * Uso:
 *   npm run ingest -w @ldt/ingest -- --check
 *   npm run footfall -w @ldt/ingest -- [--dry-run] [--from=YYYY-MM-DD]
 *       [--to=YYYY-MM-DD] [--limit=N] [--file=...] [--refresh] [--report=...]
 */

import { config as loadEnv } from 'dotenv';
import { runAnnualIngest } from './annual/ingest.ts';
import { runCrowdingIngest } from './crowding/ingest.ts';
import { runFootfallIngest } from './footfall/run.ts';
import { runNumbatIngest } from './numbat/ingest.ts';
import { runRodsIngest } from './rods/ingest.ts';

loadEnv({ path: ['../../.env.local', '../../.env', '.env.local', '.env'], quiet: true });

interface DatasetDefinition {
  id: string;
  name: string;
  url: string;
  kind: 'csv' | 'xlsx' | 'zip' | 'kml';
  notes: string;
}

const DATASETS: readonly DatasetDefinition[] = [
  {
    id: 'station-footfall-2025-2026',
    name: 'Station Footfall 2025–2026',
    url: 'https://crowding.data.tfl.gov.uk/Network%20Demand/StationFootfall_2025_2026%20.csv',
    kind: 'csv',
    notes: 'TravelDate, DayOfWeek, Station, EntryTapCount, ExitTapCount',
  },
  {
    id: 'journeys-2025-2026',
    name: 'Network Journeys 2025–2026',
    url: 'https://crowding.data.tfl.gov.uk/Network%20Demand/Journeys_2025_2026%20.csv',
    kind: 'csv',
    notes: 'TravelDate, DayOfWeek, TubeJourneyCount, BusJourneyCount',
  },
  {
    id: 'annual-station-counts-2025',
    name: 'Annual Station Counts 2025',
    url: 'https://crowding.data.tfl.gov.uk/Annual%20Station%20Counts/2025/AC2025_AnnualisedEntryExit_public.xlsx',
    kind: 'xlsx',
    notes: 'Annualised entry/exit counts by station',
  },
  {
    id: 'crowding-station-nodes',
    name: 'Crowding station nodes description',
    url: 'https://crowding.data.tfl.gov.uk/Crowding/StationNodesDescription.csv',
    kind: 'csv',
    notes: 'Nodes, platforms, entrances and exits',
  },
  {
    id: 'crowding-link-flows',
    name: 'Station passenger link flows',
    url: 'https://crowding.data.tfl.gov.uk/Crowding/StationPassengerLinkFlows.csv',
    kind: 'csv',
    notes: '15-minute passenger movements between nodes',
  },
  {
    id: 'crowding-train-loading',
    name: 'LU train loading data',
    url: 'https://crowding.data.tfl.gov.uk/Crowding/LUTrainLoadingData.csv',
    kind: 'csv',
    notes: '15-minute loading by station-to-station link',
  },
  {
    id: 'rods',
    name: 'Rolling Origin and Destination Survey',
    url: 'https://crowding.data.tfl.gov.uk/RODS/rods.zip',
    kind: 'zip',
    notes: 'Origin-destination matrices',
  },
  {
    id: 'numbat',
    name: 'NUMBAT annualised boarders',
    url: 'https://crowding.data.tfl.gov.uk/NUMBAT/NBT16-25_AnnualisedBoarders_Outputs.xlsx',
    kind: 'xlsx',
    notes: 'Annualised boarders by station',
  },
] as const;

async function checkDatasets(): Promise<void> {
  for (const dataset of DATASETS) {
    try {
      const response = await fetch(dataset.url, { method: 'HEAD' });
      console.info(
        JSON.stringify({
          event: 'dataset_check',
          id: dataset.id,
          status: response.status,
          ok: response.ok,
          contentLength: response.headers.get('content-length'),
          lastModified: response.headers.get('last-modified'),
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'dataset_check_failed',
          id: dataset.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

function listDatasets(): void {
  console.info(
    JSON.stringify(
      {
        event: 'dataset_catalog',
        count: DATASETS.length,
        datasets: DATASETS.map(({ id, name, kind, url, notes }) => ({
          id,
          name,
          kind,
          url,
          notes,
        })),
      },
      null,
      2,
    ),
  );
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const args = process.argv.slice(2);
const refresh = hasFlag('refresh');
const reportPath = readArg('report');

if (args.includes('--all')) {
  const footfall = await runFootfallIngest({ refresh, reportPath });
  const annual = await runAnnualIngest({ refresh });
  const numbat = await runNumbatIngest({ refresh });
  const crowding = await runCrowdingIngest({ refresh });
  const rods = await runRodsIngest({ refresh });
  console.info(
    JSON.stringify(
      {
        event: 'ingest_all',
        footfall: {
          rows: footfall.rowsRead,
          matched: footfall.rowsMatched,
          unmatched: footfall.rowsUnmatched,
          upserted: footfall.upsertedRows,
        },
        annual,
        numbat,
        crowding,
        rods,
      },
      null,
      2,
    ),
  );
} else if (args.includes('--footfall')) {
  const limit = readArg('limit');
  const report = await runFootfallIngest({
    file: readArg('file'),
    from: readArg('from'),
    to: readArg('to'),
    limit: limit ? Number(limit) : undefined,
    dryRun: hasFlag('dry-run'),
    refresh,
    reportPath,
  });
  console.info(JSON.stringify({ event: 'footfall_ingest', ...report }, null, 2));
} else if (args.includes('--annual')) {
  console.info(
    JSON.stringify({ event: 'annual_ingest', ...(await runAnnualIngest({ refresh })) }, null, 2),
  );
} else if (args.includes('--numbat')) {
  console.info(
    JSON.stringify({ event: 'numbat_ingest', ...(await runNumbatIngest({ refresh })) }, null, 2),
  );
} else if (args.includes('--crowding')) {
  console.info(
    JSON.stringify(
      { event: 'crowding_ingest', ...(await runCrowdingIngest({ refresh })) },
      null,
      2,
    ),
  );
} else if (args.includes('--rods')) {
  console.info(
    JSON.stringify(
      {
        event: 'rods_ingest',
        ...(await runRodsIngest({ refresh, dryRun: hasFlag('dry-run') })),
      },
      null,
      2,
    ),
  );
} else if (args.includes('--check')) {
  await checkDatasets();
} else {
  listDatasets();
}

export {};
