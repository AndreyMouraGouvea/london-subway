import type { TfLMode } from '../types/domain.ts';

export const TFL_MODES: readonly TfLMode[] = [
  'tube',
  'overground',
  'dlr',
  'elizabeth-line',
  'tram',
] as const;

export const MODE_LABELS: Record<TfLMode, string> = {
  tube: 'London Underground',
  overground: 'London Overground',
  dlr: 'DLR',
  'elizabeth-line': 'Elizabeth line',
  tram: 'London Trams',
};

export const MODE_SHORT_LABELS: Record<TfLMode, string> = {
  tube: 'Tube',
  overground: 'Overground',
  dlr: 'DLR',
  'elizabeth-line': 'Elizabeth',
  tram: 'Tram',
};

/** Query string usada em /Line/Mode/{modes}/Status. */
export const TFL_MODE_QUERY = TFL_MODES.join(',');
