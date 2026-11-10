import type {
  TfLDisruption,
  TfLLine,
  TfLModeInfo,
  TfLPrediction,
  TfLRouteSequence,
  TfLStatusSeverity,
  TfLStopPoint,
} from '../../../shared/src/types/tfl.ts';
import {
  tflDisruptionArraySchema,
  tflLineArraySchema,
  tflModeArraySchema,
  tflPredictionArraySchema,
  tflRouteSequenceSchema,
  tflStatusSeverityArraySchema,
  tflStopPointArraySchema,
  tflStopPointSchema,
} from '../../../shared/src/schemas/tfl.ts';

export const TFL_MODES_QUERY = 'tube,overground,dlr,elizabeth-line,tram';

/** Interface mínima compatível com Zod, sem acoplar o cliente ao Zod. */
export interface TfLSchema {
  safeParse(
    data: unknown,
  ): { success: true; data: unknown } | { success: false; error: { issues: unknown[] } };
}

export interface TfLClientOptions {
  baseUrl: string;
  appKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface TfLResponse<T> {
  data: T;
  status: number;
  fetchedAt: string;
  ttlSeconds: number | null;
  /** URL sem app_key, segura para logs. */
  url: string;
}

export class TfLError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;
  readonly url: string;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
      url: string;
      details?: unknown;
      retryAfterSeconds?: number;
    },
  ) {
    super(message);
    this.name = 'TfLError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.url = options.url;
  }
}

