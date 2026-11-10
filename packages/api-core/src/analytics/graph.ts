/**
 * Algoritmos do grafo estação–segmento.
 *
 * O grafo é construído a partir da ordem real de `line_stations` (outbound).
 * Como as arestas são não orientadas, a conectividade é válida nos dois
 * sentidos. Não são usados tempos de viagem inventados nem frequências.
 */

export interface OrderedStationRow {
  line_id: string;
  station_id: string;
  direction: string;
  branch_id: number;
  sequence: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** `null` em transferências entre estações do mesmo hub. */
  lineId: string | null;
  kind: 'segment' | 'transfer';
}

export interface StationGraph {
  nodes: string[];
  edges: GraphEdge[];
  adjacency: Map<string, Set<string>>;
}

export type ScenarioType = 'station_closure' | 'line_failure';

export interface ScenarioResult {
  removedNodes: Set<string>;
  removedEdges: GraphEdge[];
  components: string[][];
  largestComponent: string[];
  isolated: string[];
  outsideLargest: string[];
  affected: Array<{ stationId: string; reason: 'removed' | 'isolated' | 'outside_largest' }>;
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.from}|${edge.to}|${edge.lineId}`;
}

export function buildGraph(
  nodeIds: readonly string[],
  rows: readonly OrderedStationRow[],
  hubByStation: ReadonlyMap<string, string> = new Map(),
): StationGraph {
  const nodes = new Set(nodeIds);
  const groups = new Map<string, OrderedStationRow[]>();

  for (const row of rows) {
    if (!nodes.has(row.station_id)) continue;
    const key = `${row.line_id}|${row.direction}|${row.branch_id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const edges: GraphEdge[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
    for (let index = 0; index < list.length - 1; index += 1) {
      const from = list[index]!.station_id;
      const to = list[index + 1]!.station_id;
      if (from === to) continue;
      edges.push({ from, to, lineId: list[index]!.line_id, kind: 'segment' });
    }
  }

  // Transferências dentro do mesmo hub Naptan: ligam entradas canónicas
  // separadas (ex.: Paddington Tube/NR, Bank Tube/DLR). Não são segmentos
  // físicos e não têm tempo de viagem associado.
  const byHub = new Map<string, string[]>();
  for (const node of nodes) {
    const hub = hubByStation.get(node);
    if (!hub) continue;
    const list = byHub.get(hub) ?? [];
    list.push(node);
    byHub.set(hub, list);
  }
  const transferPairs = new Set<string>();
  for (const list of byHub.values()) {
    if (list.length < 2) continue;
    for (let index = 0; index < list.length; index += 1) {
      for (let other = index + 1; other < list.length; other += 1) {
        const from = list[index]!;
        const to = list[other]!;
        const pair = from < to ? `${from}|${to}` : `${to}|${from}`;
        if (transferPairs.has(pair)) continue;
        transferPairs.add(pair);
        edges.push({ from, to, lineId: null, kind: 'transfer' });
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node, new Set());
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  return { nodes: [...nodes], edges, adjacency };
}

export function uniqueUndirectedLinks(graph: StationGraph): number {
  const pairs = new Set<string>();
  for (const edge of graph.edges) {
    const [a, b] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from];
    pairs.add(`${a}|${b}`);
  }
  return pairs.size;
}

/** Pares de transferência dentro do mesmo hub (não são segmentos físicos). */
export function uniqueTransferLinks(graph: StationGraph): number {
  const pairs = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'transfer') continue;
    const [a, b] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from];
    pairs.add(`${a}|${b}`);
  }
  return pairs.size;
}

/** Componentes ligados; nós isolados contam como componentes de tamanho 1. */
export function connectedComponents(
  nodes: readonly string[],
  edges: readonly GraphEdge[],
): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node, new Set());
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue;
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const start of nodes) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const node = stack.pop()!;
      component.push(node);
      for (const neighbour of adjacency.get(node) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          stack.push(neighbour);
        }
      }
    }
    components.push(component);
  }
  return components;
}

/** Articulações (Tarjan): estações cuja remoção aumenta o número de componentes. */
export function articulationPoints(graph: StationGraph): Set<string> {
  const discovery = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string>();
  const visited = new Set<string>();
  const result = new Set<string>();
  let time = 0;

  const visit = (node: string) => {
    visited.add(node);
    discovery.set(node, time);
    low.set(node, time);
    time += 1;
    let children = 0;

    for (const neighbour of graph.adjacency.get(node) ?? []) {
      if (!visited.has(neighbour)) {
        parent.set(neighbour, node);
        children += 1;
        visit(neighbour);
        low.set(node, Math.min(low.get(node)!, low.get(neighbour)!));
        if (!parent.has(node) && children > 1) result.add(node);
        if (parent.has(node) && low.get(neighbour)! >= discovery.get(node)!) result.add(node);
      } else if (neighbour !== parent.get(node)) {
        low.set(node, Math.min(low.get(node)!, discovery.get(neighbour)!));
      }
    }
  };

  for (const node of graph.nodes) {
    if (!visited.has(node)) visit(node);
  }
  return result;
}

export function analyseScenario(
  graph: StationGraph,
  type: ScenarioType,
  id: string,
): ScenarioResult {
  const removedNodes = new Set<string>(type === 'station_closure' ? [id] : []);
  const removedEdges = graph.edges.filter((edge) =>
    type === 'station_closure' ? edge.from === id || edge.to === id : edge.lineId === id,
  );
  const removedEdgeKeys = new Set(removedEdges.map(edgeKey));

  const remainingNodes = graph.nodes.filter((node) => !removedNodes.has(node));
  const remainingEdges = graph.edges.filter(
    (edge) =>
      !removedNodes.has(edge.from) &&
      !removedNodes.has(edge.to) &&
      !removedEdgeKeys.has(edgeKey(edge)),
  );

  const components = connectedComponents(remainingNodes, remainingEdges);
  const largestComponent = components.reduce<string[]>(
    (largest, component) => (component.length > largest.length ? component : largest),
    [],
  );
  const largestSet = new Set(largestComponent);
  const outsideLargest = remainingNodes.filter((node) => !largestSet.has(node));

  const adjacency = new Map<string, Set<string>>();
  for (const node of remainingNodes) adjacency.set(node, new Set());
  for (const edge of remainingEdges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }
  const isolated = remainingNodes.filter((node) => (adjacency.get(node)?.size ?? 0) === 0);

  const affected: ScenarioResult['affected'] = [];
  for (const node of removedNodes) affected.push({ stationId: node, reason: 'removed' });
  for (const node of isolated) affected.push({ stationId: node, reason: 'isolated' });
  for (const node of outsideLargest) {
    if (!isolated.includes(node)) affected.push({ stationId: node, reason: 'outside_largest' });
  }

  return {
    removedNodes,
    removedEdges,
    components,
    largestComponent,
    isolated,
    outsideLargest,
    affected,
  };
}
