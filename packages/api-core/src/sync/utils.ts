import type { GeoJSONMultiLineString } from '../../../shared/src/types/api.ts';
import type { TfLAdditionalProperty } from '../../../shared/src/types/tfl.ts';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(limit, items.length));

  async function run(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return results;
}

export function cleanStationName(name: string): string {
  return name
    .replace(/\s+(Underground|DLR|Rail|Overground|Tram)\s+(Station|Stop)$/i, '')
    .replace(/\s+Station$/i, '')
    .trim();
}

export function facilitiesFrom(
  properties: readonly TfLAdditionalProperty[] | undefined,
): Record<string, string> {
  const facilities: Record<string, string> = {};
  for (const property of properties ?? []) {
    if (property.key) facilities[property.key] = property.value;
  }
  return facilities;
}

export function isYes(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  return null;
}

export function countFrom(value: string | undefined): number | null {
  if (value === undefined) return null;
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

export function isPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/**
 * A TfL devolve lineStrings como string JSON com pares [lon, lat].
 * Pode haver uma ou várias linhas. Convertemos tudo para MultiLineString.
 */
export function parseLineStrings(
  lineStrings: readonly string[] | undefined,
): GeoJSONMultiLineString | null {
  const coordinates: number[][][] = [];

  for (const raw of lineStrings ?? []) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) continue;

    if (isPair(parsed[0])) {
      const line = parsed.filter(isPair).map(([lon, lat]) => [lon, lat]);
      if (line.length >= 2) coordinates.push(line);
      continue;
    }

    for (const segment of parsed) {
      if (!Array.isArray(segment) || segment.length < 2) continue;
      const line = segment.filter(isPair).map(([lon, lat]) => [lon, lat]);
      if (line.length >= 2) coordinates.push(line);
    }
  }

  if (coordinates.length === 0) return null;
  return { type: 'MultiLineString', coordinates };
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value || value.startsWith('0001-01-01')) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function minutesSince(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (now - date.getTime()) / 60_000);
}
