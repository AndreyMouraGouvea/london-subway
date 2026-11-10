import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl';
import { STATUS_BAND_COLORS, STATUS_BAND_LABELS, type NetworkData } from '@ldt/shared';
import { env } from '../../lib/env';
import type { MapColorMode, MapFocus } from '../../store/uiStore';

const LONDON_CENTER: [number, number] = [-0.1276, 51.5072];

// MapLibre v6 carrega o worker num ficheiro separado. Servimos uma cópia
// estática gerada por scripts/copy-maplibre-worker.mjs para evitar o wrapper
// de worker do Vite, que falhava ao carregar em dev.
const MAPLIBRE_WORKER_URL = '/maplibre-gl-worker.mjs';
setWorkerUrl(MAPLIBRE_WORKER_URL);
if (import.meta.env.DEV) console.info('[maplibre] worker URL', MAPLIBRE_WORKER_URL);

interface NetworkMapProps {
  data: NetworkData | null;
  selectedLineIds: string[];
  selectedStationId: string | null;
  colorMode: MapColorMode;
  focus: MapFocus | null;
  showBoroughs: boolean;
  onToggleLine: (lineId: string) => void;
  onSelectStation: (stationId: string) => void;
  onClearSelection: () => void;
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    // MapLibre GL JS v6 requires WebGL2.
    return Boolean(canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

interface LineProperties {
  lineId: string;
  name: string;
  mode: string;
  colorHex: string;
  statusColor: string;
  statusBand: string;
  statusDescription: string;
  stationCount: number;
  disruptionCount: number;
  updatedAt: string | null;
}

interface StationProperties {
  id: string;
  name: string;
  statusColor: string;
  statusBand: string;
  statusLabel: string;
  zone: string | null;
  lineIdsJson: string;
  interchange: number;
  facilitiesLabel: string;
}

export function NetworkMap({
  data,
  selectedLineIds,
  selectedStationId,
  colorMode,
  focus,
  showBoroughs,
  onToggleLine,
  onSelectStation,
  onClearSelection,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const showBoroughsRef = useRef(showBoroughs);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<'webgl' | 'style' | null>(null);

  const lineCollection = useMemo(() => {
    const linesById = new Map((data?.lines ?? []).map((line) => [line.id, line]));
    return {
      type: 'FeatureCollection' as const,
      features: (data?.paths ?? []).map((path) => {
        const line = linesById.get(path.lineId);
        const band = line?.status?.band ?? 'unknown';
        return {
          type: 'Feature' as const,
          id: `${path.lineId}:${path.direction}:${path.branchId}`,
          properties: {
            lineId: path.lineId,
            name: line?.name ?? path.lineId,
            mode: line?.mode ?? 'unknown',
            colorHex: line?.colorHex ?? '#7A879C',
            statusColor: STATUS_BAND_COLORS[band],
            statusBand: band,
            statusDescription: line?.status?.description ?? 'Sem informação',
            stationCount: line?.stationCount ?? 0,
            disruptionCount: line?.disruptionCount ?? 0,
            updatedAt: line?.updatedAt ?? null,
          } satisfies LineProperties,
          geometry: path.geometry,
        };
      }),
    };
  }, [data]);

  const lineCollectionRef = useRef(lineCollection);
  lineCollectionRef.current = lineCollection;

  const stationCollection = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: (data?.stations ?? []).map((station) => {
        const band = station.status?.band ?? 'unknown';
        const facilities = [
          station.facilities.lifts !== null ? `${station.facilities.lifts} lifts` : null,
          station.facilities.toilets === true ? 'WC' : null,
          station.facilities.wifi === true ? 'WiFi' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          type: 'Feature' as const,
          id: station.id,
          properties: {
            id: station.id,
            name: station.name,
            statusColor: STATUS_BAND_COLORS[band],
            statusBand: band,
            statusLabel: statusLabel(station.status?.label, band),
            zone: station.zone,
            lineIdsJson: JSON.stringify(station.lineIds),
            interchange: station.lineIds.length,
            facilitiesLabel: facilities,
          } satisfies StationProperties,
          geometry: {
            type: 'Point' as const,
            coordinates: [station.lon, station.lat],
          },
        };
      }),
    };
  }, [data]);

  const stationCollectionRef = useRef(stationCollection);
  stationCollectionRef.current = stationCollection;

