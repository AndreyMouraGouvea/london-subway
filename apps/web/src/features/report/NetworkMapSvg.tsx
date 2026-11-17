import { useMemo } from 'react';
import type { LinePathData, LineSummary, NetworkData, StationSummary } from '@ldt/shared';

type Coordinate = [number, number];

interface MapPath {
  id: string;
  lineId: string;
  color: string;
  d: string;
  focused: boolean;
}

interface MapStation {
  id: string;
  x: number;
  y: number;
  focused: boolean;
  interchange: boolean;
}

interface MapLabel {
  id: string;
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'end';
}

interface MapModel {
  paths: MapPath[];
  stations: MapStation[];
  labels: MapLabel[];
  width: number;
  height: number;
}

const CONTEXT_COLOR = '#D5DCE5';
const FALLBACK_COLOR = '#7A879C';
const PAPER = '#F7F9FC';

function mercator(lat: number): number {
  const radians = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function geometryLines(path: LinePathData): number[][][] {
  return path.geometry.type === 'LineString'
    ? [path.geometry.coordinates]
    : path.geometry.coordinates;
}

function buildLabels(
  candidates: StationSummary[],
  project: (station: StationSummary) => Coordinate,
  width: number,
  height: number,
  limit: number,
  fontSize: number,
): MapLabel[] {
  const placed: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const anchors: Array<{ x: number; y: number }> = [];
  const labels: MapLabel[] = [];
  for (const station of candidates) {
    if (labels.length >= limit) break;
    const [x, y] = project(station);
    if (x < 6 || x > width - 6 || y < fontSize || y > height - 6) continue;
    if (anchors.some((anchor) => Math.hypot(anchor.x - x, anchor.y - y) < fontSize * 3.5)) {
      continue;
    }
    const textWidth = station.name.length * fontSize * 0.54 + 4;
    for (const anchor of ['start', 'end'] as const) {
      const left = anchor === 'start' ? x + 5 : x - 5 - textWidth;
      const box = { x1: left, y1: y - fontSize, x2: left + textWidth, y2: y + 3 };
      if (box.x1 < 2 || box.x2 > width - 2) continue;
      const overlaps = placed.some(
        (item) => box.x1 < item.x2 && box.x2 > item.x1 && box.y1 < item.y2 && box.y2 > item.y1,
      );
      if (overlaps) continue;
      placed.push(box);
      anchors.push({ x, y });
      labels.push({ id: station.id, x, y, text: station.name, anchor });
      break;
    }
  }
  return labels;
}

function buildModel(
  data: NetworkData,
  focusLineId: string | null,
  labelCount: number,
  width: number,
  height: number,
): MapModel {
  const colorById = new Map(
    data.lines.map((line: LineSummary) => [line.id, line.colorHex ?? FALLBACK_COLOR]),
  );
  const focusedPaths = focusLineId
    ? data.paths.filter((path) => path.lineId === focusLineId)
    : data.paths;
  const boundsPaths = focusedPaths.length > 0 ? focusedPaths : data.paths;

  const projected = new Map<string, Coordinate[][]>();
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const path of boundsPaths) {
    const segments: Coordinate[][] = [];
    for (const segment of geometryLines(path)) {
      const points: Coordinate[] = [];
      for (const point of segment) {
        const lon = point[0];
        const lat = point[1];
        if (typeof lon !== 'number' || typeof lat !== 'number') continue;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const x = (lon * Math.PI) / 180;
        const y = mercator(lat);
        points.push([x, y]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (points.length > 1) segments.push(points);
    }
    projected.set(
      path.lineId + '|' + String(path.direction) + '|' + String(path.branchId),
      segments,
    );
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = 0;
    maxX = 1;
    minY = 0;
    maxY = 1;
  }

  const padding = 16;
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 + maxY * scale;

  const project = (lon: number, lat: number): Coordinate => {
    const x = (lon * Math.PI) / 180;
    const y = mercator(lat);
    return [x * scale + offsetX, offsetY - y * scale];
  };

  const paths: MapPath[] = [];
  for (const path of data.paths) {
    const segments = projected.get(
      path.lineId + '|' + String(path.direction) + '|' + String(path.branchId),
    );
    if (!segments) continue;
    let lastX = Number.POSITIVE_INFINITY;
    let lastY = Number.POSITIVE_INFINITY;
    const parts: string[] = [];
    for (const segment of segments) {
      segment.forEach((point, index) => {
        const x = point[0];
        const y = point[1];
        if (typeof x !== 'number' || typeof y !== 'number') return;
        const px = x * scale + offsetX;
        const py = offsetY - y * scale;
        if (index > 0 && Math.abs(px - lastX) + Math.abs(py - lastY) < 0.6) return;
        parts.push(
          `${parts.length === 0 || index === 0 ? 'M' : 'L'}${px.toFixed(1)} ${py.toFixed(1)}`,
        );
        lastX = px;
        lastY = py;
      });
    }
    if (parts.length === 0) continue;
    paths.push({
      id: `${path.lineId}-${path.direction}-${path.branchId}`,
      lineId: path.lineId,
      color: colorById.get(path.lineId) ?? FALLBACK_COLOR,
      d: parts.join(' '),
      focused: Boolean(focusLineId && path.lineId === focusLineId),
    });
  }

  const focusStations = focusLineId
    ? data.stations.filter((station) => station.lineIds.includes(focusLineId))
    : data.stations;
  const stationModels: MapStation[] = focusStations.map((station) => {
    const [x, y] = project(station.lon, station.lat);
    return {
      id: station.id,
      x,
      y,
      focused: Boolean(focusLineId),
      interchange: station.lineIds.length > 1,
    };
  });

  const labelCandidates = [...focusStations]
    .filter((station) => !focusLineId || station.lineIds.length > 1)
    .sort(
      (left, right) =>
        right.lineIds.length - left.lineIds.length || left.name.localeCompare(right.name),
    );
  const labelFontSize = focusLineId ? 20 : 16;
  const labels = buildLabels(
    labelCandidates,
    (station) => project(station.lon, station.lat),
    width,
    height,
    labelCount,
    labelFontSize,
  );

  return { paths, stations: stationModels, labels, width, height };
}

export function NetworkMapSvg({
  data,
  focusLineId = null,
  labelCount = 8,
  viewBoxWidth = 1000,
  viewBoxHeight = 700,
  className,
}: {
  data: NetworkData;
  focusLineId?: string | null;
  labelCount?: number;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  className?: string;
}) {
  const model = useMemo(
    () => buildModel(data, focusLineId, labelCount, viewBoxWidth, viewBoxHeight),
    [data, focusLineId, labelCount, viewBoxWidth, viewBoxHeight],
  );

  if (model.paths.length === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-[#F7F9FC] text-xs text-slate-500 ${className ?? ''}`}
      >
        Sem geometrias disponíveis.
      </div>
    );
  }

  return (
    <svg
      data-report-map={focusLineId ?? 'network'}
      viewBox={`0 0 ${model.width} ${model.height}`}
      className={className}
      role="img"
      aria-label={focusLineId ? `Mapa da linha ${focusLineId}` : 'Mapa da rede'}
    >
      <rect width={model.width} height={model.height} fill={PAPER} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {model.paths
          .filter((path) => !path.focused)
          .map((path) => (
            <path
              key={path.id}
              d={path.d}
              stroke={focusLineId ? CONTEXT_COLOR : path.color}
              strokeWidth={focusLineId ? 1.6 : 2.4}
              opacity={focusLineId ? 0.75 : 0.9}
            />
          ))}
        {model.paths
          .filter((path) => path.focused)
          .map((path) => (
            <path key={path.id} d={path.d} stroke={path.color} strokeWidth={4} />
          ))}
      </g>
      <g>
        {model.stations.map((station) => (
          <circle
            key={station.id}
            cx={station.x}
            cy={station.y}
            r={
              station.focused ? (station.interchange ? 3.4 : 2.4) : station.interchange ? 2.2 : 1.5
            }
            fill={station.focused ? '#14202E' : '#FFFFFF'}
            stroke={station.focused ? '#FFFFFF' : '#8A99AB'}
            strokeWidth={station.focused ? 1.4 : 0.9}
          />
        ))}
      </g>
      <g fontFamily="Inter, Segoe UI, sans-serif" fontSize={focusLineId ? 20 : 16} fill="#243447">
        {model.labels.map((label) => (
          <text
            key={label.id}
            x={label.x + (label.anchor === 'start' ? 5 : -5)}
            y={label.y + 5}
            textAnchor={label.anchor}
            paintOrder="stroke"
            stroke={PAPER}
            strokeWidth={4}
            strokeLinejoin="round"
          >
            {label.text}
          </text>
        ))}
      </g>
    </svg>
  );
}
