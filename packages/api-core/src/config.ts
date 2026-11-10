export interface ApiConfig {
  serviceName: string;
  version: string;
  schemaVersion: string;
  allowedOrigins: string[];
  cronSecret?: string;
  tfl: {
    baseUrl: string;
    appKey?: string;
    timeoutMs: number;
    maxRetries: number;
  };
  cacheTtlSeconds: {
    status: number;
    disruptions: number;
    arrivals: number;
    static: number;
    dashboard: number;
  };
  staleMaxAgeSeconds: number;
}

export function createApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    serviceName: 'london-digital-twin-api',
    version: '0.1.0',
    schemaVersion: '1.0',
    allowedOrigins: ['http://localhost:5173'],
    cronSecret: undefined,
    tfl: {
      baseUrl: 'https://api.tfl.gov.uk',
      appKey: undefined,
      timeoutMs: 8000,
      maxRetries: 2,
    },
    cacheTtlSeconds: {
      status: 60,
      disruptions: 60,
      arrivals: 45,
      static: 86400,
      dashboard: 60,
    },
    staleMaxAgeSeconds: 86400,
    ...overrides,
  };
}
