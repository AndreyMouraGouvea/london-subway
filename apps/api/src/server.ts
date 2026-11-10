import { serve } from '@hono/node-server';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { createApi, createApiConfig, MemoryCache } from '@ldt/api-core';

loadEnv({ path: ['.env.local', '../../.env.local', '.env'] });

const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const apiConfig = createApiConfig({
  allowedOrigins,
  cronSecret: process.env.LDT_CRON_SECRET ?? process.env.CRON_SECRET,
  tfl: {
    baseUrl: process.env.TFL_API_BASE_URL ?? 'https://api.tfl.gov.uk',
    appKey: process.env.TFL_APP_KEY,
    timeoutMs: Number(process.env.TFL_TIMEOUT_MS ?? 8000),
    maxRetries: Number(process.env.TFL_MAX_RETRIES ?? 2),
  },
});

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : undefined;

const checkDatabase = async (): Promise<'ok' | 'error' | 'not_configured'> => {
  if (!supabase) return 'not_configured';
  const { error } = await supabase.from('modes').select('id').limit(1);
  return error ? 'error' : 'ok';
};

const app = createApi({
  config: apiConfig,
  cache: new MemoryCache(),
  supabase,
  checkDatabase,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'api_started',
      service: apiConfig.serviceName,
      version: apiConfig.version,
      port: info.port,
      allowedOrigins,
      databaseConfigured: Boolean(supabase),
      tflAppKeyConfigured: Boolean(process.env.TFL_APP_KEY),
      cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    }),
  );
});
