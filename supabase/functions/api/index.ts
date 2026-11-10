import { createApi, createApiConfig } from '../../../packages/api-core/src/index.ts';
import { checkDatabase, createSupabaseCache, getSupabaseClient } from '../_shared/supabase.ts';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const config = createApiConfig({
  allowedOrigins,
  cronSecret: Deno.env.get('LDT_CRON_SECRET') ?? Deno.env.get('CRON_SECRET') ?? undefined,
  tfl: {
    baseUrl: Deno.env.get('TFL_API_BASE_URL') ?? 'https://api.tfl.gov.uk',
    appKey: Deno.env.get('TFL_APP_KEY') ?? undefined,
    timeoutMs: Number(Deno.env.get('TFL_TIMEOUT_MS') ?? 8000),
    maxRetries: Number(Deno.env.get('TFL_MAX_RETRIES') ?? 2),
  },
});

const supabase = getSupabaseClient();
if (!supabase) {
  throw new Error('Supabase não configurado: verifica SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
}

const app = createApi({
  config,
  cache: createSupabaseCache(supabase),
  supabase,
  checkDatabase,
  basePath: '/api',
});

Deno.serve(app.fetch);
