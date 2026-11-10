import { describe, expect, it } from 'vitest';
import {
  cleanStationName,
  countFrom,
  facilitiesFrom,
  isYes,
  parseLineStrings,
  sha256Hex,
} from '../sync/utils.ts';
import { stationFromMatchedStop, stationFromStopPoint } from '../sync/normalize.ts';

describe('sync utils', () => {
  it('cleans station suffixes without damaging the name', () => {
    expect(cleanStationName('Oxford Circus Underground Station')).toBe('Oxford Circus');
    expect(cleanStationName('Addiscombe Tram Stop')).toBe('Addiscombe');
    expect(cleanStationName('London Bridge Rail Station')).toBe('London Bridge');
  });

  it('parses TfL lineStrings into a MultiLineString', () => {
    const raw = JSON.stringify([
      [
        [-0.1, 51.5],
        [-0.11, 51.51],
      ],
    ]);
    const geometry = parseLineStrings([raw]);
    expect(geometry?.type).toBe('MultiLineString');
    expect(geometry?.coordinates).toHaveLength(1);
    expect(geometry?.coordinates[0]).toHaveLength(2);
  });

  it('ignores invalid lineStrings', () => {
    expect(parseLineStrings(['not-json', '[]'])).toBeNull();
  });

  it('normalizes facilities and yes/no values', () => {
    const facilities = facilitiesFrom([
      { key: 'Lifts', value: '3' },
      { key: 'WiFi', value: 'yes' },
      { key: 'Toilets', value: 'no' },
    ]);
    expect(facilities.Lifts).toBe('3');
    expect(countFrom('3')).toBe(3);
    expect(countFrom('-1')).toBeNull();
    expect(isYes('yes')).toBe(true);
    expect(isYes('no')).toBe(false);
    expect(isYes(undefined)).toBeNull();
  });

  it('produces stable sha256 hashes', async () => {
    const first = await sha256Hex('london');
    const second = await sha256Hex('london');
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});

describe('station normalization', () => {
  it('canonicalizes tram platforms to stationNaptan', () => {
    const station = stationFromStopPoint(
      {
        naptanId: '9400ZZCRADD1',
        commonName: 'Addiscombe',
        stopType: 'NaptanMetroPlatform',
        stationNaptan: '940GZZCRADD',
        lat: 51.379753,
        lon: -0.073058,
        modes: ['tram'],
        additionalProperties: [],
      },
      'tram',
      '2026-11-10T00:00:00Z',
    );
    expect(station?.id).toBe('940GZZCRADD');
    expect(station?.line_ids).toEqual(['tram']);
  });

  it('skips transport interchange hubs', () => {
    const station = stationFromStopPoint(
      {
        naptanId: 'HUBPAD',
        commonName: 'Paddington',
        stopType: 'TransportInterchange',
        lat: 51.515,
        lon: -0.175,
      },
      'bakerloo',
      '2026-11-10T00:00:00Z',
    );
    expect(station).toBeNull();
  });

  it('skips hubs in route sequence station lists', () => {
    const station = stationFromMatchedStop(
      {
        stationId: 'HUBGNW',
        id: 'HUBGNW',
        name: 'Greenwich',
        stopType: 'TransportInterchange',
        lat: 51.478,
        lon: -0.014,
      },
      'dlr',
      '2026-11-10T00:00:00Z',
    );
    expect(station).toBeNull();
  });

  it('extracts facilities from a station stop point', () => {
    const station = stationFromStopPoint(
      {
        naptanId: '940GZZLUOXC',
        commonName: 'Oxford Circus Underground Station',
        stopType: 'NaptanMetroStation',
        lat: 51.515224,
        lon: -0.141903,
        modes: ['tube'],
        additionalProperties: [
          { key: 'Lifts', value: '0' },
          { key: 'Escalators', value: '14' },
          { key: 'WiFi', value: 'yes' },
          { key: 'Toilets', value: 'no' },
          { key: 'Ticket Halls', value: '2' },
          { key: 'Zone', value: '1' },
        ],
      },
      'bakerloo',
      '2026-11-10T00:00:00Z',
    );
    expect(station?.has_lifts).toBe(false);
    expect(station?.has_escalators).toBe(true);
    expect(station?.has_wifi).toBe(true);
    expect(station?.has_toilets).toBe(false);
    expect(station?.ticket_halls).toBe(2);
    expect(station?.zone).toBe('1');
  });
});
