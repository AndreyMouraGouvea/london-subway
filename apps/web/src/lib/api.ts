import type {
  AnalyticsNetworkData,
  AnalyticsScenarioData,
  AnnualStationCountsData,
  ApiEnvelope,
  DashboardHistoryData,
  DashboardSummaryData,
  DataHealthData,
  DataSourceSummary,
  DisruptionSummary,
  FootfallSummaryData,
  HealthCheckResult,
  LineAnnualBoardingsData,
  LineDetailData,
  LineSummary,
  NetworkData,
  NetworkStatusData,
  RodsStationData,
  ScenarioType,
  StationArrivalsData,
  StationCrowdingData,
  StationDetailData,
  StationFootfallData,
  StationSummary,
  SyncJobSummary,
} from '@ldt/shared';
import { env } from './env';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: { status: number; code: string; details?: unknown }) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  if (!env.apiBaseUrl) {
    throw new ApiClientError('API não configurada. Defina VITE_API_BASE_URL.', {
      status: 0,
      code: 'api_not_configured',
    });
  }

  const response = await fetchWithTimeout(`${env.apiBaseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...init.headers,
    },
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError('A API devolveu uma resposta inválida.', {
      status: response.status,
      code: 'invalid_json',
    });
  }

  const envelope = body as ApiEnvelope<T>;
  if (!response.ok || envelope.error) {
    throw new ApiClientError(envelope.error?.message ?? `A API respondeu ${response.status}.`, {
      status: response.status,
      code: envelope.error?.code ?? 'api_error',
      details: envelope.error?.details,
    });
  }

  return envelope;
}

export const api = {
  getHealth: () => request<HealthCheckResult>('/health'),
  getNetwork: () => request<NetworkData>('/network'),
  getNetworkStatus: () => request<NetworkStatusData>('/network/status'),
  getDashboardSummary: () => request<DashboardSummaryData>('/dashboard/summary'),
  getDashboardHistory: (hours = 24) =>
    request<DashboardHistoryData>(`/dashboard/history?hours=${hours}`),
  getDataHealth: () => request<DataHealthData>('/data-health'),
  getJobs: (limit = 10) => request<SyncJobSummary[]>(`/jobs?limit=${limit}`),
  getAnalyticsNetwork: () => request<AnalyticsNetworkData>('/analytics/network'),
  getAnalyticsScenario: (type: ScenarioType, id: string) => {
    const params = new URLSearchParams({ type, id });
    return request<AnalyticsScenarioData>(`/analytics/scenarios?${params.toString()}`);
  },
  getFootfallSummary: (days = 30, limit = 12) =>
    request<FootfallSummaryData>(`/analytics/footfall/summary?days=${days}&limit=${limit}`),
  getStationFootfall: (stationId: string, days = 90) =>
    request<StationFootfallData>(
      `/analytics/footfall/stations/${encodeURIComponent(stationId)}?days=${days}`,
    ),
  getAnnualSummary: (limit = 10) =>
    request<AnnualStationCountsData>(`/analytics/annual/summary?limit=${limit}`),
  getLineBoardings: () => request<LineAnnualBoardingsData>('/analytics/boardings'),
  getStationCrowding: (stationId: string) =>
    request<StationCrowdingData>(`/analytics/crowding/stations/${encodeURIComponent(stationId)}`),
  getRodsStation: (stationId: string, metric: 'boarders' | 'alighters' = 'boarders') =>
    request<RodsStationData>(
      `/analytics/rods/stations/${encodeURIComponent(stationId)}?metric=${metric}`,
    ),
  getLines: () => request<LineSummary[]>('/lines'),
  getLineDetail: (lineId: string) =>
    request<LineDetailData>(`/lines/${encodeURIComponent(lineId)}`),
  getStations: (lineId?: string) =>
    request<StationSummary[]>(
      lineId ? `/stations?lineId=${encodeURIComponent(lineId)}` : '/stations',
    ),
  getStationDetail: (stationId: string) =>
    request<StationDetailData>(`/stations/${encodeURIComponent(stationId)}`),
  getStationArrivals: (stationId: string, lineId?: string, count = 8) => {
    const params = new URLSearchParams({ count: String(count) });
    if (lineId) params.set('lineId', lineId);
    return request<StationArrivalsData>(
      `/stations/${encodeURIComponent(stationId)}/arrivals?${params.toString()}`,
    );
  },
  getDisruptions: (lineId?: string) =>
    request<DisruptionSummary[]>(
      lineId ? `/disruptions?lineId=${encodeURIComponent(lineId)}` : '/disruptions',
    ),
  getSources: () => request<DataSourceSummary[]>('/sources'),
};
