import type { StatusBand } from '../types/domain.ts';
import { getStatusBand, getStatusBandRank } from '../constants/severity.ts';

export interface StatusCandidate {
  severity: number;
  description: string;
  reason?: string | null;
  band?: StatusBand;
  isNow?: boolean | null;
  validityFrom?: string | null;
  validityTo?: string | null;
  category?: string | null;
}

/**
 * Escolhe o status "principal" de uma linha quando a TfL devolve mais de um
 * (por exemplo, Part Closure + Service Closed no mesmo snapshot).
 * Prioriza isNow, depois a banda semântica e, por fim, o severityLevel.
 */
export function selectPrimaryStatus<T extends StatusCandidate>(statuses: readonly T[]): T | null {
  if (statuses.length === 0) return null;

  const withBand = statuses.map((status) => ({
    status,
    band: status.band ?? getStatusBand(status.severity),
    isNow: status.isNow === true ? 1 : 0,
    rank: getStatusBandRank(status.band ?? getStatusBand(status.severity)),
  }));

  withBand.sort((a, b) => {
    if (a.isNow !== b.isNow) return b.isNow - a.isNow;
    if (a.rank !== b.rank) return b.rank - a.rank;
    return b.status.severity - a.status.severity;
  });

  return withBand[0]?.status ?? null;
}

/** Ordena status por importância para exibição em listas. */
export function sortStatusesBySeverity<T extends StatusCandidate>(statuses: readonly T[]): T[] {
  return [...statuses].sort((a, b) => {
    const bandA = a.band ?? getStatusBand(a.severity);
    const bandB = b.band ?? getStatusBand(b.severity);
    return getStatusBandRank(bandB) - getStatusBandRank(bandA);
  });
}
