-- Seed de referência. Não contém status, previsões, ocupação ou qualquer dado inventado.

insert into public.modes (id, name, is_tfl_service, is_fare_paying, is_scheduled_service)
values
  ('tube', 'London Underground', true, true, true),
  ('overground', 'London Overground', true, true, true),
  ('dlr', 'DLR', true, true, true),
  ('elizabeth-line', 'Elizabeth line', true, true, true),
  ('tram', 'London Trams', true, true, true)
on conflict (id) do update set
  name = excluded.name,
  is_tfl_service = excluded.is_tfl_service,
  is_fare_paying = excluded.is_fare_paying,
  is_scheduled_service = excluded.is_scheduled_service,
  updated_at = now();

insert into public.lines (
  id,
  name,
  mode_id,
  color_hex,
  text_color_hex,
  color_source,
  color_source_url,
  is_active
)
values
  ('bakerloo', 'Bakerloo', 'tube', '#B26300', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('central', 'Central', 'tube', '#DC241F', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('circle', 'Circle', 'tube', '#FFC80A', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('district', 'District', 'tube', '#007D32', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('hammersmith-city', 'Hammersmith & City', 'tube', '#F589A6', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('jubilee', 'Jubilee', 'tube', '#838D93', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('metropolitan', 'Metropolitan', 'tube', '#9B0058', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('northern', 'Northern', 'tube', '#000000', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('piccadilly', 'Piccadilly', 'tube', '#0019A8', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('victoria', 'Victoria', 'tube', '#039BE5', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('waterloo-city', 'Waterloo & City', 'tube', '#76D0BD', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('dlr', 'DLR', 'dlr', '#00AFAD', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('elizabeth', 'Elizabeth line', 'elizabeth-line', '#60399E', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('liberty', 'Liberty', 'overground', '#5D6061', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('lioness', 'Lioness', 'overground', '#FAA61A', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('mildmay', 'Mildmay', 'overground', '#0077AD', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('suffragette', 'Suffragette', 'overground', '#5BBD72', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('weaver', 'Weaver', 'overground', '#823A62', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('windrush', 'Windrush', 'overground', '#ED1B00', '#FFFFFF', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true),
  ('tram', 'Tram', 'tram', '#5FB526', '#000000', 'TfL Colour Standard, Issue 11 (Aug 2026)', 'https://content.tfl.gov.uk/tfl-colour-standard.pdf', true)
on conflict (id) do update set
  name = excluded.name,
  mode_id = excluded.mode_id,
  color_hex = excluded.color_hex,
  text_color_hex = excluded.text_color_hex,
  color_source = excluded.color_source,
  color_source_url = excluded.color_source_url,
  is_active = excluded.is_active,
  updated_at = now();

-- Mapa semântico de severidade. As descrições oficiais são atualizadas pelo
-- sync de /Line/Meta/Severity; este seed garante uma base para a UI.
insert into public.severity_levels (mode_name, severity_level, description, band)
select
  m.mode_name,
  s.level,
  s.description,
  s.band
from (values ('tube'), ('overground'), ('dlr'), ('elizabeth-line'), ('tram')) as m(mode_name)
cross join (values
  (0, 'Special Service', 'attention'),
  (1, 'Closed', 'closure'),
  (2, 'Suspended', 'closure'),
  (3, 'Part Suspended', 'severe'),
  (4, 'Planned Closure', 'severe'),
  (5, 'Part Closure', 'severe'),
  (6, 'Severe Delays', 'severe'),
  (7, 'Reduced Service', 'attention'),
  (8, 'Bus Service', 'attention'),
  (9, 'Minor Delays', 'attention'),
  (10, 'Good Service', 'normal'),
  (11, 'Part Closed', 'severe'),
  (12, 'Exit Only', 'attention'),
  (13, 'No Step Free Access', 'attention'),
  (14, 'Change of frequency', 'attention'),
  (15, 'Diverted', 'attention'),
  (16, 'Not Running', 'closure'),
  (17, 'Issues Reported', 'attention'),
  (18, 'No Issues', 'normal'),
  (19, 'Information', 'unknown'),
  (20, 'Service Closed', 'closure')
) as s(level, description, band)
on conflict (mode_name, severity_level) do update set
  description = excluded.description,
  band = excluded.band,
  updated_at = now();

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
    'tfl-unified-api',
    'TfL Unified API',
    'Transport for London',
    'https://api.tfl.gov.uk/',
    'TfL Transport Data Terms and Conditions',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'Information supplied by Transport for London',
    'Status e arrivals ~60 s; dados estáticos 1 h–24 h',
    'not_synced',
    'Fonte primária de status, disrupções, previsões, topologia e facilities. Requer app_key no backend para o plano de 500 req/min.'
  ),
  (
    'tfl-open-data',
    'TfL Open Data feeds',
    'Transport for London',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'TfL Transport Data Terms and Conditions',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'Information supplied by Transport for London',
    'Variável por feed (diária a trimestral)',
    'not_synced',
    'Station facilities KML, step-free access and toilet data, live lift disruptions e Stop Structure API. Alguns feeds exigem registo.'
  ),
  (
    'tfl-crowding-data',
    'TfL Crowding and Network Demand data',
    'Transport for London',
    'https://crowding.data.tfl.gov.uk/',
    'TfL Transport Data Terms and Conditions',
    'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    'Information supplied by Transport for London',
    'Diária, mensal e anual, conforme dataset',
    'not_synced',
    'Station footfall diário, annual station counts, crowding 2017, RODS e NUMBAT. Dados históricos/típicos, não ocupação em tempo real.'
  ),
  (
    'tfl-colour-standard',
    'TfL Colour Standard',
    'Transport for London',
    'https://content.tfl.gov.uk/tfl-colour-standard.pdf',
    'TfL Colour Standard — uso sujeito às regras da TfL',
    'https://tfl.gov.uk/info-for/business-and-advertisers/design-standards',
    'Line colours derived from the TfL Colour Standard, Issue 11 (August 2026)',
    'Estático, revisado pela TfL',
    'ok',
    'Cores oficiais em RGB convertidas para hex. O projeto não usa o roundel nem o logotipo da TfL.'
  ),
  (
    'openfreemap-osm',
    'OpenFreeMap / OpenStreetMap',
    'OpenFreeMap / OpenStreetMap contributors',
    'https://openfreemap.org/',
    'OpenStreetMap ODbL',
    'https://www.openstreetmap.org/copyright',
    '© OpenStreetMap contributors',
    'Contínuo',
    'ok',
    'Basemap vetorial dark e glyphs das labels. Não contém dados operacionais da TfL.'
  )
on conflict (id) do update set
  name = excluded.name,
  publisher = excluded.publisher,
  url = excluded.url,
  license = excluded.license,
  license_url = excluded.license_url,
  attribution_text = excluded.attribution_text,
  refresh_policy = excluded.refresh_policy,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();
