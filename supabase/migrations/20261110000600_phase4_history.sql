-- Fase 4: agregaÃ§Ã£o horÃ¡ria particionada, histÃ³rico, jobs e retenÃ§Ã£o.
--
-- As tabelas de snapshots continuam a ser a fonte de verdade em tempo real.
-- Os agregados horÃ¡rios sÃ£o tabelas particionadas por mÃªs, escritas pelo
-- rollup chamado no fim de cada sync-status. A retenÃ§Ã£o remove os snapshots
-- antigos e faz drop das partiÃ§Ãµes horÃ¡rias que jÃ¡ saÃ­ram da janela.

-- ---------------------------------------------------------------------------
-- Agregados horÃ¡rios (particionados por mÃªs)
-- ---------------------------------------------------------------------------

create table public.network_status_hourly (
  bucket_start timestamptz not null,
  samples integer not null default 0 check (samples >= 0),
  lines_total integer not null default 0,
  lines_normal integer not null default 0,
  lines_attention integer not null default 0,
  lines_severe integer not null default 0,
  lines_closed integer not null default 0,
  lines_unknown integer not null default 0,
  disruptions_active integer not null default 0,
  stations_affected integer,
  updated_at timestamptz not null default now(),
  primary key (bucket_start)
) partition by range (bucket_start);

create table public.line_status_hourly (
  bucket_start timestamptz not null,
  line_id text not null references public.lines(id) on delete cascade,
  band text not null check (band in ('normal', 'attention', 'severe', 'closure', 'unknown')),
  samples integer not null default 0 check (samples >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket_start, line_id, band)
) partition by range (bucket_start);

create table public.network_status_hourly_default
  partition of public.network_status_hourly default;
create table public.line_status_hourly_default
  partition of public.line_status_hourly default;

alter table public.network_status_hourly enable row level security;
alter table public.line_status_hourly enable row level security;

revoke all on public.network_status_hourly, public.line_status_hourly
  from anon, authenticated;
grant select on public.network_status_hourly, public.line_status_hourly to service_role;

-- ---------------------------------------------------------------------------
-- CriaÃ§Ã£o de partiÃ§Ãµes mensais (idempotente)
-- ---------------------------------------------------------------------------

