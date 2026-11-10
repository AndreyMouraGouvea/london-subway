-- Fase 5.3: RODS 2017 (boarders/alighters por estação, linha, direção e
-- intervalo de 15 minutos). Dados de inquérito ponderados, históricos.

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
  'tfl-rods-2017',
  'RODS 2017 — boarders and alighters',
  'Transport for London',
  'https://crowding.data.tfl.gov.uk/',
  'TfL Transport Data Terms and Conditions',
  'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
  'Information supplied by Transport for London',
  'Dataset histórico (2017)',
  'unknown',
  'Estimativas ponderadas do RODS 2017 por estação/linha/direção e intervalo de 15 min. Não é ocupação em tempo real.'
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

create index if not exists station_crowding_rods_idx
  on public.station_crowding_profiles (source_dataset, profile_name, station_id, interval_start);
