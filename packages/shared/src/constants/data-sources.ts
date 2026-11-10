export type DataSourceHealth = 'ok' | 'degraded' | 'error' | 'unknown' | 'not_synced';

export interface DataSourceDefinition {
  id: string;
  name: string;
  publisher: string;
  url: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  refreshPolicy: string;
  status: DataSourceHealth;
  notes: string;
}

/**
 * Catálogo inicial de fontes. Os mesmos registros são inseridos em
 * public.data_sources pela migration de seed.
 */
export const DATA_SOURCES: readonly DataSourceDefinition[] = [
  {
    id: 'tfl-unified-api',
    name: 'TfL Unified API',
    publisher: 'Transport for London',
    url: 'https://api.tfl.gov.uk/',
    license: 'TfL Transport Data Terms and Conditions',
    licenseUrl: 'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    attribution: 'Information supplied by Transport for London',
    refreshPolicy: 'Status e arrivals ~60 s; dados estáticos 1 h–24 h',
    status: 'not_synced',
    notes:
      'Fonte primária de status, disrupções, previsões, topologia e facilities. Requer app_key no backend para o plano de 500 req/min.',
  },
  {
    id: 'tfl-open-data',
    name: 'TfL Open Data feeds',
    publisher: 'Transport for London',
    url: 'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    license: 'TfL Transport Data Terms and Conditions',
    licenseUrl: 'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    attribution: 'Information supplied by Transport for London',
    refreshPolicy: 'Variável por feed (diária a trimestral)',
    status: 'not_synced',
    notes:
      'Station facilities KML, step-free access and toilet data, live lift disruptions e Stop Structure API. Alguns feeds exigem registro.',
  },
  {
    id: 'tfl-crowding-data',
    name: 'TfL Crowding and Network Demand data',
    publisher: 'Transport for London',
    url: 'https://crowding.data.tfl.gov.uk/',
    license: 'TfL Transport Data Terms and Conditions',
    licenseUrl: 'https://tfl.gov.uk/info-for/open-data-users/our-open-data',
    attribution: 'Information supplied by Transport for London',
    refreshPolicy: 'Diária, mensal e anual, conforme dataset',
    status: 'not_synced',
    notes:
      'Station footfall diário, annual station counts, crowding 2017, RODS e NUMBAT. Dados históricos/típicos, não ocupação em tempo real.',
  },
  {
    id: 'tfl-colour-standard',
    name: 'TfL Colour Standard',
    publisher: 'Transport for London',
    url: 'https://content.tfl.gov.uk/tfl-colour-standard.pdf',
    license: 'TfL Colour Standard — uso sujeito às regras da TfL',
    licenseUrl: 'https://tfl.gov.uk/info-for/business-and-advertisers/design-standards',
    attribution: 'Line colours derived from the TfL Colour Standard, Issue 11 (August 2026)',
    refreshPolicy: 'Estático, revisado pela TfL',
    status: 'ok',
    notes:
      'Cores oficiais em RGB convertidas para hex. O projeto não usa o roundel nem o logotipo da TfL.',
  },
  {
    id: 'ons-london-boroughs',
    name: 'ONS London borough boundaries (Dec 2025, generalised)',
    publisher: 'Office for National Statistics',
    url: 'https://geoportal.statistics.gov.uk/',
    license: 'Open Government Licence v3.0',
    licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    attribution: 'Boundaries © Crown copyright and database right 2025, ONS, OGL v3.0',
    refreshPolicy: 'Anual (boundaries)',
    status: 'ok',
    notes:
      'Camada GIS opcional com os 33 boroughs de Londres. Não contém dados operacionais da TfL.',
  },
  {
    id: 'openfreemap-osm',
    name: 'OpenFreeMap / OpenStreetMap',
    publisher: 'OpenFreeMap / OpenStreetMap contributors',
    url: 'https://openfreemap.org/',
    license: 'OpenStreetMap ODbL',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    attribution: '© OpenStreetMap contributors',
    refreshPolicy: 'Contínuo',
    status: 'ok',
    notes: 'Basemap vetorial dark e glyphs das labels. Não contém dados operacionais da TfL.',
  },
] as const;

export const DATA_SOURCE_BY_ID: Record<string, DataSourceDefinition> = Object.fromEntries(
  DATA_SOURCES.map((source) => [source.id, source]),
);