create or replace function public.ldt_ensure_hourly_partitions(
  p_months_ahead integer default 2,
  p_months_back integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
set timezone = 'UTC'
as $$
declare
  i integer;
  v_start date;
  v_end date;
  v_name text;
begin
  for i in -greatest(coalesce(p_months_back, 0), 0)..greatest(coalesce(p_months_ahead, 0), 0) loop
    v_start := (date_trunc('month', now()) + make_interval(months => i))::date;
    v_end := (v_start + interval '1 month')::date;

    v_name := 'network_status_hourly_' || to_char(v_start, 'YYYY_MM');
    if to_regclass('public.' || v_name) is null then
      execute format(
        'create table public.%I partition of public.network_status_hourly for values from (%L) to (%L)',
        v_name, v_start::timestamptz, v_end::timestamptz
      );
    end if;

    v_name := 'line_status_hourly_' || to_char(v_start, 'YYYY_MM');
    if to_regclass('public.' || v_name) is null then
      execute format(
        'create table public.%I partition of public.line_status_hourly for values from (%L) to (%L)',
        v_name, v_start::timestamptz, v_end::timestamptz
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.ldt_ensure_hourly_partitions(integer, integer) from public, anon, authenticated;
grant execute on function public.ldt_ensure_hourly_partitions(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Rollup horÃ¡rio
-- ---------------------------------------------------------------------------

create or replace function public.ldt_rollup_status_hourly(p_hours integer default 6)
returns jsonb
language plpgsql
security definer
set search_path = public
set timezone = 'UTC'
as $$
declare
  v_since timestamptz;
  v_network integer := 0;
  v_lines integer := 0;
begin
  v_since := date_trunc('hour', now()) - make_interval(hours => greatest(coalesce(p_hours, 6), 1));

  perform public.ldt_ensure_hourly_partitions(2, 0);

  insert into public.network_status_hourly (
    bucket_start,
    samples,
    lines_total,
    lines_normal,
    lines_attention,
    lines_severe,
    lines_closed,
    lines_unknown,
    disruptions_active,
    stations_affected,
    updated_at
  )
  with ranked as (
    select
      date_trunc('hour', captured_at) as bucket_start,
      count(*) over (partition by date_trunc('hour', captured_at))::int as samples,
      lines_total,
      lines_normal,
      lines_attention,
      lines_severe,
      lines_closed,
      lines_unknown,
      disruptions_active,
      stations_affected,
      row_number() over (
        partition by date_trunc('hour', captured_at)
        order by captured_at desc
      ) as position
    from public.network_status_snapshots
    where captured_at >= v_since
  )
  -- O bucket representa o snapshot mais recente da hora: as contagens somam
  -- sempre lines_total, ao contrÃ¡rio de uma mÃ©dia arredondada por banda.
  select
    r.bucket_start,
    r.samples,
    r.lines_total,
    r.lines_normal,
    r.lines_attention,
    r.lines_severe,
    r.lines_closed,
    r.lines_unknown,
    r.disruptions_active,
    r.stations_affected,
    now()
  from ranked r
  where r.position = 1
  on conflict (bucket_start) do update set
    samples = excluded.samples,
    lines_total = excluded.lines_total,
    lines_normal = excluded.lines_normal,
    lines_attention = excluded.lines_attention,
    lines_severe = excluded.lines_severe,
    lines_closed = excluded.lines_closed,
    lines_unknown = excluded.lines_unknown,
    disruptions_active = excluded.disruptions_active,
    stations_affected = excluded.stations_affected,
    updated_at = now();
  get diagnostics v_network = row_count;

  insert into public.line_status_hourly (
    bucket_start,
    line_id,
    band,
    samples,
    updated_at
  )
  select
    date_trunc('hour', captured_at),
    line_id,
    band,
    count(*)::int,
    now()
  from public.line_status_snapshots
  where captured_at >= v_since
  group by 1, 2, 3
  on conflict (bucket_start, line_id, band) do update set
    samples = excluded.samples,
    updated_at = now();
  get diagnostics v_lines = row_count;

  return jsonb_build_object(
    'networkBuckets', v_network,
    'lineBuckets', v_lines,
    'since', v_since
  );
end;
$$;

revoke all on function public.ldt_rollup_status_hourly(integer) from public, anon, authenticated;
grant execute on function public.ldt_rollup_status_hourly(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Leituras de histÃ³rico
-- ---------------------------------------------------------------------------

create or replace function public.ldt_network_history(p_since timestamptz)
returns table (
  bucket_start timestamptz,
  samples integer,
  lines_total integer,
  lines_normal integer,
  lines_attention integer,
  lines_severe integer,
  lines_closed integer,
  lines_unknown integer,
  disruptions_active integer,
  stations_affected integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    h.bucket_start,
    h.samples,
    h.lines_total,
    h.lines_normal,
    h.lines_attention,
    h.lines_severe,
    h.lines_closed,
    h.lines_unknown,
    h.disruptions_active,
    h.stations_affected
  from public.network_status_hourly h
  where h.bucket_start >= date_trunc('hour', p_since)
  order by h.bucket_start;
$$;

revoke all on function public.ldt_network_history(timestamptz) from public, anon, authenticated;
grant execute on function public.ldt_network_history(timestamptz) to service_role;

create or replace function public.ldt_top_disrupted_lines(p_since timestamptz)
returns table (
  line_id text,
  disrupted_buckets integer,
  total_buckets integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with per_bucket as (
    select
      h.bucket_start,
      h.line_id,
      max(
        case h.band
          when 'closure' then 4
          when 'severe' then 3
          when 'attention' then 2
          when 'normal' then 1
          else 0
        end
      ) as band_rank
    from public.line_status_hourly h
    where h.bucket_start >= date_trunc('hour', p_since)
    group by h.bucket_start, h.line_id
  )
  select
    p.line_id,
    count(*) filter (where p.band_rank >= 2)::int as disrupted_buckets,
    count(*)::int as total_buckets
  from per_bucket p
  group by p.line_id
  order by disrupted_buckets desc, total_buckets desc, p.line_id
  limit 10;
$$;

revoke all on function public.ldt_top_disrupted_lines(timestamptz) from public, anon, authenticated;
grant execute on function public.ldt_top_disrupted_lines(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Jobs (vista sanitizada, sem mensagens de erro internas)
-- ---------------------------------------------------------------------------

create or replace view public.v_sync_jobs_public
with (security_invoker = true)
as
select
  j.id,
  j.job_name,
  j.started_at,
  j.finished_at,
  j.status,
  j.records_read,
  j.records_upserted,
  case
    when j.finished_at is null then null
    else greatest(0, floor(extract(epoch from (j.finished_at - j.started_at)) * 1000))::bigint
  end as duration_ms
from public.data_sync_jobs j;

revoke all on public.v_sync_jobs_public from public, anon, authenticated;
grant select on public.v_sync_jobs_public to service_role;

-- ---------------------------------------------------------------------------
-- RetenÃ§Ã£o (snapshots + cache + jobs + partiÃ§Ãµes horÃ¡rias antigas)
-- ---------------------------------------------------------------------------

create or replace function public.ldt_apply_retention(
  p_status_days integer default 90,
  p_jobs_days integer default 30,
  p_cache_hours integer default 48,
  p_arrivals_hours integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public
set timezone = 'UTC'
as $$
declare
  v_arrivals integer := 0;
  v_cache integer := 0;
  v_status integer := 0;
  v_network integer := 0;
  v_jobs integer := 0;
  v_partitions integer := 0;
  v_keep_from date;
  v_record record;
  v_month date;
begin
  delete from public.arrival_predictions
  where fetched_at < now() - make_interval(hours => greatest(coalesce(p_arrivals_hours, 24), 1));
  get diagnostics v_arrivals = row_count;

  delete from public.api_cache
  where expires_at < now() - make_interval(hours => greatest(coalesce(p_cache_hours, 48), 1));
  get diagnostics v_cache = row_count;

  delete from public.line_status_snapshots
  where captured_at < now() - make_interval(days => greatest(coalesce(p_status_days, 90), 1));
  get diagnostics v_status = row_count;

  delete from public.network_status_snapshots
  where captured_at < now() - make_interval(days => greatest(coalesce(p_status_days, 90), 1));
  get diagnostics v_network = row_count;

  delete from public.data_sync_jobs
  where started_at < now() - make_interval(days => greatest(coalesce(p_jobs_days, 30), 1));
  get diagnostics v_jobs = row_count;

  v_keep_from := date_trunc(
    'month',
    now() - make_interval(days => greatest(coalesce(p_status_days, 90), 1))
  )::date;

  for v_record in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname ~ '^(network_status_hourly|line_status_hourly)_[0-9]{4}_[0-9]{2}$'
  loop
    v_month := to_date(right(v_record.relname, 7), 'YYYY_MM');
    if v_month < v_keep_from then
      execute format('drop table public.%I', v_record.relname);
      v_partitions := v_partitions + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'arrivalPredictions', v_arrivals,
    'expiredCache', v_cache,
    'lineStatusSnapshots', v_status,
    'networkStatusSnapshots', v_network,
    'syncJobs', v_jobs,
    'hourlyPartitionsDropped', v_partitions
  );
end;
$$;

revoke all on function public.ldt_apply_retention(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ldt_apply_retention(integer, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Bootstrap: partiÃ§Ãµes Ã  volta do mÃªs atual + backfill do histÃ³rico existente
-- ---------------------------------------------------------------------------

select public.ldt_ensure_hourly_partitions(3, 4);

insert into public.network_status_hourly (
  bucket_start,
  samples,
  lines_total,
  lines_normal,
  lines_attention,
  lines_severe,
  lines_closed,
  lines_unknown,
  disruptions_active,
  stations_affected,
  updated_at
)
with ranked as (
  select
    date_trunc('hour', captured_at) as bucket_start,
    count(*) over (partition by date_trunc('hour', captured_at))::int as samples,
    lines_total,
    lines_normal,
    lines_attention,
    lines_severe,
    lines_closed,
    lines_unknown,
    disruptions_active,
    stations_affected,
    row_number() over (
      partition by date_trunc('hour', captured_at)
      order by captured_at desc
    ) as position
  from public.network_status_snapshots
)
select
  r.bucket_start,
  r.samples,
  r.lines_total,
  r.lines_normal,
  r.lines_attention,
  r.lines_severe,
  r.lines_closed,
  r.lines_unknown,
  r.disruptions_active,
  r.stations_affected,
  now()
from ranked r
where r.position = 1
on conflict (bucket_start) do nothing;

insert into public.line_status_hourly (bucket_start, line_id, band, samples, updated_at)
select
  date_trunc('hour', captured_at),
  line_id,
  band,
  count(*)::int,
  now()
from public.line_status_snapshots
group by 1, 2, 3
on conflict (bucket_start, line_id, band) do nothing;


