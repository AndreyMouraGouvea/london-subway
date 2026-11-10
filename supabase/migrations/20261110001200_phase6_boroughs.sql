-- Fase 6: camada GIS de boroughs de Londres (ONS, OGL v3.0).

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
  'ons-london-boroughs',
  'ONS London borough boundaries (Dec 2025, generalised)',
  'Office for National Statistics',
  'https://geoportal.statistics.gov.uk/',
  'Open Government Licence v3.0',
  'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  'Boundaries © Crown copyright and database right 2025, ONS, OGL v3.0',
  'Anual (boundaries)',
  'ok',
  'Camada GIS opcional com os 33 boroughs de Londres. Não contém dados operacionais da TfL.'
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
