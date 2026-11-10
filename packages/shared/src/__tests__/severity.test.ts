import { describe, expect, it } from 'vitest';
import {
  getStatusBand,
  getStatusBandRank,
  isDisruptedBand,
  SEVERITY_BAND_BY_LEVEL,
} from '../constants/severity.ts';
import { parseTfLDate } from '../utils/date.ts';
import { selectPrimaryStatus } from '../utils/status.ts';

describe('severity mapping', () => {
  it('maps Good Service to normal', () => {
    expect(getStatusBand(10)).toBe('normal');
    expect(getStatusBand(18)).toBe('normal');
  });

  it('maps closures and suspensions to closure', () => {
    expect(getStatusBand(2)).toBe('closure');
    expect(getStatusBand(20)).toBe('closure');
  });

  it('maps severe delays to severe', () => {
    expect(getStatusBand(6)).toBe('severe');
  });

  it('maps unknown levels to unknown', () => {
    expect(getStatusBand(999)).toBe('unknown');
    expect(getStatusBand(null)).toBe('unknown');
  });

  it('covers every level from 0 to 20', () => {
    for (let level = 0; level <= 20; level += 1) {
      expect(SEVERITY_BAND_BY_LEVEL[level]).toBeDefined();
      expect(Number.isFinite(getStatusBandRank(SEVERITY_BAND_BY_LEVEL[level]!))).toBe(true);
    }
  });

  it('identifies disrupted bands', () => {
    expect(isDisruptedBand('normal')).toBe(false);
    expect(isDisruptedBand('attention')).toBe(true);
    expect(isDisruptedBand('closure')).toBe(true);
  });
});

describe('selectPrimaryStatus', () => {
  it('prefers isNow statuses', () => {
    const selected = selectPrimaryStatus([
      { severity: 5, description: 'Part Closure', isNow: false },
      { severity: 20, description: 'Service Closed', isNow: true },
    ]);
    expect(selected?.severity).toBe(20);
  });

  it('prefers the most severe band', () => {
    const selected = selectPrimaryStatus([
      { severity: 9, description: 'Minor Delays' },
      { severity: 6, description: 'Severe Delays' },
      { severity: 10, description: 'Good Service' },
    ]);
    expect(selected?.description).toBe('Severe Delays');
  });

  it('returns null for an empty list', () => {
    expect(selectPrimaryStatus([])).toBeNull();
  });
});

describe('parseTfLDate', () => {
  it('treats TfL zero dates as null', () => {
    expect(parseTfLDate('0001-01-01T00:00:00')).toBeNull();
  });

  it('normalizes valid dates to ISO', () => {
    expect(parseTfLDate('2026-11-10T02:43:35Z')).toBe('2026-11-10T02:43:35.000Z');
  });

  it('returns null for invalid dates', () => {
    expect(parseTfLDate('not-a-date')).toBeNull();
    expect(parseTfLDate(null)).toBeNull();
  });
});
