import type { DataSourceStatus, DataQuality, StatusBand } from './domain.ts';

/**
 * Metadados obrigatórios em toda resposta da API própria.
 * `fetchedAt` é a coleta na fonte; `cachedAt` é a escrita/leitura do cache.
 */
export interface ApiMeta {
  source: 'tfl-unified-api' | 'tfl-open-data' | 'derived' | 'cache';
  fetchedAt: string | null;
  cachedAt: string | null;
  cacheTtlSeconds: number;
  isStale: boolean;
  dataSourceStatus: DataSourceStatus;
  ageSeconds: number | null;
  requestId: string;
  schemaVersion: string;
  dataQuality: DataQuality;
  upstream?: {
    status: number;
    ttlSeconds?: number;
    error?: string;
  };
  warnings?: string[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  data: T | null;
  meta: ApiMeta;
  error?: ApiErrorBody;
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  version: string;
  time: string;
  checks: {
    database: 'ok' | 'error' | 'not_configured';
    cache: 'ok' | 'error' | 'not_configured';
    tfl: 'ok' | 'error' | 'not_checked';
  };
}

export interface LineCurrentStatus {
  severity: number;
  description: string;
  band: StatusBand;
  reason: string | null;
  category: string | null;
  validityFrom: string | null;
  validityTo: string | null;
  isNow: boolean | null;
  capturedAt: string | null;
}

export interface LineSummary {
  id: string;
  name: string;
  mode: string;
  colorHex: string | null;
  textColorHex: string | null;
  status: LineCurrentStatus | null;
  disruptionCount: number;
  stationCount: number | null;
  updatedAt: string | null;
  dataQuality: DataQuality;
}

export interface StationSummary {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zone: string | null;
  modes: string[];
  lineIds: string[];
  stepFree: boolean | null;
  stepFreeSource: string | null;
  facilities: {
    lifts: number | null;
    escalators: number | null;
    toilets: boolean | null;
    wifi: boolean | null;
    parking: boolean | null;
    ticketHalls: number | null;
  };
  status: {
    band: StatusBand;
    label: string;
    derivedFromLineIds: string[];
    confidence: 'derived';
  } | null;
  updatedAt: string | null;
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: number[][];
}

export interface GeoJSONMultiLineString {
  type: 'MultiLineString';
  coordinates: number[][][];
}

export interface LinePathData {
  lineId: string;
  direction: 'inbound' | 'outbound';
  branchId: number;
  routeName: string | null;
  geometry: GeoJSONLineString | GeoJSONMultiLineString;
  fetchedAt: string | null;
  derived: boolean;
}

export interface NetworkSummary {
  linesTotal: number;
  stationsTotal: number;
  normal: number;
  attention: number;
  severe: number;
  closure: number;
  unknown: number;
  disruptionsActive: number;
  stationsAffected: number | null;
  lastCapturedAt: string | null;
}

export interface NetworkData {
  lines: LineSummary[];
  stations: StationSummary[];
  paths: LinePathData[];
  summary: NetworkSummary;
}

export interface DisruptionSummary {
  id: string;
  lineId: string | null;
  stationId: string | null;
  scope: 'line' | 'station' | 'network';
  category: string | null;
  type: string | null;
  categoryDescription: string | null;
  summary: string | null;
  description: string | null;
  additionalInfo: string | null;
  closureText: string | null;
  severityLevel: number | null;
  band: StatusBand;
  validityPeriods: unknown[];
  startsAt: string | null;
  endsAt: string | null;
  affectedStops: unknown[];
  affectedRoutes: unknown[];
  firstSeenAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

export interface ArrivalSummary {
  id: string;
  stationId: string;
  stationName: string | null;
  lineId: string | null;
  lineName: string | null;
  platformName: string | null;
  direction: string | null;
  towards: string | null;
  destinationName: string | null;
  destinationStationId: string | null;
  expectedArrival: string | null;
  timeToStationSeconds: number | null;
  currentLocation: string | null;
  modeName: string | null;
}

export interface LineDetailData {
  line: LineSummary;
  statuses: LineCurrentStatus[];
  disruptions: DisruptionSummary[];
  stations: StationSummary[];
  paths: LinePathData[];
}

export interface NetworkStatusData {
  summary: NetworkSummary;
  lines: LineSummary[];
}

export interface LineRouteBranch {
  branchId: number;
  routeName: string | null;
  stations: StationSummary[];
}

export interface LineRouteData {
  lineId: string;
  direction: 'inbound' | 'outbound';
  derived: boolean;
  branches: LineRouteBranch[];
  paths: LinePathData[];
}

export interface StationEntranceSummary {
  id: string;
  name: string | null;
  stopType: string | null;
  lat: number;
  lon: number;
}

export interface StationDetailData {
  station: StationSummary;
  entrances: StationEntranceSummary[];
  facilities: Record<string, string>;
  disruptions: DisruptionSummary[];
}

export interface StationArrivalsData {
  stationId: string;
  stationName: string | null;
  arrivals: ArrivalSummary[];
}

export interface DashboardTopLine {
  lineId: string;
  lineName: string | null;
  disruptionCount: number;
}

export interface DashboardSummaryData {
  summary: NetworkSummary;
  topLines: DashboardTopLine[];
  linesWithStatus: number;
  dataHealth: {
    sourcesOk: number;
    sourcesError: number;
    lastStatusAt: string | null;
    lastReferenceAt: string | null;
  };
}

export interface DashboardHistoryPoint {
  bucketStart: string;
  samples: number;
  linesTotal: number;
  normal: number;
  attention: number;
  severe: number;
  closure: number;
  unknown: number;
  disruptionsActive: number;
  stationsAffected: number | null;
}

export interface DashboardDisruptedLine {
  lineId: string;
  lineName: string | null;
  disruptedBuckets: number;
  totalBuckets: number;
  /** 0..1, calculado a partir dos buckets horários observados. */
  disruptionRate: number;
}

export interface DashboardHistoryData {
  windowHours: number;
  series: DashboardHistoryPoint[];
  topDisruptedLines: DashboardDisruptedLine[];
  coverage: {
    firstBucket: string | null;
    lastBucket: string | null;
    buckets: number;
    samples: number;
  };
}

export type SyncJobStatus = 'running' | 'success' | 'partial' | 'failed';

export interface SyncJobSummary {
  id: number;
  jobName: string;
  status: SyncJobStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  recordsRead: number | null;
  recordsUpserted: number | null;
}

export interface RetentionPolicy {
  statusSnapshotsDays: number;
  syncJobsDays: number;
  cacheStaleHours: number;
  arrivalPredictionsHours: number;
}

export interface DataHealthData {
  sources: DataSourceSummary[];
  jobs: SyncJobSummary[];
  retention: RetentionPolicy;
}

export interface AnalyticsGraphSummary {
  stations: number;
  /** Pares estação–estação únicos, independentemente do número de linhas. */
  undirectedLinks: number;
  /** Pares de transferência dentro do mesmo hub, sem segmento físico. */
  transferLinks: number;
  lines: number;
  components: number;
  largestComponent: number;
  isolatedStations: number;
}

export interface AnalyticsAccessibility {
  totalStations: number;
  withLifts: number;
  withToilets: number;
  withWifi: number;
  stepFreeKnown: number;
  stepFreeUnknown: number;
  interchanges: number;
  missingZone: number;
  note: string;
}

export interface AnalyticsCriticalStation {
  stationId: string;
  name: string;
  lineIds: string[];
  degree: number;
  articulation: boolean;
}

export interface AnalyticsLineImpact {
  lineId: string;
  lineName: string;
  colorHex: string | null;
  stationsServed: number;
  isolatedStations: number;
  componentsAfter: number;
  stationsOutsideLargest: number;
}

export interface AnalyticsNetworkData {
  graph: AnalyticsGraphSummary;
  accessibility: AnalyticsAccessibility;
  criticalStations: AnalyticsCriticalStation[];
  lineImpact: AnalyticsLineImpact[];
  generatedAt: string;
}

export type ScenarioType = 'station_closure' | 'line_failure';

export interface ScenarioAffectedStation {
  stationId: string;
  name: string;
  lineIds: string[];
  reason: 'removed' | 'isolated' | 'outside_largest';
}

export interface AnalyticsScenarioData {
  scenario: {
    type: ScenarioType;
    id: string;
    label: string;
    assumptions: string[];
    generatedAt: string;
  };
  baseline: {
    stations: number;
    links: number;
    components: number;
    largestComponent: number;
  };
  impact: {
    removedStations: number;
    removedLinks: number;
    isolatedStations: number;
    componentsAfter: number;
    largestComponent: number;
    stationsOutsideLargest: number;
    /** 0..1: fração de estações restantes fora da maior componente. */
    connectivityLoss: number;
  };
  affectedStations: ScenarioAffectedStation[];
}

export interface FootfallDay {
  date: string;
  entries: number | null;
  exits: number | null;
}

export interface FootfallTopStation {
  stationId: string;
  name: string;
  lineIds: string[];
  entries: number;
  exits: number;
  total: number;
}

export interface FootfallSummaryData {
  dataset: string;
  granularity: 'daily';
  windowDays: number;
  latestDate: string | null;
  firstDate: string | null;
  lastDate: string | null;
  stationsWithData: number;
  totalEntries: number | null;
  totalExits: number | null;
  series: FootfallDay[];
  topStations: FootfallTopStation[];
  note: string;
}

export interface StationFootfallData {
  station: {
    id: string;
    name: string;
    lineIds: string[];
  };
  dataset: string;
  latestDate: string | null;
  series: FootfallDay[];
  totals: {
    entries: number | null;
    exits: number | null;
    days: number;
  };
  note: string;
}

export interface AnnualStationCount {
  stationId: string;
  name: string;
  lineIds: string[];
  annualEntriesExits: number;
}

export interface AnnualStationCountsData {
  dataset: string;
  year: number;
  stationCount: number;
  totalAnnualEntriesExits: number;
  topStations: AnnualStationCount[];
  note: string;
}

export interface LineAnnualBoardingsRow {
  lineId: string | null;
  lineCode: string;
  lineName: string;
  mode: string;
  latestYear: number | null;
  latestBoardings: number | null;
  series: Array<{ year: number; boardings: number }>;
}

export interface LineAnnualBoardingsData {
  dataset: string;
  years: number[];
  latestYear: number | null;
  lines: LineAnnualBoardingsRow[];
  note: string;
}

export interface CrowdingInterval {
  intervalStart: string;
  passengers: number;
}

export interface StationCrowdingData {
  station: {
    id: string;
    name: string;
    lineIds: string[];
  };
  dataset: string;
  profileName: string;
  kind: 'link_flow';
  intervals: CrowdingInterval[];
  totalPassengers: number;
  note: string;
}

export interface RodsStationData {
  station: {
    id: string;
    name: string;
    lineIds: string[];
  };
  dataset: string;
  metric: 'boarders' | 'alighters';
  intervals: CrowdingInterval[];
  totalPassengers: number;
  note: string;
}

export interface DataSourceSummary {
  id: string;
  name: string;
  publisher: string;
  url: string | null;
  license: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  refreshPolicy: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  status: string;
  notes: string | null;
}

export interface SyncResult {
  jobId: number;
  jobName: string;
  status: 'success' | 'partial' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  recordsRead: number;
  recordsUpserted: number;
  warnings: string[];
}
