import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiHttpError } from './errors.ts';

export const PAGE_SIZE = 1000;

export interface FetchRowsOptions {
  order?: {
    column: string;
    ascending?: boolean;
  };
  eq?: Record<string, string | number | boolean>;
  in?: Record<string, Array<string | number>>;
  gte?: Record<string, string | number>;
  lte?: Record<string, string | number>;
}

/**
 * Busca todas as linhas de uma tabela/view, contornando o limite de 1000
 * linhas do PostgREST. Usa apenas colunas explicitamente selecionadas.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  options: FetchRowsOptions = {},
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns);
    if (options.eq) {
      for (const [column, value] of Object.entries(options.eq)) {
        query = query.eq(column, value);
      }
    }
    if (options.in) {
      for (const [column, values] of Object.entries(options.in)) {
        query = query.in(column, values);
      }
    }
    if (options.gte) {
      for (const [column, value] of Object.entries(options.gte)) {
        query = query.gte(column, value);
      }
    }
    if (options.lte) {
      for (const [column, value] of Object.entries(options.lte)) {
        query = query.lte(column, value);
      }
    }
    if (options.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true,
      });
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new ApiHttpError(500, 'database_error', error.message, {
        table,
        code: error.code,
      });
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

export function requireDb(supabase: SupabaseClient | undefined): SupabaseClient {
  if (!supabase) {
    throw new ApiHttpError(
      503,
      'database_not_configured',
      'A base de dados não está configurada neste ambiente.',
    );
  }
  return supabase;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function markSourceSuccess(supabase: SupabaseClient, sourceId: string): Promise<void> {
  await supabase
    .from('data_sources')
    .update({
      last_attempt_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      status: 'ok',
    })
    .eq('id', sourceId);
}

export async function markSourceFailure(supabase: SupabaseClient, sourceId: string): Promise<void> {
  await supabase
    .from('data_sources')
    .update({
      last_attempt_at: new Date().toISOString(),
      status: 'error',
    })
    .eq('id', sourceId);
}

export interface JobHandle {
  id: number;
  jobName: string;
  startedAt: string;
}

export async function startSyncJob(
  supabase: SupabaseClient,
  jobName: string,
  functionName: string,
): Promise<JobHandle> {
  const startedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('data_sync_jobs')
    .insert({
      job_name: jobName,
      function_name: functionName,
      started_at: startedAt,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) {
    throw new ApiHttpError(500, 'job_log_error', error.message);
  }

  return { id: Number(data.id), jobName, startedAt };
}

export interface JobCompletion {
  status: 'success' | 'partial' | 'failed';
  recordsRead: number;
  recordsUpserted: number;
  warnings?: string[];
  error?: unknown;
}

export async function finishSyncJob(
  supabase: SupabaseClient,
  job: JobHandle,
  completion: JobCompletion,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const error = completion.error;
  const { error: updateError } = await supabase
    .from('data_sync_jobs')
    .update({
      finished_at: finishedAt,
      status: completion.status,
      records_read: completion.recordsRead,
      records_upserted: completion.recordsUpserted,
      error_code: error instanceof Error ? error.name : error ? 'sync_error' : null,
      error_message: error
        ? truncate(error instanceof Error ? error.message : String(error), 800)
        : null,
      metadata: {
        durationMs: Date.parse(finishedAt) - Date.parse(job.startedAt),
        warnings: completion.warnings ?? [],
      },
    })
    .eq('id', job.id);

  if (updateError) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'job_log_update_failed',
        jobId: job.id,
        message: updateError.message,
      }),
    );
  }
}

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}
