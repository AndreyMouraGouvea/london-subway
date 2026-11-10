import { describe, expect, it } from 'vitest';
import {
  baseKey,
  buildStationIndex,
  parseCount,
  parseFootfallCsv,
  parseTravelDate,
  resolveStationName,
  type CanonicalStation,
} from '../footfall/parse.ts';

const stations: CanonicalStation[] = [
  {
    id: '940GZZLUOXC',
    name: 'Oxford Circus',
    displayName: 'Oxford Circus',
    stopType: 'NaptanMetroStation',
    modes: ['tube'],
    lineIds: ['bakerloo', 'central', 'victoria'],
  },
  {
    id: '940GZZLUCYF',
    name: 'Canary Wharf',
    displayName: 'Canary Wharf',
    stopType: 'NaptanMetroStation',
    modes: ['tube'],
    lineIds: ['jubilee'],
  },
  {
    id: '940GZZDLCAN',
    name: 'Canary Wharf',
    displayName: 'Canary Wharf',
    stopType: 'NaptanMetroStation',
    modes: ['dlr'],
    lineIds: ['dlr'],
  },
  {
    id: '910GCANWHRF',
    name: 'Canary Wharf',
    displayName: 'Canary Wharf',
    stopType: 'NaptanRailStation',
    modes: ['elizabeth-line'],
    lineIds: ['elizabeth'],
  },
  {
    id: '940GZZLUHSC',
    name: 'Hammersmith (H&C Line)',
    displayName: 'Hammersmith (H&C Line)',
    stopType: 'NaptanMetroStation',
    modes: ['tube'],
    lineIds: ['circle', 'hammersmith-city'],
  },
  {
    id: '940GZZLUHSD',
    name: 'Hammersmith (Dist&Picc Line)',
    displayName: 'Hammersmith (Dist&Picc Line)',
    stopType: 'NaptanMetroStation',
    modes: ['tube'],
    lineIds: ['district', 'piccadilly'],
  },
  {
    id: '940GZZLUKSX',
    name: "King's Cross St. Pancras",
    displayName: "King's Cross St. Pancras",
    stopType: 'NaptanMetroStation',
    modes: ['tube'],
    lineIds: ['circle', 'hammersmith-city', 'metropolitan', 'northern', 'piccadilly', 'victoria'],
  },
  {
    id: '940GZZLUERB',
    name: 'Edgware Road (Bakerloo)',
    displayName: 'Edgware Road (Bakerloo)',
    stopType: 'NaptanMetroStation',
    modes: ['tube'],
    lineIds: ['bakerloo'],
  },
  {
    id: '940GZZLUERC',
    name: 'Edgware Road (Circle Line)',
    displayName: 'Edgware Road (Circle Line)',
    stopType: 'NaptanMetroStation',
    modes: ['tube'],
    lineIds: ['circle', 'district', 'hammersmith-city'],
  },
];

const index = buildStationIndex(stations);

describe('footfall parsing', () => {
  it('parses valid dates and rejects impossible ones', () => {
    expect(parseTravelDate('20250101')).toBe('2025-01-01');
    expect(parseTravelDate('20250229')).toBeNull();
    expect(parseTravelDate('2025-01-01')).toBeNull();
    expect(parseTravelDate('')).toBeNull();
  });

  it('keeps empty counts as null and preserves zero', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount(undefined)).toBeNull();
    expect(parseCount('0')).toBe(0);
    expect(parseCount('1234')).toBe(1234);
    expect(parseCount('-1')).toBeNull();
    expect(parseCount('abc')).toBeNull();
  });

  it('parses CSV with BOM and quoted station names', () => {
    const csv =
      '\uFEFFTravelDate,DayOfWeek,Station,EntryTapCount,ExitTapCount\r\n' +
      '20250101,Wednesday,"Oxford Circus, London",100,90\r\n' +
      '20250102,Thursday,Oxford Circus,,50\r\n' +
      '20250230,Friday,Oxford Circus,1,1\r\n';
    const result = parseFootfallCsv(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      travelDate: '2025-01-01',
      stationName: 'Oxford Circus, London',
      entries: 100,
      exits: 90,
    });
    expect(result.rows[1]?.entries).toBeNull();
    expect(result.skipped).toBe(1);
  });

  it('normalizes apostrophes and mode suffixes', () => {
    expect(baseKey("King's Cross St. Pancras")).toBe('kings cross st pancras');
    expect(baseKey('Canary Wharf Elizabeth Line')).toBe('canary wharf');
    expect(baseKey('New Cross ELL')).toBe('new cross');
  });
});

describe('footfall station resolution', () => {
  it('requires aliases for the two Hammersmith stations', () => {
    expect(resolveStationName('Hammersmith C&H', index)).toMatchObject({
      stationId: '940GZZLUHSC',
      via: 'alias',
    });
    expect(resolveStationName('Hammersmith D&P', index)).toMatchObject({
      stationId: '940GZZLUHSD',
      via: 'alias',
    });
  });

  it('requires aliases for the two Edgware Road stations', () => {
    expect(resolveStationName('Edgware Road B', index).stationId).toBe('940GZZLUERB');
    expect(resolveStationName('Edgware Road C&H', index).stationId).toBe('940GZZLUERC');
  });

  it('resolves unique names and apostrophe variants', () => {
    expect(resolveStationName('Oxford Circus', index)).toMatchObject({
      stationId: '940GZZLUOXC',
      via: 'unique',
    });
    expect(resolveStationName('Kings Cross St Pancras', index)).toMatchObject({
      stationId: '940GZZLUKSX',
      via: 'unique',
    });
  });

  it('uses suffix filtering for Elizabeth and DLR names', () => {
    expect(resolveStationName('Canary Wharf EL', index)).toMatchObject({
      stationId: '910GCANWHRF',
      via: 'suffix',
    });
    expect(resolveStationName('Canary Wharf DLR', index)).toMatchObject({
      stationId: '940GZZDLCAN',
      via: 'suffix',
    });
  });

  it('uses the documented heuristic for a generic ambiguous name', () => {
    const resolution = resolveStationName('Canary Wharf', index);
    expect(resolution.stationId).toBe('940GZZLUCYF');
    expect(resolution.via).toBe('heuristic');
  });

  it('never invents a station for an unknown name', () => {
    expect(resolveStationName('Imaginary Parkway', index)).toEqual({
      stationId: null,
      via: 'unmatched',
      candidates: [],
    });
  });
});
