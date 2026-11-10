const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const devFallback = import.meta.env.DEV ? 'http://localhost:8787' : '';

export const env = {
  apiBaseUrl: (rawApiBaseUrl || devFallback).replace(/\/+$/, ''),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
  mapStyleUrl:
    import.meta.env.VITE_MAP_STYLE_URL?.trim() || 'https://tiles.openfreemap.org/styles/dark',
  isApiConfigured: Boolean(rawApiBaseUrl || devFallback),
  isSupabaseConfigured: Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
  ),
};
