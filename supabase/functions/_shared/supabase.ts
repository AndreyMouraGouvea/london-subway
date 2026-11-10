import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import type {
  CacheEntry,
  CacheGetOptions,
  CacheSetOptions,
  CacheStore,
} from '../../../packages/api-core/src/cache.ts';

function env(name: string): string | undefined {
  return Deno.env.get(name) ?? undefined;
}

function buildClient(): SupabaseClient | null {
  // Em produção, o runtime injeta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
  // No `supabase functions serve`, o CLI ignora variáveis com prefixo SUPABASE_,
  // por isso aceitamos os aliases LOCAL_* apenas no ambiente local.
  const url = env('SUPABASE_URL') ?? env('LOCAL_SUPABASE_URL');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('LOCAL_SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let cachedClient: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient === undefined) cachedClient = buildClient();
  return cachedClient;
}

export function requireSupabaseClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não estão configurados.');
  }
  return client;
}

export class SupabaseCache implements CacheStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async get<T>(key: string, options: CacheGetOptions = {}): Promise<CacheEntry<T> | null> {
    const { data, error } = await this.supabase
      .from('api_cache')
      .select('payload, fetched_at, cached_at, expires_at, status_code, etag')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) return null;
    if (new Date(data.expires_at as string).getTime() <= Date.now() && !options.allowExpired) {
      return null;
    }

    return {
      value: data.payload as T,
      fetchedAt: data.fetched_at as string,
      cachedAt: (data.cached_at as string) ?? (data.fetched_at as string),
      expiresAt: data.expires_at as string,
      statusCode: (data.status_code as number) ?? 200,
      etag: (data.etag as string | null) ?? undefined,
    };
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    options: CacheSetOptions = {},
  ): Promise<CacheEntry<T>> {
    const now = new Date();
    const fetchedAt = options.fetchedAt ?? now.toISOString();
    const expiresAt = new Date(now.getTime() + Math.max(0, ttlSeconds) * 1000).toISOString();
    const entry: CacheEntry<T> = {
      value,
      fetchedAt,
      cachedAt: now.toISOString(),
      expiresAt,
      statusCode: options.statusCode ?? 200,
      etag: options.etag,
    };

    const { error } = await this.supabase.from('api_cache').upsert(
      {
        key,
        payload: value,
        status_code: entry.statusCode,
        fetched_at: entry.fetchedAt,
        cached_at: entry.cachedAt,
        expires_at: entry.expiresAt,
        etag: entry.etag ?? null,
      },
      { onConflict: 'key' },
    );

    if (error) throw new Error(`Falha ao escrever no cache: ${error.message}`);
    return entry;
  }

  async delete(key: string): Promise<void> {
    await this.supabase.from('api_cache').delete().eq('key', key);
  }

  async healthCheck(): Promise<'ok' | 'error' | 'not_configured'> {
    const { error } = await this.supabase.from('api_cache').select('key').limit(1);
    return error ? 'error' : 'ok';
  }
}

export function createSupabaseCache(client: SupabaseClient = requireSupabaseClient()): CacheStore {
  return new SupabaseCache(client);
}

export async function checkDatabase(): Promise<'ok' | 'error' | 'not_configured'> {
  const client = getSupabaseClient();
  if (!client) return 'not_configured';
  const { error } = await client.from('modes').select('id').limit(1);
  return error ? 'error' : 'ok';
}

export function hasSupabaseEnv(): boolean {
  return getSupabaseClient() !== null;
}
