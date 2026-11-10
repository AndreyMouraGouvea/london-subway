-- Registo da fonte do basemap raster usado pelo CCO.

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
  'carto-basemap',
  'CARTO Dark basemap',
  'CARTO / OpenStreetMap contributors',
  'https://carto.com/basemaps/',
  'OpenStreetMap ODbL + CARTO basemap attribution',
  'https://carto.com/attributions',
  '© OpenStreetMap contributors © CARTO',
  'Contínuo',
  'ok',
  'Basemap raster dark usado no mapa. Não contém dados operacionais da TfL; a atribuição é obrigatória.'
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
