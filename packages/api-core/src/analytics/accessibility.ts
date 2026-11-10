import type { AnalyticsAccessibility } from '../../../shared/src/types/api.ts';

export interface AccessibilityStationRow {
  lineIds: string[];
  zone: string | null;
  stepFree: boolean | null;
  hasLifts: boolean | null;
  hasToilets: boolean | null;
  hasWifi: boolean | null;
  facilities: Record<string, string> | null;
}

function facilityCount(facilities: Record<string, string> | null, key: string): number | null {
  const raw = facilities?.[key];
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Indicadores de facilities observáveis. `step_free` só conta quando existe
 * valor explícito; `AccessViaLift` nunca é convertido em step-free completo.
 */
export function summariseAccessibility(
  stations: readonly AccessibilityStationRow[],
): AnalyticsAccessibility {
  let withLifts = 0;
  let withToilets = 0;
  let withWifi = 0;
  let stepFreeKnown = 0;
  let stepFreeUnknown = 0;
  let interchanges = 0;
  let missingZone = 0;

  for (const station of stations) {
    const lifts = facilityCount(station.facilities, 'Lifts');
    if ((lifts !== null && lifts > 0) || station.hasLifts === true) withLifts += 1;
    if (station.hasToilets === true) withToilets += 1;
    if (station.hasWifi === true) withWifi += 1;
    if (station.stepFree === null) stepFreeUnknown += 1;
    else stepFreeKnown += 1;
    if (station.lineIds.length > 1) interchanges += 1;
    if (!station.zone) missingZone += 1;
  }

  return {
    totalStations: stations.length,
    withLifts,
    withToilets,
    withWifi,
    stepFreeKnown,
    stepFreeUnknown,
    interchanges,
    missingZone,
    note: 'Lifts, WC e WiFi vêm das facilities observadas. Step-free só é contado quando o valor é explícito; AccessViaLift não é usado como prova de step-free.',
  };
}
