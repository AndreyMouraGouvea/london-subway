-- Fase 2: geometria multi-segmento, line_ids e RPC de upsert de caminhos.

alter table public.line_paths
  alter column geometry type geometry(MultiLineString, 4326)
  using st_multi(geometry);

alter table public.stations
  add column if not exists line_ids text[] not null default '{}'::text[];

create index if not exists stations_line_ids_idx
  on public.stations using gin (line_ids);

create or replace view public.v_line_paths_geojson
with (security_invoker = true)
as
select
  id,
  line_id,
  direction,
  branch_id,
  route_name,
  st_asgeojson(geometry)::jsonb as geometry,
  source,
  fetched_at
from public.line_paths;

grant select on public.v_line_paths_geojson to anon, authenticated;

create or replace function public.upsert_line_path(
  p_line_id text,
  p_direction text,
  p_branch_id integer,
  p_route_name text,
  p_geojson jsonb
)
returns void
language sql
security invoker
set search_path = public, extensions
as $$
  insert into public.line_paths (
    line_id,
    direction,
    branch_id,
    route_name,
    geometry,
    source,
    fetched_at
  )
  values (
    p_line_id,
    p_direction,
    p_branch_id,
    p_route_name,
    st_setsrid(st_geomfromgeojson(p_geojson::text), 4326),
    'tfl-route-sequence',
    now()
  )
  on conflict (line_id, direction, branch_id)
  do update set
    route_name = excluded.route_name,
    geometry = excluded.geometry,
    source = excluded.source,
    fetched_at = excluded.fetched_at;
$$;

revoke all on function public.upsert_line_path(text, text, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_line_path(text, text, integer, text, jsonb)
  to service_role;
