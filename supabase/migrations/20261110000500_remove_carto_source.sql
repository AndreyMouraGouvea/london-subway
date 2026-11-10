-- Remove a fonte CARTO introduzida durante o diagnóstico; o basemap ativo é OpenFreeMap.

delete from public.data_sources where id = 'carto-basemap';

update public.data_sources
set
  notes = 'Basemap vetorial dark e glyphs das labels. Não contém dados operacionais da TfL.',
  updated_at = now()
where id = 'openfreemap-osm';