type QueryValue = string | number | boolean | undefined | null;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function redactTfLUrl(url: URL | string): string {
  const parsed = typeof url === 'string' ? new URL(url) : new URL(url.toString());
  parsed.searchParams.delete('app_key');
  return parsed.toString();
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/**
 * Cliente TfL com timeout, retry limitado e sem vazar app_key em logs/erros.
 * A chave é enviada por query string, conforme a documentação atual da TfL.
 */
export class TfLClient {
  private readonly baseUrl: string;
  private readonly appKey?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: TfLClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.appKey = options.appKey;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleepImpl ?? defaultSleep;
  }

  async getJson<T>(
    path: string,
    query: Record<string, QueryValue> = {},
    schema?: TfLSchema,
  ): Promise<TfLResponse<T>> {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    if (this.appKey) url.searchParams.set('app_key', this.appKey);

    const safeUrl = redactTfLUrl(url);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(url.toString(), {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'LondonDigitalTwin/0.1 (open-data project)',
          },
          signal: controller.signal,
        });

        const ttlHeader = response.headers.get('x-ttl');
        const ttlSeconds = ttlHeader ? Number.parseFloat(ttlHeader) : null;

        if (response.status === 429 || response.status >= 500) {
          const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
          lastError = new TfLError(`TfL respondeu ${response.status}`, {
            status: response.status,
            code: response.status === 429 ? 'rate_limited' : 'upstream_error',
            url: safeUrl,
            retryAfterSeconds,
          });
          if (attempt < this.maxRetries) {
            const backoff = retryAfterSeconds
              ? retryAfterSeconds * 1000
              : Math.min(4000, 250 * 2 ** attempt) + Math.floor(Math.random() * 100);
            await this.sleep(backoff);
            continue;
          }
          throw lastError;
        }

        if (!response.ok) {
          const text = await response.text();
          let details: unknown = text.slice(0, 500);
          try {
            details = JSON.parse(text);
          } catch {
            // mantém o texto truncado
          }
          throw new TfLError(`TfL respondeu ${response.status}`, {
            status: response.status,
            code: 'upstream_client_error',
            url: safeUrl,
            details,
          });
        }

        const body = await response.text();
        let raw: unknown;
        try {
          raw = JSON.parse(body);
        } catch {
          throw new TfLError('Resposta da TfL não é JSON válido', {
            status: response.status,
            code: 'invalid_json',
            url: safeUrl,
            details: body.slice(0, 300),
          });
        }

        let data = raw as T;
        if (schema) {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) {
            throw new TfLError('Resposta da TfL com estrutura inesperada', {
              status: 502,
              code: 'schema_validation_failed',
              url: safeUrl,
              details: parsed.error.issues.slice(0, 10),
            });
          }
          data = parsed.data as T;
        }

        return {
          data,
          status: response.status,
          fetchedAt: new Date().toISOString(),
          ttlSeconds: Number.isFinite(ttlSeconds) ? ttlSeconds : null,
          url: safeUrl,
        };
      } catch (error) {
        if (error instanceof TfLError) throw error;
        lastError = error;
        if (attempt < this.maxRetries) {
          await this.sleep(Math.min(4000, 250 * 2 ** attempt));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw new TfLError('Falha ao contactar a TfL', {
      status: 0,
      code: 'network_error',
      url: safeUrl,
      details: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }

  getLineStatusByMode(modes = TFL_MODES_QUERY, detail = true): Promise<TfLResponse<TfLLine[]>> {
    return this.getJson<TfLLine[]>(
      `/Line/Mode/${encodeURIComponent(modes)}/Status`,
      { detail },
      tflLineArraySchema,
    );
  }

  getLineStatus(ids: string[], detail = true): Promise<TfLResponse<TfLLine[]>> {
    return this.getJson<TfLLine[]>(
      `/Line/${ids.map(encodeURIComponent).join(',')}/Status`,
      { detail },
      tflLineArraySchema,
    );
  }

  getLinesByMode(modes = TFL_MODES_QUERY): Promise<TfLResponse<TfLLine[]>> {
    return this.getJson<TfLLine[]>(
      `/Line/Mode/${encodeURIComponent(modes)}`,
      {},
      tflLineArraySchema,
    );
  }

  getLineDisruptions(ids: string[]): Promise<TfLResponse<TfLDisruption[]>> {
    return this.getJson<TfLDisruption[]>(
      `/Line/${ids.map(encodeURIComponent).join(',')}/Disruption`,
      {},
      tflDisruptionArraySchema,
    );
  }

  getModeDisruptions(modes = TFL_MODES_QUERY): Promise<TfLResponse<TfLDisruption[]>> {
    return this.getJson<TfLDisruption[]>(
      `/Line/Mode/${encodeURIComponent(modes)}/Disruption`,
      {},
      tflDisruptionArraySchema,
    );
  }

  getRouteSequence(
    lineId: string,
    direction: 'inbound' | 'outbound',
    serviceTypes = 'Regular',
  ): Promise<TfLResponse<TfLRouteSequence>> {
    return this.getJson<TfLRouteSequence>(
      `/Line/${encodeURIComponent(lineId)}/Route/Sequence/${direction}`,
      { serviceTypes },
      tflRouteSequenceSchema,
    );
  }

  getLineStopPoints(lineId: string): Promise<TfLResponse<TfLStopPoint[]>> {
    return this.getJson<TfLStopPoint[]>(
      `/Line/${encodeURIComponent(lineId)}/StopPoints`,
      {},
      tflStopPointArraySchema,
    );
  }

  getStopPoint(stopPointId: string): Promise<TfLResponse<TfLStopPoint>> {
    return this.getJson<TfLStopPoint>(
      `/StopPoint/${encodeURIComponent(stopPointId)}`,
      {},
      tflStopPointSchema,
    );
  }

  getStopPoints(stopPointIds: string[]): Promise<TfLResponse<TfLStopPoint[]>> {
    return this.getJson<TfLStopPoint[]>(
      `/StopPoint/${stopPointIds.map(encodeURIComponent).join(',')}`,
      {},
      tflStopPointArraySchema,
    );
  }

  getArrivals(stopPointId: string, count = 20): Promise<TfLResponse<TfLPrediction[]>> {
    return this.getJson<TfLPrediction[]>(
      `/StopPoint/${encodeURIComponent(stopPointId)}/Arrivals`,
      { count },
      tflPredictionArraySchema,
    );
  }

  getStopPointDisruptions(ids: string[]): Promise<TfLResponse<TfLDisruption[]>> {
    return this.getJson<TfLDisruption[]>(
      `/StopPoint/${ids.map(encodeURIComponent).join(',')}/Disruption`,
      {},
      tflDisruptionArraySchema,
    );
  }

  getSeverityLevels(): Promise<TfLResponse<TfLStatusSeverity[]>> {
    return this.getJson<TfLStatusSeverity[]>(
      '/Line/Meta/Severity',
      {},
      tflStatusSeverityArraySchema,
    );
  }

  getModes(): Promise<TfLResponse<TfLModeInfo[]>> {
    return this.getJson<TfLModeInfo[]>('/Line/Meta/Modes', {}, tflModeArraySchema);
  }
}