  // Inicialização do mapa
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!supportsWebGL()) {
      setFailure('webgl');
      return;
    }

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: env.mapStyleUrl,
        center: LONDON_CENTER,
        zoom: 10.4,
        minZoom: 8,
        maxZoom: 18,
        pitchWithRotate: false,
        dragRotate: false,
        attributionControl: false,
      });
    } catch {
      setFailure('webgl');
      return;
    }

    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __ldtMap?: MapLibreMap }).__ldtMap = map;
    }
    popupRef.current = new Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    let styleSettled = false;
    const readyTimer = window.setTimeout(() => {
      if (!styleSettled) setFailure((current) => current ?? 'style');
    }, 15_000);

    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: 'Boundaries © ONS, OGL v3.0',
      }),
      'bottom-right',
    );
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.once('idle', () => {
      styleSettled = true;
      window.clearTimeout(readyTimer);
      setFailure(null);
      setReady(true);
      if (import.meta.env.DEV) console.info('[maplibre] idle: mapa pronto');
    });

    map.on('style.load', () => {
      styleSettled = true;
      window.clearTimeout(readyTimer);
      setFailure(null);
      setReady(true);
      if (import.meta.env.DEV) console.info('[maplibre] style.load');
      if (!map.getSource('boroughs')) {
        map.addSource('boroughs', {
          type: 'geojson',
          data: '/london-boroughs.geojson',
        });
        map.addLayer({
          id: 'borough-fill',
          type: 'fill',
          source: 'boroughs',
          layout: {
            visibility: showBoroughsRef.current ? 'visible' : 'none',
          },
          paint: {
            'fill-color': '#39D0FF',
            'fill-opacity': 0.035,
          },
        });
        map.addLayer({
          id: 'borough-line',
          type: 'line',
          source: 'boroughs',
          layout: {
            visibility: showBoroughsRef.current ? 'visible' : 'none',
          },
          paint: {
            'line-color': '#39D0FF',
            'line-opacity': 0.28,
            'line-width': 1,
          },
        });
      }
      if (map.getSource('network-lines')) return;
      map.addSource('network-lines', {
        type: 'geojson',
        data: lineCollectionRef.current as never,
        promoteId: 'id',
      });
      map.addLayer({
        id: 'network-lines-halo',
        type: 'line',
        source: 'network-lines',
        paint: {
          'line-color': '#05080D',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 10],
          'line-opacity': 0.8,
        },
      });
      map.addLayer({
        id: 'network-lines',
        type: 'line',
        source: 'network-lines',
        paint: {
          'line-color': ['get', 'colorHex'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.8, 14, 5.5],
          'line-opacity': 0.92,
        },
      });
      map.addLayer({
        id: 'network-lines-hit',
        type: 'line',
        source: 'network-lines',
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 18,
          'line-opacity': 0.01,
        },
      });

      map.addSource('network-stations', {
        type: 'geojson',
        data: stationCollectionRef.current as never,
        promoteId: 'id',
      });
      map.addLayer({
        id: 'network-stations',
        type: 'circle',
        source: 'network-stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.4, 12, 4, 15, 6],
          'circle-color': '#0B111B',
          'circle-stroke-color': ['get', 'statusColor'],
          'circle-stroke-width': 1.6,
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'network-stations-hit',
        type: 'circle',
        source: 'network-stations',
        paint: {
          'circle-radius': 12,
          'circle-color': '#FFFFFF',
          'circle-opacity': 0.01,
        },
      });
      map.addLayer({
        id: 'network-stations-selected',
        type: 'circle',
        source: 'network-stations',
        filter: ['==', ['get', 'id'], selectedStationId ?? '__none__'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 6, 13, 11],
          'circle-color': '#39D0FF',
          'circle-opacity': 0.25,
          'circle-stroke-color': '#39D0FF',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'network-stations-labels',
        type: 'symbol',
        source: 'network-stations',
        minzoom: 12.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#E2E8F0',
          'text-halo-color': '#070B12',
          'text-halo-width': 1.5,
        },
      });

      applyLineSelection();
      applyColorMode();
      if (import.meta.env.DEV) console.info('[maplibre] layers instaladas');
    });

    function applyLineSelection() {
      const opacity: unknown =
        selectedLineIds.length === 0
          ? 0.92
          : ['case', ['in', ['get', 'lineId'], ['literal', selectedLineIds]], 1, 0.12];
      if (map.getLayer('network-lines')) {
        map.setPaintProperty('network-lines', 'line-opacity', opacity as never);
      }
    }

    function applyColorMode() {
      if (!map.getLayer('network-lines')) return;
      map.setPaintProperty(
        'network-lines',
        'line-color',
        (colorMode === 'status' ? ['get', 'statusColor'] : ['get', 'colorHex']) as never,
      );
    }

    map.on('click', (event) => {
      const stations = map.queryRenderedFeatures(event.point, {
        layers: ['network-stations-hit'],
      });
      if (stations.length > 0) {
        const stationId = String(stations[0]?.properties?.id ?? '');
        if (stationId) onSelectStation(stationId);
        return;
      }

      const lines = map.queryRenderedFeatures(event.point, {
        layers: ['network-lines-hit'],
      });
      if (lines.length > 0) {
        const lineId = String(lines[0]?.properties?.lineId ?? '');
        if (lineId) onToggleLine(lineId);
        return;
      }

      onClearSelection();
    });

    map.on('mousemove', (event) => {
      const stations = map.queryRenderedFeatures(event.point, {
        layers: ['network-stations-hit'],
      });
      const lines = map.queryRenderedFeatures(event.point, {
        layers: ['network-lines-hit'],
      });
      map.getCanvas().style.cursor = stations.length || lines.length ? 'pointer' : '';

      const popup = popupRef.current;
      if (!popup) return;

      if (stations.length > 0) {
        const properties = stations[0]?.properties as StationProperties | undefined;
        if (!properties) return;
        popup
          .setLngLat(event.lngLat)
          .setHTML(
            `<div style="font-size:11px;line-height:1.5">
              <strong>${escapeHtml(properties.name)}</strong><br/>
              ${escapeHtml(properties.statusLabel)}${properties.zone ? ` · zona ${escapeHtml(properties.zone)}` : ''}
              ${properties.facilitiesLabel ? `<br/><span style="color:#94A3B8">${escapeHtml(properties.facilitiesLabel)}</span>` : ''}
            </div>`,
          )
          .addTo(map);
        return;
      }

      if (lines.length > 0) {
        const properties = lines[0]?.properties as LineProperties | undefined;
        if (!properties) return;
        popup
          .setLngLat(event.lngLat)
          .setHTML(
            `<div style="font-size:11px;line-height:1.5">
              <strong>${escapeHtml(properties.name)}</strong><br/>
              ${escapeHtml(properties.statusDescription)}
              <br/><span style="color:#94A3B8">${escapeHtml(
                STATUS_BAND_LABELS[properties.statusBand as keyof typeof STATUS_BAND_LABELS] ??
                  properties.statusBand,
              )} · ${properties.stationCount} estações</span>
            </div>`,
          )
          .addTo(map);
        return;
      }

      popup.remove();
    });

    map.on('mouseout', () => {
      map.getCanvas().style.cursor = '';
      popupRef.current?.remove();
    });

    map.on('error', (event) => {
      const message = event.error?.message ?? String(event.error ?? 'erro desconhecido');
      if (import.meta.env.DEV) console.warn('[maplibre]', message);
      if (message.toLowerCase().includes('style')) setFailure('style');
    });

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      window.clearTimeout(readyTimer);
      observer.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // A inicialização corre uma vez; as atualizações são tratadas por efeitos próprios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visibilidade da camada de boroughs sem recriar o mapa.
  useEffect(() => {
    showBoroughsRef.current = showBoroughs;
    const map = mapRef.current;
    if (!map) return;
    for (const layerId of ['borough-fill', 'borough-line']) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', showBoroughs ? 'visible' : 'none');
      }
    }
  }, [showBoroughs]);

  // Atualiza os dados sem recriar o mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const lineSource = map.getSource('network-lines') as
      { setData: (data: unknown) => void } | undefined;
    const stationSource = map.getSource('network-stations') as
      { setData: (data: unknown) => void } | undefined;
    lineSource?.setData(lineCollection);
    stationSource?.setData(stationCollection);
  }, [lineCollection, stationCollection]);

  // Atualiza seleção e modo de cor
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('network-lines')) return;
    const opacity: unknown =
      selectedLineIds.length === 0
        ? 0.92
        : ['case', ['in', ['get', 'lineId'], ['literal', selectedLineIds]], 1, 0.12];
    map.setPaintProperty('network-lines', 'line-opacity', opacity as never);
    map.setPaintProperty(
      'network-lines',
      'line-color',
      (colorMode === 'status' ? ['get', 'statusColor'] : ['get', 'colorHex']) as never,
    );
    if (map.getLayer('network-stations-selected')) {
      map.setFilter('network-stations-selected', [
        '==',
        ['get', 'id'],
        selectedStationId ?? '__none__',
      ]);
    }
  }, [selectedLineIds, selectedStationId, colorMode]);

  // FlyTo para resultados de busca
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({
      center: [focus.lon, focus.lat],
      zoom: focus.zoom ?? 14,
      essential: true,
    });
  }, [focus]);

  return (
    <div className="relative h-full w-full bg-ink-950 bg-grid">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Mapa interativo da rede metroferroviária de Londres"
      />
      {!ready && !failure ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/35">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-ink-950/80 px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-slate-400 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulseSoft rounded-full bg-accent" />A carregar mapa
          </div>
        </div>
      ) : null}
      {failure ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-950/60">
          <div className="panel max-w-sm px-5 py-4 text-center">
            <p className="text-sm font-medium text-slate-200">
              {failure === 'webgl' ? 'WebGL2 indisponível' : 'Basemap indisponível'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {failure === 'webgl'
                ? 'Este navegador não conseguiu inicializar o WebGL2. Ative a aceleração de hardware ou use um navegador compatível.'
                : 'O mapa base não carregou. Verifique a rede, a aceleração de hardware/WebGL ou a variável VITE_MAP_STYLE_URL.'}
            </p>
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-ink-950/70 px-3 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.16em] text-slate-500 backdrop-blur">
        Basemap OpenFreeMap · © OpenStreetMap contributors
        {data ? ` · ${data.stations.length} estações` : ''}
      </div>
    </div>
  );
}

function statusLabel(label: string | undefined, band: string): string {
  if (label) return label;
  return STATUS_BAND_LABELS[band as keyof typeof STATUS_BAND_LABELS] ?? 'Sem informação';
}
