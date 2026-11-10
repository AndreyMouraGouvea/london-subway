import { build } from 'esbuild';

/**
 * Empacota a Edge Function com o código compartilhado de packages/.
 * O runtime Deno resolve o external npm:@supabase/supabase-js@2.
 */
await build({
  entryPoints: ['supabase/functions/api/index.ts'],
  outfile: 'supabase/functions/api/index.bundle.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: false,
  logLevel: 'info',
  external: ['npm:@supabase/supabase-js@2.119.0'],
});
