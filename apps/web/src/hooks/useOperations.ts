import { useQuery } from '@tanstack/react-query';
import type { ScenarioType } from '@ldt/shared';
import { api } from '../lib/api';
import { env } from '../lib/env';

const enabled = env.isApiConfigured;

export function useNetwork() {
  return useQuery({
    queryKey: ['network'],
    queryFn: () => api.getNetwork(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useLineDetail(lineId: string | null) {
  return useQuery({
    queryKey: ['line-detail', lineId],
    queryFn: () => api.getLineDetail(lineId as string),
    enabled: enabled && Boolean(lineId),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useStationDetail(stationId: string | null) {
  return useQuery({
    queryKey: ['station-detail', stationId],
    queryFn: () => api.getStationDetail(stationId as string),
    enabled: enabled && Boolean(stationId),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useStationArrivals(stationId: string | null, lineId?: string | null, count = 8) {
  return useQuery({
    queryKey: ['station-arrivals', stationId, lineId ?? 'all', count],
    queryFn: () => api.getStationArrivals(stationId as string, lineId ?? undefined, count),
    enabled: enabled && Boolean(stationId),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useNetworkStatus() {
  return useQuery({
    queryKey: ['network-status'],
    queryFn: () => api.getNetworkStatus(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.getDashboardSummary(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDashboardHistory(hours: number) {
  return useQuery({
    queryKey: ['dashboard-history', hours],
    queryFn: () => api.getDashboardHistory(hours),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDataHealth() {
  return useQuery({
    queryKey: ['data-health'],
    queryFn: () => api.getDataHealth(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useAnalyticsNetwork() {
  return useQuery({
    queryKey: ['analytics-network'],
    queryFn: () => api.getAnalyticsNetwork(),
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 2 * 60_000,
    retry: 1,
  });
}

export function useAnalyticsScenario(type: ScenarioType, id: string | null) {
  return useQuery({
    queryKey: ['analytics-scenario', type, id],
    queryFn: () => api.getAnalyticsScenario(type, id as string),
    enabled: enabled && Boolean(id),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useFootfallSummary(days = 30, limit = 12) {
  return useQuery({
    queryKey: ['footfall-summary', days, limit],
    queryFn: () => api.getFootfallSummary(days, limit),
    enabled,
    refetchInterval: 30 * 60_000,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useStationFootfall(stationId: string | null, days = 90) {
  return useQuery({
    queryKey: ['station-footfall', stationId, days],
    queryFn: () => api.getStationFootfall(stationId as string, days),
    enabled: enabled && Boolean(stationId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useAnnualSummary(limit = 10) {
  return useQuery({
    queryKey: ['annual-summary', limit],
    queryFn: () => api.getAnnualSummary(limit),
    enabled,
    refetchInterval: 30 * 60_000,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useLineBoardings() {
  return useQuery({
    queryKey: ['line-boardings'],
    queryFn: () => api.getLineBoardings(),
    enabled,
    refetchInterval: 30 * 60_000,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useStationCrowding(stationId: string | null) {
  return useQuery({
    queryKey: ['station-crowding', stationId],
    queryFn: () => api.getStationCrowding(stationId as string),
    enabled: enabled && Boolean(stationId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useRodsStation(
  stationId: string | null,
  metric: 'boarders' | 'alighters' = 'boarders',
) {
  return useQuery({
    queryKey: ['rods-station', stationId, metric],
    queryFn: () => api.getRodsStation(stationId as string, metric),
    enabled: enabled && Boolean(stationId),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useLines() {
  return useQuery({
    queryKey: ['lines'],
    queryFn: () => api.getLines(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useStations(lineId?: string) {
  return useQuery({
    queryKey: ['stations', lineId ?? 'all'],
    queryFn: () => api.getStations(lineId),
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useDisruptions(lineId?: string) {
  return useQuery({
    queryKey: ['disruptions', lineId ?? 'all'],
    queryFn: () => api.getDisruptions(lineId),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => api.getSources(),
    enabled,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
  });
}
