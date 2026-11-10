import type { TfLMode } from '../types/domain.ts';

export interface LineBranding {
  id: string;
  name: string;
  mode: TfLMode;
  /** Hex derivado dos valores RGB oficiais do TfL Colour Standard, Issue 11 (Aug 2026). */
  colorHex: string;
  /** Cor de texto escolhida por contraste sobre colorHex. */
  textColorHex: '#FFFFFF' | '#000000';
}

/**
 * Cores oficiais das linhas.
 * Fonte: TfL Colour Standard, Issue 11 (Aug 2026), seções 3, 5 e 6.
 * https://content.tfl.gov.uk/tfl-colour-standard.pdf
 * Conversão RGB -> hex feita por nós; não é um valor publicado em hex pela TfL.
 */
export const LINE_BRANDING: readonly LineBranding[] = [
  { id: 'bakerloo', name: 'Bakerloo', mode: 'tube', colorHex: '#B26300', textColorHex: '#FFFFFF' },
  { id: 'central', name: 'Central', mode: 'tube', colorHex: '#DC241F', textColorHex: '#FFFFFF' },
  { id: 'circle', name: 'Circle', mode: 'tube', colorHex: '#FFC80A', textColorHex: '#000000' },
  { id: 'district', name: 'District', mode: 'tube', colorHex: '#007D32', textColorHex: '#FFFFFF' },
  {
    id: 'hammersmith-city',
    name: 'Hammersmith & City',
    mode: 'tube',
    colorHex: '#F589A6',
    textColorHex: '#000000',
  },
  { id: 'jubilee', name: 'Jubilee', mode: 'tube', colorHex: '#838D93', textColorHex: '#000000' },
  {
    id: 'metropolitan',
    name: 'Metropolitan',
    mode: 'tube',
    colorHex: '#9B0058',
    textColorHex: '#FFFFFF',
  },
  { id: 'northern', name: 'Northern', mode: 'tube', colorHex: '#000000', textColorHex: '#FFFFFF' },
  {
    id: 'piccadilly',
    name: 'Piccadilly',
    mode: 'tube',
    colorHex: '#0019A8',
    textColorHex: '#FFFFFF',
  },
  { id: 'victoria', name: 'Victoria', mode: 'tube', colorHex: '#039BE5', textColorHex: '#000000' },
  {
    id: 'waterloo-city',
    name: 'Waterloo & City',
    mode: 'tube',
    colorHex: '#76D0BD',
    textColorHex: '#000000',
  },
  { id: 'dlr', name: 'DLR', mode: 'dlr', colorHex: '#00AFAD', textColorHex: '#000000' },
  {
    id: 'elizabeth',
    name: 'Elizabeth line',
    mode: 'elizabeth-line',
    colorHex: '#60399E',
    textColorHex: '#FFFFFF',
  },
  {
    id: 'liberty',
    name: 'Liberty',
    mode: 'overground',
    colorHex: '#5D6061',
    textColorHex: '#FFFFFF',
  },
  {
    id: 'lioness',
    name: 'Lioness',
    mode: 'overground',
    colorHex: '#FAA61A',
    textColorHex: '#000000',
  },
  {
    id: 'mildmay',
    name: 'Mildmay',
    mode: 'overground',
    colorHex: '#0077AD',
    textColorHex: '#FFFFFF',
  },
  {
    id: 'suffragette',
    name: 'Suffragette',
    mode: 'overground',
    colorHex: '#5BBD72',
    textColorHex: '#000000',
  },
  {
    id: 'weaver',
    name: 'Weaver',
    mode: 'overground',
    colorHex: '#823A62',
    textColorHex: '#FFFFFF',
  },
  {
    id: 'windrush',
    name: 'Windrush',
    mode: 'overground',
    colorHex: '#ED1B00',
    textColorHex: '#FFFFFF',
  },
  { id: 'tram', name: 'Tram', mode: 'tram', colorHex: '#5FB526', textColorHex: '#000000' },
] as const;

export const LINE_BRANDING_BY_ID: Record<string, LineBranding> = Object.fromEntries(
  LINE_BRANDING.map((line) => [line.id, line]),
);

/** Fallback para linhas novas ou não mapeadas. */
export const OVERGROUND_FALLBACK_COLOR = '#FA7B05';

/** Paleta de status do produto (não é uma cor oficial da TfL). */
export const STATUS_BAND_COLORS = {
  normal: '#2FD18B',
  attention: '#F5B544',
  severe: '#FF8A3D',
  closure: '#FF5A5F',
  unknown: '#7A879C',
} as const;
