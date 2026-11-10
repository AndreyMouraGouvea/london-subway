/** Modos TfL usados no produto. */
export type TfLMode = 'tube' | 'overground' | 'dlr' | 'elizabeth-line' | 'tram';

/** Categoria visual derivada da severidade TfL. */
export type StatusBand = 'normal' | 'attention' | 'severe' | 'closure' | 'unknown';

/** Estado de frescura de um dado entregue pela API. */
export type DataSourceStatus = 'live' | 'cached' | 'stale' | 'unavailable';

/** Qualidade / origem epistemológica do dado. */
export type DataQuality = 'reported' | 'derived' | 'historical' | 'scenario' | 'unknown';
