import { z } from 'zod';

/**
 * Schemas parciais e permissivos para a TfL Unified API.
 * O objetivo é falhar cedo em respostas estruturalmente inválidas sem
 * rejeitar campos novos que a TfL venha a adicionar.
 */

const loose = <T extends z.ZodRawShape>(shape: T) => z.object(shape).passthrough();

export const tflValidityPeriodSchema = loose({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  isNow: z.boolean().optional(),
});

export const tflStopPointRefSchema = loose({
  id: z.string().optional(),
  naptanId: z.string().optional(),
  commonName: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
});

export const tflDisruptedRouteSchema = loose({
  id: z.string().optional(),
  name: z.string().optional(),
  direction: z.string().optional(),
  originationName: z.string().optional(),
  destinationName: z.string().optional(),
});

export const tflDisruptionSchema = loose({
  category: z.string().optional(),
  type: z.string().optional(),
  categoryDescription: z.string().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  additionalInfo: z.string().optional(),
  created: z.string().optional(),
  lastUpdate: z.string().optional(),
  closureText: z.string().optional(),
  affectedRoutes: z.array(tflDisruptedRouteSchema).optional(),
  affectedStops: z.array(tflStopPointRefSchema).optional(),
});

export const tflLineStatusSchema = loose({
  id: z.number().optional(),
  lineId: z.string().optional(),
  statusSeverity: z.number().optional(),
  statusSeverityDescription: z.string().optional(),
  reason: z.string().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
  validityPeriods: z.array(tflValidityPeriodSchema).optional(),
  disruption: tflDisruptionSchema.optional(),
});

export const tflLineSchema = loose({
  id: z.string(),
  name: z.string(),
  modeName: z.string(),
  created: z.string().optional(),
  modified: z.string().optional(),
  lineStatuses: z.array(tflLineStatusSchema).optional(),
  disruptions: z.array(tflDisruptionSchema).optional(),
  routeSections: z.array(tflDisruptedRouteSchema).optional(),
  serviceTypes: z.array(loose({ name: z.string(), uri: z.string().optional() })).optional(),
});

export const tflMatchedStopSchema = loose({
  stationId: z.string().optional(),
  icsId: z.string().optional(),
  topMostParentId: z.string().optional(),
  parentId: z.string().optional(),
  modes: z.array(z.string()).optional(),
  stopType: z.string().optional(),
  zone: z.string().optional(),
  accessibilitySummary: z.string().optional(),
  hasDisruption: z.boolean().optional(),
  status: z.boolean().optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  lines: z.array(loose({ id: z.string(), name: z.string().optional() })).optional(),
});

export const tflStopPointSequenceSchema = loose({
  lineId: z.string().optional(),
  lineName: z.string().optional(),
  direction: z.string().optional(),
  branchId: z.number().optional(),
  nextBranchIds: z.array(z.number()).optional(),
  prevBranchIds: z.array(z.number()).optional(),
  serviceType: z.string().optional(),
  stopPoint: z.array(tflMatchedStopSchema).optional(),
});

export const tflOrderedLineRouteSchema = loose({
  name: z.string(),
  naptanIds: z.array(z.string()),
  serviceType: z.string().optional(),
});

export const tflRouteSequenceSchema = loose({
  lineId: z.string(),
  lineName: z.string().optional(),
  direction: z.string(),
  isOutboundOnly: z.boolean().optional(),
  mode: z.string().optional(),
  lineStrings: z.array(z.string()).optional(),
  stations: z.array(tflMatchedStopSchema).optional(),
  stopPointSequences: z.array(tflStopPointSequenceSchema).optional(),
  orderedLineRoutes: z.array(tflOrderedLineRouteSchema).optional(),
});

export const tflAdditionalPropertySchema = loose({
  key: z.string(),
  value: z.string(),
});

export const tflStopPointSchema = loose({
  naptanId: z.string(),
  commonName: z.string(),
  stopType: z.string().optional(),
  stationNaptan: z.string().optional(),
  hubNaptanCode: z.string().optional(),
  icsCode: z.string().optional(),
  modes: z.array(z.string()).optional(),
  lines: z.array(loose({ id: z.string(), name: z.string().optional() })).optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  zone: z.string().optional(),
  accessibilitySummary: z.string().optional(),
  additionalProperties: z.array(tflAdditionalPropertySchema).optional(),
  children: z.array(z.record(z.string(), z.unknown())).optional(),
  status: z.boolean().optional(),
});

export const tflPredictionSchema = loose({
  id: z.string(),
  operationType: z.number().optional(),
  vehicleId: z.string().optional(),
  naptanId: z.string().optional(),
  stationName: z.string().optional(),
  lineId: z.string().optional(),
  lineName: z.string().optional(),
  platformName: z.string().optional(),
  direction: z.string().optional(),
  bearing: z.string().optional(),
  destinationNaptanId: z.string().optional(),
  destinationName: z.string().optional(),
  timestamp: z.string().optional(),
  timeToStation: z.number().optional(),
  currentLocation: z.string().optional(),
  towards: z.string().optional(),
  expectedArrival: z.string().optional(),
  timeToLive: z.string().optional(),
  modeName: z.string().optional(),
});

export const tflStatusSeveritySchema = loose({
  modeName: z.string(),
  severityLevel: z.number(),
  description: z.string(),
});

export const tflModeSchema = loose({
  modeName: z.string(),
  isTflService: z.boolean().optional(),
  isFarePaying: z.boolean().optional(),
  isScheduledService: z.boolean().optional(),
});

export const tflLineArraySchema = z.array(tflLineSchema);
export const tflDisruptionArraySchema = z.array(tflDisruptionSchema);
export const tflStopPointArraySchema = z.array(tflStopPointSchema);
export const tflPredictionArraySchema = z.array(tflPredictionSchema);
export const tflStatusSeverityArraySchema = z.array(tflStatusSeveritySchema);
export const tflModeArraySchema = z.array(tflModeSchema);

export type TflLineSchema = z.infer<typeof tflLineSchema>;
export type TflRouteSequenceSchema = z.infer<typeof tflRouteSequenceSchema>;
export type TflStopPointSchema = z.infer<typeof tflStopPointSchema>;
export type TflPredictionSchema = z.infer<typeof tflPredictionSchema>;
