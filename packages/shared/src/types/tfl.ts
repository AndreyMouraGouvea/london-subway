/**
 * Contratos parciais da TfL Unified API.
 * Campos validados ao vivo em 2026-11-09/10. Campos marcados como opcionais
 * podem não existir em todas as respostas ou modos.
 */

export interface TfLLine {
  id: string;
  name: string;
  modeName: string;
  created?: string;
  modified?: string;
  lineStatuses?: TfLLineStatus[];
  disruptions?: TfLDisruption[];
  routeSections?: TfLMatchedRoute[];
  serviceTypes?: Array<{ name: string; uri: string }>;
}

export interface TfLLineStatus {
  id?: number;
  lineId?: string;
  statusSeverity: number;
  statusSeverityDescription: string;
  reason?: string;
  created?: string;
  modified?: string;
  validityPeriods?: TfLValidityPeriod[];
  disruption?: TfLDisruption;
}

export interface TfLValidityPeriod {
  fromDate?: string;
  toDate?: string;
  isNow?: boolean;
}

export type TfLDisruptionCategory =
  'Undefined' | 'RealTime' | 'PlannedWork' | 'Information' | 'Event' | 'Crowding' | 'StatusAlert';

export interface TfLDisruption {
  category?: TfLDisruptionCategory | string;
  type?: string;
  categoryDescription?: string;
  description?: string;
  summary?: string;
  additionalInfo?: string;
  created?: string;
  lastUpdate?: string;
  closureText?: string;
  affectedRoutes?: TfLDisruptedRoute[];
  affectedStops?: TfLStopPointRef[];
}

export interface TfLDisruptedRoute {
  id?: string;
  name?: string;
  direction?: string;
  originationName?: string;
  destinationName?: string;
}

export interface TfLStopPointRef {
  id?: string;
  naptanId?: string;
  commonName?: string;
  lat?: number;
  lon?: number;
}

export interface TfLMatchedRoute {
  name?: string;
  direction?: string;
  originationName?: string;
  destinationName?: string;
  originator?: string;
  destination?: string;
  serviceType?: string;
  validFrom?: string;
  validTo?: string;
}

export interface TfLRouteSequence {
  lineId: string;
  lineName: string;
  direction: 'inbound' | 'outbound' | string;
  isOutboundOnly?: boolean;
  mode: string;
  /** Cada item é uma string JSON com pares [lon, lat]. */
  lineStrings?: string[];
  stations?: TfLMatchedStop[];
  stopPointSequences?: TfLStopPointSequence[];
  orderedLineRoutes?: TfLOrderedLineRoute[];
}

export interface TfLOrderedLineRoute {
  name: string;
  naptanIds: string[];
  serviceType?: string;
}

export interface TfLStopPointSequence {
  lineId?: string;
  lineName?: string;
  direction?: string;
  branchId?: number;
  nextBranchIds?: number[];
  prevBranchIds?: number[];
  serviceType?: string;
  stopPoint?: TfLMatchedStop[];
}

export interface TfLMatchedStop {
  stationId?: string;
  icsId?: string;
  topMostParentId?: string;
  parentId?: string;
  modes?: string[];
  stopType?: string;
  zone?: string;
  accessibilitySummary?: string;
  hasDisruption?: boolean;
  status?: boolean;
  id?: string;
  name?: string;
  lat?: number;
  lon?: number;
  lines?: Array<{ id: string; name: string }>;
}

export interface TfLStopPoint {
  naptanId: string;
  commonName: string;
  id?: string;
  platformName?: string;
  indicator?: string;
  stopLetter?: string;
  fullName?: string;
  individualStopId?: string;
  stopType?: string;
  stationNaptan?: string;
  hubNaptanCode?: string;
  icsCode?: string;
  modes?: string[];
  lines?: Array<{ id: string; name: string }>;
  lat?: number;
  lon?: number;
  zone?: string;
  accessibilitySummary?: string;
  additionalProperties?: TfLAdditionalProperty[];
  children?: TfLStopPoint[];
  status?: boolean;
}

export interface TfLAdditionalProperty {
  key: string;
  value: string;
}

export interface TfLPrediction {
  id: string;
  operationType?: number;
  vehicleId?: string;
  naptanId?: string;
  stationName?: string;
  lineId?: string;
  lineName?: string;
  platformName?: string;
  direction?: string;
  bearing?: string;
  destinationNaptanId?: string;
  destinationName?: string;
  timestamp?: string;
  timeToStation?: number;
  currentLocation?: string;
  towards?: string;
  expectedArrival?: string;
  timeToLive?: string;
  modeName?: string;
}

export interface TfLStatusSeverity {
  modeName: string;
  severityLevel: number;
  description: string;
}

export interface TfLModeInfo {
  modeName: string;
  isTflService?: boolean;
  isFarePaying?: boolean;
  isScheduledService?: boolean;
}

export interface TfLApiError {
  timestampUtc?: string;
  exceptionType?: string;
  httpStatusCode?: number;
  httpStatus?: string;
  relativeUri?: string;
  message?: string;
}
