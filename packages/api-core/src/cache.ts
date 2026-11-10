export interface CacheEntry<T = unknown> {
  value: T;
  fetchedAt: string;
  cachedAt: string;
  expiresAt: string;
  statusCode: number;
  etag?: string;
}

export interface CacheSetOptions {
  fetchedAt?: string;
  statusCode?: number;
  etag?: string;
}

export interface CacheGetOptions {
  /** Permite ler uma entrada expirada para fallback stale. */
  allowExpired?: boolean;
}

export interface CacheStore {
  get<T>(key: string, options?: CacheGetOptions): Promise<CacheEntry<T> | null>;
  set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    options?: CacheSetOptions,
  ): Promise<CacheEntry<T>>;
  delete(key: string): Promise<void>;
  healthCheck(): Promise<'ok' | 'error' | 'not_configured'>;
}

/** Cache em memória para desenvolvimento local e testes. */
export class MemoryCache implements CacheStore {
  private readonly entries = new Map<string, CacheEntry>();

  async get<T>(key: string, options: CacheGetOptions = {}): Promise<CacheEntry<T> | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (new Date(entry.expiresAt).getTime() <= Date.now()) {
      if (options.allowExpired) return entry as CacheEntry<T>;
      this.entries.delete(key);
      return null;
    }
    return entry as CacheEntry<T>;
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    options: CacheSetOptions = {},
  ): Promise<CacheEntry<T>> {
    const now = new Date();
    const fetchedAt = options.fetchedAt ?? now.toISOString();
    const entry: CacheEntry<T> = {
      value,
      fetchedAt,
      cachedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + Math.max(0, ttlSeconds) * 1000).toISOString(),
      statusCode: options.statusCode ?? 200,
      etag: options.etag,
    };
    this.entries.set(key, entry);
    return entry;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async healthCheck(): Promise<'ok' | 'error' | 'not_configured'> {
    return 'ok';
  }

  /** Apenas para testes. */
  clear(): void {
    this.entries.clear();
  }
}
