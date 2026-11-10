-- RLS, grants, Realtime e Storage.

-- ---------------------------------------------------------------------------
-- RLS: dados públicos somente leitura
-- ---------------------------------------------------------------------------

alter table public.modes enable row level security;
alter table public.severity_levels enable row level security;
alter table public.lines enable row level security;
alter table public.stations enable row level security;
alter table public.station_entrances enable row level security;
alter table public.line_stations enable row level security;
alter table public.line_paths enable row level security;
alter table public.line_status_snapshots enable row level security;
alter table public.disruptions enable row level security;
alter table public.disruption_affected_stations enable row level security;
alter table public.arrival_predictions enable row level security;
alter table public.station_traffic_snapshots enable row level security;
alter table public.station_crowding_profiles enable row level security;
alter table public.network_status_snapshots enable row level security;
alter table public.data_sources enable row level security;
alter table public.data_sync_jobs enable row level security;

create policy "public read modes"
on public.modes for select to anon, authenticated using (true);

create policy "public read severity levels"
on public.severity_levels for select to anon, authenticated using (true);

create policy "public read lines"
on public.lines for select to anon, authenticated using (true);

create policy "public read stations"
on public.stations for select to anon, authenticated using (true);

create policy "public read station entrances"
on public.station_entrances for select to anon, authenticated using (true);

create policy "public read line stations"
on public.line_stations for select to anon, authenticated using (true);

create policy "public read line paths"
on public.line_paths for select to anon, authenticated using (true);

create policy "public read line status snapshots"
on public.line_status_snapshots for select to anon, authenticated using (true);

create policy "public read disruptions"
on public.disruptions for select to anon, authenticated using (true);

create policy "public read disruption affected stations"
on public.disruption_affected_stations for select to anon, authenticated using (true);

create policy "public read arrival predictions"
on public.arrival_predictions for select to anon, authenticated using (true);

create policy "public read station traffic"
on public.station_traffic_snapshots for select to anon, authenticated using (true);

create policy "public read crowding profiles"
on public.station_crowding_profiles for select to anon, authenticated using (true);

create policy "public read network status"
on public.network_status_snapshots for select to anon, authenticated using (true);

create policy "public read data sources"
on public.data_sources for select to anon, authenticated using (true);

-- data_sync_jobs: sem policy pública. O service_role ignora RLS.
-- Exposição futura apenas via view sanitizada.

-- ---------------------------------------------------------------------------
-- Grants explícitos
-- ---------------------------------------------------------------------------

grant select on
  public.modes,
  public.severity_levels,
  public.lines,
  public.stations,
  public.station_entrances,
  public.line_stations,
  public.line_paths,
  public.line_status_snapshots,
  public.disruptions,
  public.disruption_affected_stations,
  public.arrival_predictions,
  public.station_traffic_snapshots,
  public.station_crowding_profiles,
  public.network_status_snapshots,
  public.data_sources
to anon, authenticated;

grant select on public.v_line_status_current, public.v_network_status_latest
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cache e rate limit: RLS sem policies, acesso apenas via service_role
-- ---------------------------------------------------------------------------

alter table public.api_cache enable row level security;
alter table public.api_rate_limits enable row level security;

revoke all on public.api_cache, public.api_rate_limits from anon, authenticated;
grant all on public.api_cache, public.api_rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- Schema interno: sem acesso público
-- ---------------------------------------------------------------------------

alter table internal.raw_payloads enable row level security;

revoke all on all tables in schema internal from anon, authenticated;
revoke all on all sequences in schema internal from anon, authenticated;
grant all on all tables in schema internal to service_role;
grant all on all sequences in schema internal to service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'line_status_snapshots'
    ) then
      alter publication supabase_realtime add table public.line_status_snapshots;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'disruptions'
    ) then
      alter publication supabase_realtime add table public.disruptions;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'network_status_snapshots'
    ) then
      alter publication supabase_realtime add table public.network_status_snapshots;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('public-assets', 'public-assets', true),
  ('raw', 'raw', false),
  ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "public read public assets"
on storage.objects for select to anon, authenticated
using (bucket_id = 'public-assets');

-- Buckets raw e exports: sem policy pública.
-- Acesso por URL assinada gerada no backend com service_role.
