import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../cache.ts';
import { createApiConfig } from '../config.ts';
import { buildMeta } from '../meta.ts';
import { createApi } from '../router.ts';
import { redactTfLUrl, TfLClient, TfLError } from '../tfl/client.ts';

describe('buildMeta', () => {
  it('marks fresh data as live when explicit', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const meta = buildMeta({
      source: 'tfl-unified-api',
      fetchedAt: '2026-11-10T11:59:45Z',
      cachedAt: '2026-11-10T11:59:46Z',
      cacheTtlSeconds: 60,
      cacheState: 'live',
      requestId: 'req-1',
      schemaVersion: '1.0',
      now,
    });
    expect(meta.dataSourceStatus).toBe('live');
    expect(meta.isStale).toBe(false);
    expect(meta.ageSeconds).toBe(15);
  });

  it('marks data beyond TTL as stale', () => {
    const now = new Date('2026-11-10T12:05:00Z');
    const meta = buildMeta({
      source: 'tfl-unified-api',
      fetchedAt: '2026-11-10T11:59:00Z',
      cacheTtlSeconds: 60,
      requestId: 'req-2',
      schemaVersion: '1.0',
      now,
    });
    expect(meta.dataSourceStatus).toBe('stale');
    expect(meta.isStale).toBe(true);
  });

  it('marks missing data as unavailable', () => {
    const meta = buildMeta({
      source: 'derived',
      cacheTtlSeconds: 0,
      requestId: 'req-3',
      schemaVersion: '1.0',
    });
    expect(meta.dataSourceStatus).toBe('unavailable');
    expect(meta.fetchedAt).toBeNull();
    expect(meta.ageSeconds).toBeNull();
  });
});

describe('MemoryCache', () => {
  it('stores and reads values', async () => {
    const cache = new MemoryCache();
    await cache.set('key', { value: 1 }, 60, { fetchedAt: '2026-11-10T12:00:00Z' });
    const entry = await cache.get<{ value: number }>('key');
    expect(entry?.value.value).toBe(1);
    expect(entry?.fetchedAt).toBe('2026-11-10T12:00:00Z');
  });

  it('expires entries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    const cache = new MemoryCache();
    await cache.set('expiring', true, 1);
    expect(await cache.get('expiring')).not.toBeNull();
    vi.setSystemTime(new Date('2026-11-10T12:00:02Z'));
    expect(await cache.get('expiring')).toBeNull();
    vi.useRealTimers();
  });

  it('can return expired entries for stale fallback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    const cache = new MemoryCache();
    await cache.set('stale', { value: 1 }, 1);
    vi.setSystemTime(new Date('2026-11-10T12:00:02Z'));
    const entry = await cache.get<{ value: number }>('stale', { allowExpired: true });
    expect(entry?.value.value).toBe(1);
    vi.useRealTimers();
  });
});

describe('API router', () => {
  it('rejects disallowed CORS origins', async () => {
    const app = createApi({
      config: createApiConfig({ allowedOrigins: ['http://localhost:5173'] }),
      cache: new MemoryCache(),
    });

    const response = await app.request('/health', {
      headers: { Origin: 'http://evil.example' },
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('origin_not_allowed');
  });

  it('serves health for allowed origins', async () => {
    const app = createApi({
      config: createApiConfig({ allowedOrigins: ['http://localhost:5173'] }),
      cache: new MemoryCache(),
    });

    const response = await app.request('/health', {
      headers: { Origin: 'http://localhost:5173' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data?: { status?: string; checks?: { cache?: string } };
      meta?: { dataSourceStatus?: string };
    };
    expect(body.data?.status).toBe('ok');
    expect(body.data?.checks?.cache).toBe('ok');
    expect(body.meta?.dataSourceStatus).toBe('live');
  });

  it('matches allowed origins ignoring host case', async () => {
    const app = createApi({
      config: createApiConfig({ allowedOrigins: ['https://AndreyMouraGouvea.github.io'] }),
      cache: new MemoryCache(),
    });

    const response = await app.request('/health', {
      headers: { Origin: 'https://andreymouragouvea.github.io' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://andreymouragouvea.github.io',
    );
  });

  it('returns a 404 envelope for unknown routes', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/does-not-exist');
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('not_found');
  });

  it('rejects an invalid history window before touching the database', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/dashboard/history?hours=0');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_hours');
  });

  it('rejects an invalid disruption band', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/disruptions?band=not-a-band');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_band');
  });

  it('rejects an out-of-range jobs limit', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/jobs?limit=999');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_count');
  });

  it('rejects an invalid scenario type before touching the database', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/analytics/scenarios?type=bogus&id=x');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_scenario_type');
  });

  it('requires an id for scenarios', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/analytics/scenarios?type=station_closure');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_scenario');
  });

  it('rejects an invalid footfall window', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/analytics/footfall/summary?days=0');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_days');
  });

  it('rejects an out-of-range annual summary limit', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/analytics/annual/summary?limit=999');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_count');
  });

  it('rejects an invalid RODS metric', async () => {
    const app = createApi({
      config: createApiConfig(),
      cache: new MemoryCache(),
    });

    const response = await app.request('/analytics/rods/stations/940GZZLUOXC?metric=wrong');
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('invalid_metric');
  });
});

describe('TfLClient', () => {
  it('fetches JSON, reads x-ttl and redacts app_key', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify([{ id: 'bakerloo', name: 'Bakerloo', modeName: 'tube' }]), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-ttl': '60.000' },
        }),
    );

    const client = new TfLClient({
      baseUrl: 'https://api.tfl.gov.uk',
      appKey: 'super-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    const response = await client.getLineStatusByMode('tube');
    expect(response.data[0]?.id).toBe('bakerloo');
    expect(response.ttlSeconds).toBe(60);
    expect(response.url).not.toContain('super-secret');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and then succeeds', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const client = new TfLClient({
      baseUrl: 'https://api.tfl.gov.uk',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    const response = await client.getSeverityLevels();
    expect(response.data).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws a typed error without leaking the app key', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: 'bad request' }), { status: 400 }),
    );

    const client = new TfLClient({
      baseUrl: 'https://api.tfl.gov.uk',
      appKey: 'super-secret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await expect(client.getLineStatus(['bakerloo'])).rejects.toMatchObject({
      name: 'TfLError',
      status: 400,
    });

    try {
      await client.getLineStatus(['bakerloo']);
    } catch (error) {
      expect(error).toBeInstanceOf(TfLError);
      expect((error as TfLError).url).not.toContain('super-secret');
    }
  });

  it('redacts app_key from URLs', () => {
    expect(
      redactTfLUrl('https://api.tfl.gov.uk/Line/Mode/tube/Status?app_key=abc&detail=true'),
    ).toBe('https://api.tfl.gov.uk/Line/Mode/tube/Status?detail=true');
  });
});
