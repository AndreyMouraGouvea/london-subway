import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * A anon key é pública por design. Nunca colocar a service_role key aqui.
 * Sem configuração, o cliente fica null e o app opera apenas com a API própria.
 */
export const supabase = env.isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
