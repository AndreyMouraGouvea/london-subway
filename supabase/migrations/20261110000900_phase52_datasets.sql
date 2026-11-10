-- Fase 5.2: annual station counts, NUMBAT e crowding típico de 2017.

create table public.line_annual_boardings (
  id bigint generated always as identity primary key,
  source_dataset text not null,
  mode text not null,
  line_code text not null,
  line_name text not null,
  line_id text references public.lines(id) on delete set null,
  year integer not null check (year between 2000 and 2100),
  boardings bigint not null check (boardings >= 0),
  fetched_at timestamptz not null default now(),
  unique (source_dataset, line_code, year)
);

create index line_annual_boardings_line_year_idx
  on public.line_annual_boardings (line_id, year desc);

create index line_annual_boardings_year_idx
  on public.line_annual_boardings (year desc);

alter table public.line_annual_boardings enable row level security;

create policy "public read line annual boardings"
on public.line_annual_boardings for select to anon, authenticated using (true);

grant select on public.line_annual_boardings to anon, authenticated;

comment on table public.line_annual_boardings is
  'Boardings anuais por linha (NUMBAT). Dados históricos estimados pela TfL; não é procura em tempo real.';

create index if not exists station_crowding_dataset_kind_idx
  on public.station_crowding_profiles (source_dataset, kind, station_id, interval_start);

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
values
  (
    'tfl-annual-station-counts-2025',
    'Annual Station Counts 2025',
    'Transport for London',
    'https://crowding.data.tfl.gov.uk/',
    'TfL Transport Data Terms and Conditions',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'Information supplied by Transport for London',
    'Dataset anual',
    'unknown',
    'Entradas/saídas anuais por estação em 2025. Dados históricos.'
  ),
  (
    'tfl-numbat',
    'NUMBAT annualised boarders',
    'Transport for London',
    'https://crowding.data.tfl.gov.uk/',
    'TfL Transport Data Terms and Conditions',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'Information supplied by Transport for London',
    'Dataset anual',
    'unknown',
    'Boardings anuais por linha, 2016–2025. Estimativas históricas.'
  ),
  (
    'tfl-station-link-flows-2017',
    'Station passenger link flows 2017',
    'Transport for London',
    'https://crowding.data.tfl.gov.uk/',
    'TfL Transport Data Terms and Conditions',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'Information supplied by Transport for London',
    'Dataset histórico (2017)',
    'unknown',
    'Fluxos típicos por intervalo de 15 min em 2017, agregados por estação. Não é ocupação em tempo real.'
  ),
  (
    'tfl-train-loading-2017',
    'LU train loading 2017',
    'Transport for London',
    'https://crowding.data.tfl.gov.uk/',
    'TfL Transport Data Terms and Conditions',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'Information supplied by Transport for London',
    'Dataset histórico (2017)',
    'unknown',
    'Loading típico por ligação estação–estação em 2017. Histórico, não tempo real.'
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
