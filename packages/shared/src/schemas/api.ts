import { z } from 'zod';

export const dataSourceStatusSchema = z.enum(['live', 'cached', 'stale', 'unavailable']);
export const dataQualitySchema = z.enum([
  'reported',
  'derived',
  'historical',
  'scenario',
  'unknown',
]);
export const statusBandSchema = z.enum(['normal', 'attention', 'severe', 'closure', 'unknown']);

export const apiMetaSchema = z.object({
  source: z.enum(['tfl-unified-api', 'tfl-open-data', 'derived', 'cache']),
  fetchedAt: z.string().datetime().nullable(),
  cachedAt: z.string().datetime().nullable(),
  cacheTtlSeconds: z.number().int().nonnegative(),
  isStale: z.boolean(),
  dataSourceStatus: dataSourceStatusSchema,
  ageSeconds: z.number().int().nonnegative().nullable(),
  requestId: z.string().min(1),
  schemaVersion: z.string().min(1),
  dataQuality: dataQualitySchema,
  upstream: z
    .object({
      status: z.number().int(),
      ttlSeconds: z.number().nonnegative().optional(),
      error: z.string().optional(),
    })
    .optional(),
  warnings: z.array(z.string()).optional(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export function apiEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    meta: apiMetaSchema,
    error: apiErrorSchema.optional(),
  });
}

export const healthCheckResultSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  service: z.string(),
  version: z.string(),
  time: z.string().datetime(),
  checks: z.object({
    database: z.enum(['ok', 'error', 'not_configured']),
    cache: z.enum(['ok', 'error', 'not_configured']),
    tfl: z.enum(['ok', 'error', 'not_checked']),
  }),
});

export const healthEnvelopeSchema = apiEnvelopeSchema(healthCheckResultSchema);

export type ApiMetaInput = z.infer<typeof apiMetaSchema>;
export type HealthCheckResultInput = z.infer<typeof healthCheckResultSchema>;
