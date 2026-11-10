import type { StatusBand } from '../types/domain.ts';

/**
 * Mapa semântico derivado dos severityLevel da TfL.
 * A TfL documenta os níveis por modo em /Line/Meta/Severity; os níveis
 * 0..20 são estáveis para os modos usados neste projeto, mas a descrição
 * oficial sempre prevalece e é exibida ao usuário.
 */
export const SEVERITY_BAND_BY_LEVEL: Readonly<Record<number, StatusBand>> = {
  0: 'attention', // Special Service
  1: 'closure', // Closed
  2: 'closure', // Suspended
  3: 'severe', // Part Suspended
  4: 'severe', // Planned Closure
  5: 'severe', // Part Closure
  6: 'severe', // Severe Delays
  7: 'attention', // Reduced Service
  8: 'attention', // Bus Service
  9: 'attention', // Minor Delays
  10: 'normal', // Good Service
  11: 'severe', // Part Closed
  12: 'attention', // Exit Only
  13: 'attention', // No Step Free Access
  14: 'attention', // Change of frequency
  15: 'attention', // Diverted
  16: 'closure', // Not Running
  17: 'attention', // Issues Reported
  18: 'normal', // No Issues
  19: 'unknown', // Information
  20: 'closure', // Service Closed
};

export const SEVERITY_DESCRIPTION_FALLBACK: Readonly<Record<number, string>> = {
  0: 'Special Service',
  1: 'Closed',
  2: 'Suspended',
  3: 'Part Suspended',
  4: 'Planned Closure',
  5: 'Part Closure',
  6: 'Severe Delays',
  7: 'Reduced Service',
  8: 'Bus Service',
  9: 'Minor Delays',
  10: 'Good Service',
  11: 'Part Closed',
  12: 'Exit Only',
  13: 'No Step Free Access',
  14: 'Change of frequency',
  15: 'Diverted',
  16: 'Not Running',
  17: 'Issues Reported',
  18: 'No Issues',
  19: 'Information',
  20: 'Service Closed',
};

export const STATUS_BAND_LABELS: Readonly<Record<StatusBand, string>> = {
  normal: 'Normal',
  attention: 'Atenção',
  severe: 'Severa',
  closure: 'Fechamento',
  unknown: 'Sem informação',
};

export const STATUS_BAND_DESCRIPTIONS: Readonly<Record<StatusBand, string>> = {
  normal: 'Serviço normal ou sem problemas reportados.',
  attention: 'Atrasos menores, serviço reduzido ou informação relevante.',
  severe: 'Atrasos severos, serviço parcial ou interrupção importante.',
  closure: 'Serviço suspenso, fechado ou não operando.',
  unknown: 'Dado ausente, não informado ou fora do mapa de severidade.',
};

export const STATUS_BAND_ORDER: Readonly<Record<StatusBand, number>> = {
  unknown: 0,
  normal: 1,
  attention: 2,
  severe: 3,
  closure: 4,
};

export function getStatusBand(severity: number | null | undefined): StatusBand {
  if (severity === null || severity === undefined) return 'unknown';
  return SEVERITY_BAND_BY_LEVEL[severity] ?? 'unknown';
}

export function getStatusBandRank(band: StatusBand): number {
  return STATUS_BAND_ORDER[band] ?? 0;
}

export function isDisruptedBand(band: StatusBand): boolean {
  return band === 'attention' || band === 'severe' || band === 'closure';
}
