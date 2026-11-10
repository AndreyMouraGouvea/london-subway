import { describe, expect, it } from 'vitest';
import {
  analyseScenario,
  articulationPoints,
  buildGraph,
  connectedComponents,
  uniqueTransferLinks,
  uniqueUndirectedLinks,
  type OrderedStationRow,
} from '../analytics/graph.ts';
import { summariseAccessibility } from '../analytics/accessibility.ts';

const rows: OrderedStationRow[] = [
  { line_id: 'l1', station_id: 'A', direction: 'outbound', branch_id: 0, sequence: 0 },
  { line_id: 'l1', station_id: 'B', direction: 'outbound', branch_id: 0, sequence: 1 },
  { line_id: 'l1', station_id: 'C', direction: 'outbound', branch_id: 0, sequence: 2 },
  { line_id: 'l2', station_id: 'C', direction: 'outbound', branch_id: 0, sequence: 0 },
  { line_id: 'l2', station_id: 'D', direction: 'outbound', branch_id: 0, sequence: 1 },
  { line_id: 'l3', station_id: 'E', direction: 'outbound', branch_id: 0, sequence: 0 },
  { line_id: 'l3', station_id: 'F', direction: 'outbound', branch_id: 0, sequence: 1 },
];

const graph = buildGraph(['A', 'B', 'C', 'D', 'E', 'F'], rows);

describe('station graph', () => {
  it('builds undirected links from ordered station sequences', () => {
    expect(graph.edges).toHaveLength(4);
    expect(uniqueUndirectedLinks(graph)).toBe(4);
    expect(graph.adjacency.get('C')).toEqual(new Set(['B', 'D']));
    expect(graph.adjacency.get('A')).toEqual(new Set(['B']));
  });

  it('deduplicates the same pair across parallel lines for the link count', () => {
    const parallel = buildGraph(
      ['A', 'B'],
      [
        { line_id: 'l1', station_id: 'A', direction: 'outbound', branch_id: 0, sequence: 0 },
        { line_id: 'l1', station_id: 'B', direction: 'outbound', branch_id: 0, sequence: 1 },
        { line_id: 'l2', station_id: 'A', direction: 'outbound', branch_id: 0, sequence: 0 },
        { line_id: 'l2', station_id: 'B', direction: 'outbound', branch_id: 0, sequence: 1 },
      ],
    );
    expect(parallel.edges).toHaveLength(2);
    expect(uniqueUndirectedLinks(parallel)).toBe(1);
  });

  it('connects canonical stations that share a Naptan hub', () => {
    const hubGraph = buildGraph(
      ['A', 'B', 'C'],
      [
        { line_id: 'l1', station_id: 'A', direction: 'outbound', branch_id: 0, sequence: 0 },
        { line_id: 'l1', station_id: 'B', direction: 'outbound', branch_id: 0, sequence: 1 },
        { line_id: 'l2', station_id: 'C', direction: 'outbound', branch_id: 0, sequence: 0 },
      ],
      new Map([
        ['A', 'HUBA'],
        ['C', 'HUBA'],
      ]),
    );
    expect(uniqueTransferLinks(hubGraph)).toBe(1);
    expect(hubGraph.adjacency.get('A')).toEqual(new Set(['B', 'C']));
  });

  it('finds connected components and articulation points', () => {
    const components = connectedComponents(graph.nodes, graph.edges);
    expect(components.map((component) => component.length).sort()).toEqual([2, 4]);
    expect(articulationPoints(graph)).toEqual(new Set(['B', 'C']));
  });

  it('simulates a station closure without inventing alternatives', () => {
    const result = analyseScenario(graph, 'station_closure', 'B');
    expect(result.removedNodes).toEqual(new Set(['B']));
    expect(result.components.map((component) => component.length).sort()).toEqual([1, 2, 2]);
    expect(result.largestComponent).toHaveLength(2);
    expect(result.isolated).toEqual(['A']);
    expect(result.outsideLargest.sort()).toEqual(['A', 'E', 'F']);
    expect(result.affected).toContainEqual({ stationId: 'B', reason: 'removed' });
  });

  it('simulates a line failure by removing only that line’s links', () => {
    const result = analyseScenario(graph, 'line_failure', 'l1');
    expect(result.removedNodes.size).toBe(0);
    expect(result.removedEdges).toHaveLength(2);
    expect(result.isolated.sort()).toEqual(['A', 'B']);
    expect(result.outsideLargest.sort()).toEqual(['A', 'B', 'E', 'F']);
    expect(result.components.map((component) => component.length).sort()).toEqual([1, 1, 2, 2]);
  });
});

describe('accessibility summary', () => {
  it('counts only explicit step-free values and observed facilities', () => {
    const summary = summariseAccessibility([
      {
        lineIds: ['a', 'b'],
        zone: '1',
        stepFree: null,
        hasLifts: true,
        hasToilets: true,
        hasWifi: true,
        facilities: { Lifts: '0' },
      },
      {
        lineIds: ['a'],
        zone: null,
        stepFree: true,
        hasLifts: false,
        hasToilets: false,
        hasWifi: false,
        facilities: { Lifts: '2' },
      },
    ]);
    expect(summary).toMatchObject({
      totalStations: 2,
      withLifts: 2,
      withToilets: 1,
      withWifi: 1,
      stepFreeKnown: 1,
      stepFreeUnknown: 1,
      interchanges: 1,
      missingZone: 1,
    });
    expect(summary.note).toContain('AccessViaLift');
  });
});
