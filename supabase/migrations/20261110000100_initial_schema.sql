-- London Digital Twin — schema inicial
-- Fase 1: referência, operações, histórico, datasets abertos e cache interno.
-- Postgres 15+ / Supabase.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create schema if not exists internal;
revoke all on schema internal from anon, authenticated;
grant usage on schema internal to service_role;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_point_geom()
returns trigger
language plpgsql
as $$
begin
  new.geom = st_setsrid(st_makepoint(new.lon, new.lat), 4326);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Referência
-- ---------------------------------------------------------------------------

create table public.modes (
  id text primary key,
  name text not null,
  is_tfl_service boolean,
  is_fare_paying boolean,
  is_scheduled_service boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger modes_set_updated_at
before update on public.modes
for each row execute function public.set_updated_at();

create table public.severity_levels (
  mode_name text not null,
  severity_level integer not null check (severity_level between 0 and 100),
  description text not null,
  band text not null check (band in ('normal', 'attention', 'severe', 'closure', 'unknown')),
  updated_at timestamptz not null default now(),
  primary key (mode_name, severity_level)
);

create table public.lines (
  id text primary key,
  name text not null,
  mode_id text not null references public.modes(id) on update cascade,
  color_hex text check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  text_color_hex text check (text_color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  color_source text,
  color_source_url text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lines_mode_id_idx on public.lines (mode_id);
create index lines_name_trgm_idx on public.lines using gin (name extensions.gin_trgm_ops);

create trigger lines_set_updated_at
before update on public.lines
for each row execute function public.set_updated_at();

create table public.stations (
  id text primary key,
  name text not null,
  display_name text not null,
  stop_type text,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  geom geometry(Point, 4326) not null,
  zone text,
  modes text[] not null default '{}'::text[],
  accessibility_summary text,
  step_free boolean,
  step_free_source text,
  has_lifts boolean,
  has_escalators boolean,
  has_toilets boolean,
  has_wifi boolean,
  has_parking boolean,
  ticket_halls integer check (ticket_halls is null or ticket_halls >= 0),
  facilities jsonb not null default '{}'::jsonb,
  hub_naptan_code text,
  ics_code text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stations_geom_idx on public.stations using gist (geom);
create index stations_modes_idx on public.stations using gin (modes);
create index stations_facilities_idx on public.stations using gin (facilities);
create index stations_display_name_trgm_idx
  on public.stations using gin (display_name extensions.gin_trgm_ops);
create index stations_zone_idx on public.stations (zone);

create trigger stations_set_geom
before insert or update of lat, lon on public.stations
for each row execute function public.set_point_geom();

create trigger stations_set_updated_at
before update on public.stations
for each row execute function public.set_updated_at();

create table public.station_entrances (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  name text,
  stop_type text,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  geom geometry(Point, 4326) not null,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create index station_entrances_station_id_idx on public.station_entrances (station_id);
create index station_entrances_geom_idx on public.station_entrances using gist (geom);

create trigger station_entrances_set_geom
before insert or update of lat, lon on public.station_entrances
for each row execute function public.set_point_geom();

create table public.line_stations (
  line_id text not null references public.lines(id) on delete cascade,
  station_id text not null references public.stations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  branch_id integer not null default 0,
  sequence integer not null check (sequence >= 0),
  service_type text not null default 'Regular',
  route_name text,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  primary key (line_id, station_id, direction, branch_id, service_type)
);

create index line_stations_order_idx
  on public.line_stations (line_id, direction, branch_id, sequence);
create index line_stations_station_idx on public.line_stations (station_id);

create table public.line_paths (
  id bigint generated always as identity primary key,
  line_id text not null references public.lines(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  branch_id integer not null default 0,
  route_name text,
  geometry geometry(LineString, 4326) not null,
  bbox double precision[],
  source text not null default 'tfl-route-sequence',
  fetched_at timestamptz not null default now(),
  unique (line_id, direction, branch_id)
);

create index line_paths_geometry_idx on public.line_paths using gist (geometry);
create index line_paths_line_idx on public.line_paths (line_id);

-- ---------------------------------------------------------------------------
-- Operação / histórico
-- ---------------------------------------------------------------------------

create table public.line_status_snapshots (
  id bigint generated always as identity primary key,
  snapshot_key text not null unique,
  line_id text not null references public.lines(id) on delete cascade,
  captured_at timestamptz not null default now(),
  severity integer,
  severity_description text,
  band text not null default 'unknown'
    check (band in ('normal', 'attention', 'severe', 'closure', 'unknown')),
  reason text,
  category text,
  validity_from timestamptz,
  validity_to timestamptz,
  is_now boolean,
  is_primary boolean not null default true,
  source_modified_at timestamptz,
  created_at timestamptz not null default now()
);

create index line_status_line_captured_idx
  on public.line_status_snapshots (line_id, captured_at desc);
create index line_status_captured_idx
  on public.line_status_snapshots (captured_at desc);
create index line_status_band_idx on public.line_status_snapshots (band);

create table public.disruptions (
  id text primary key,
  line_id text references public.lines(id) on delete set null,
  station_id text references public.stations(id) on delete set null,
  scope text not null default 'line' check (scope in ('line', 'station', 'network')),
  category text,
  type text,
  category_description text,
  summary text,
  description text,
  additional_info text,
  closure_text text,
  severity_level integer,
  validity_periods jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  affected_stops jsonb not null default '[]'::jsonb,
  affected_routes jsonb not null default '[]'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index disruptions_line_active_idx on public.disruptions (line_id, is_active);
create index disruptions_station_active_idx on public.disruptions (station_id, is_active);
create index disruptions_last_seen_idx on public.disruptions (last_seen_at desc);
create index disruptions_affected_stops_idx on public.disruptions using gin (affected_stops);

create trigger disruptions_set_updated_at
before update on public.disruptions
for each row execute function public.set_updated_at();

create table public.disruption_affected_stations (
  disruption_id text not null references public.disruptions(id) on delete cascade,
  station_id text not null references public.stations(id) on delete cascade,
  primary key (disruption_id, station_id)
);

create index disruption_affected_stations_station_idx
  on public.disruption_affected_stations (station_id);

create table public.arrival_predictions (
  id bigint generated always as identity primary key,
  station_id text not null references public.stations(id) on delete cascade,
  line_id text references public.lines(id) on delete set null,
  prediction_id text not null,
  platform_name text,
  direction text,
  towards text,
  destination_name text,
  destination_station_id text,
  expected_arrival timestamptz,
  time_to_station_seconds integer check (time_to_station_seconds is null or time_to_station_seconds >= 0),
  current_location text,
  mode_name text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (station_id, prediction_id)
);

create index arrival_predictions_station_idx
  on public.arrival_predictions (station_id, expected_arrival);
create index arrival_predictions_line_idx
  on public.arrival_predictions (line_id, expected_arrival);
create index arrival_predictions_expires_idx on public.arrival_predictions (expires_at);

create table public.station_traffic_snapshots (
  id bigint generated always as identity primary key,
  station_id text not null references public.stations(id) on delete cascade,
  source_dataset text not null,
  granularity text not null check (granularity in ('daily', 'annual')),
  travel_date date not null,
  entries bigint check (entries is null or entries >= 0),
  exits bigint check (exits is null or exits >= 0),
  boardings bigint check (boardings is null or boardings >= 0),
  annual_entries_exits bigint check (annual_entries_exits is null or annual_entries_exits >= 0),
  fetched_at timestamptz not null default now(),
  unique (station_id, source_dataset, granularity, travel_date)
);

create index station_traffic_station_date_idx
  on public.station_traffic_snapshots (station_id, travel_date desc);

create table public.station_crowding_profiles (
  id bigint generated always as identity primary key,
  profile_key text not null unique,
  station_id text not null references public.stations(id) on delete cascade,
  source_dataset text not null,
  profile_name text not null,
  kind text not null check (kind in ('entry_exit', 'link_flow', 'train_loading')),
  interval_start time not null,
  passengers numeric(12, 2) not null check (passengers >= 0),
  from_station_id text references public.stations(id) on delete set null,
  to_station_id text references public.stations(id) on delete set null,
  line_id text references public.lines(id) on delete set null,
  platform_direction text,
  fetched_at timestamptz not null default now()
);

create index station_crowding_station_idx
  on public.station_crowding_profiles (station_id, kind, interval_start);

create table public.network_status_snapshots (
  id bigint generated always as identity primary key,
  snapshot_key text not null unique,
  captured_at timestamptz not null default now(),
  lines_total integer not null default 0 check (lines_total >= 0),
  lines_normal integer not null default 0 check (lines_normal >= 0),
  lines_attention integer not null default 0 check (lines_attention >= 0),
  lines_severe integer not null default 0 check (lines_severe >= 0),
  lines_closed integer not null default 0 check (lines_closed >= 0),
  lines_unknown integer not null default 0 check (lines_unknown >= 0),
  disruptions_active integer not null default 0 check (disruptions_active >= 0),
  stations_affected integer check (stations_affected is null or stations_affected >= 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index network_status_captured_idx
  on public.network_status_snapshots (captured_at desc);

create table public.data_sync_jobs (
  id bigint generated always as identity primary key,
  job_name text not null,
  function_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  records_read bigint,
  records_upserted bigint,
  error_code text,
  error_message text,
  next_run_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index data_sync_jobs_name_started_idx
  on public.data_sync_jobs (job_name, started_at desc);

create table public.data_sources (
  id text primary key,
  name text not null,
  publisher text not null,
  url text,
  license text,
  license_url text,
  attribution_text text,
  refresh_policy text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  status text not null default 'unknown'
    check (status in ('ok', 'degraded', 'error', 'unknown', 'not_synced')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger data_sources_set_updated_at
before update on public.data_sources
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cache e rate limit (public com RLS e sem policies; acesso só via service_role)
-- ---------------------------------------------------------------------------

create table public.api_cache (
  key text primary key,
  payload jsonb not null,
  status_code integer not null default 200,
  fetched_at timestamptz not null default now(),
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null,
  etag text
);

create index api_cache_expires_idx on public.api_cache (expires_at);

create table public.api_rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (key, window_start)
);

create index api_rate_limits_window_idx on public.api_rate_limits (window_start);

create table internal.raw_payloads (
  id bigint generated always as identity primary key,
  source text not null,
  endpoint text not null,
  cache_key text not null default '',
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (source, endpoint, cache_key)
);

create index raw_payloads_fetched_idx on internal.raw_payloads (fetched_at desc);

-- ---------------------------------------------------------------------------
-- Views públicas
-- ---------------------------------------------------------------------------

create or replace view public.v_line_status_current
with (security_invoker = true)
as
select distinct on (s.line_id)
  s.line_id,
  s.captured_at,
  s.severity,
  s.severity_description,
  s.band,
  s.reason,
  s.category,
  s.validity_from,
  s.validity_to,
  s.is_now,
  s.is_primary
from public.line_status_snapshots s
order by
  s.line_id,
  s.captured_at desc,
  s.is_primary desc,
  case s.band
    when 'closure' then 4
    when 'severe' then 3
    when 'attention' then 2
    when 'normal' then 1
    else 0
  end desc,
  s.severity desc;

create or replace view public.v_network_status_latest
with (security_invoker = true)
as
select *
from public.network_status_snapshots
order by captured_at desc
limit 1;

comment on table public.line_status_snapshots is
  'Histórico de status por linha. Inserir em mudança de estado ou heartbeat de 5 min.';
comment on table public.arrival_predictions is
  'Previsões de chegada/partida. Retenção curta; não é um histórico de longo prazo.';
comment on table public.station_traffic_snapshots is
  'Footfall diário e contagens anuais da TfL. Dados históricos, não tempo real.';
comment on table public.station_crowding_profiles is
  'Perfis de crowding de 15 min derivados da TfL. Dados históricos/típicos.';
comment on table internal.raw_payloads is
  'Payload bruto da TfL para auditoria e reprocessamento. Nunca exposto via RLS.';
