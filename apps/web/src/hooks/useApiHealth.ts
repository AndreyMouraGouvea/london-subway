import { useQuery } from '@tanstack/react-query';
import type { HealthCheckResult } from '@ldt/shared';
import { api, ApiClientError } from '../lib/api';
import { env } from '../lib/env';

export interface ApiHealthState {
  health: HealthCheckResult | null;
  isConfigured: boolean;
  isLoading: boolean;
  isError: boolean;
  error: ApiClientError | Error | null;
  isFetching: boolean;
  dataUpdatedAt: number | null;
  refetch: () => void;
}

export function useApiHealth(): ApiHealthState {
  const query = useQuery({
    queryKey: ['api-health'],
    queryFn: () => api.getHealth(),
    enabled: env.isApiConfigured,
    refetchInterval: 30_000,
    retry: 0,
  });

  return {
    health: query.data?.data ?? null,
    isConfigured: env.isApiConfigured,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt || null,
    refetch: () => void query.refetch(),
  };
}
