-- Fase 5: base para footfall histórico e análise da rede.
--
-- O footfall diário é escrito em station_traffic_snapshots pelo pipeline
-- apps/ingest (dados históricos, granularidade diária). Não há dados em tempo
-- real nesta tabela.

create index if not exists station_traffic_dataset_date_idx
  on public.station_traffic_snapshots (source_dataset, travel_date desc);

create or replace view public.v_station_footfall_daily
with (security_invoker = true)
as
select
  t.station_id,
  t.travel_date,
  t.source_dataset,
  t.entries,
  t.exits,
  case
    when t.entries is null and t.exits is null then null
    else coalesce(t.entries, 0) + coalesce(t.exits, 0)
  end as total,
  t.fetched_at
from public.station_traffic_snapshots t
where t.granularity = 'daily';

comment on view public.v_station_footfall_daily is
  'Footfall diário por estação. Dados históricos; total é nulo se entradas e saídas forem nulas.';

grant select on public.v_station_footfall_daily to anon, authenticated;

insert into public.data_sources (
  id,
  name,
  publisher,
  url,
  license,
  license_url,
  attribution_text,
  refresh_policy,
  status,
  notes
)
values (
  'tfl-station-footfall',
  'TfL Station Footfall 2025–2026',
  'Transport for London',
  'https://crowding.data.tfl.gov.uk/',
  'TfL Transport Data Terms and Conditions',
  'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
  'Information supplied by Transport for London',
  'Dataset histórico diário',
  'unknown',
  'Footfall diário por estação (entradas/saídas). Dados históricos, não tempo real.'
)
on conflict (id) do update set
  name = excluded.name,
  publisher = excluded.publisher,
  url = excluded.url,
  license = excluded.license,
  license_url = excluded.license_url,
  attribution_text = excluded.attribution_text,
  refresh_policy = excluded.refresh_policy,
  notes = excluded.notes,
  updated_at = now();
