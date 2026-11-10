import { useMemo, useState } from 'react';
import { Database, Download, FileJson2, Filter, Search, Table2, TrainFront } from 'lucide-react';
import {
  LINE_BRANDING,
  LINE_BRANDING_BY_ID,
  MODE_LABELS,
  STATUS_BAND_COLORS,
  formatLondonDateTime,
  type LineSummary,
  type StationSummary,
  type TfLMode,
} from '@ldt/shared';
import { Badge } from '../../components/ui/Badge';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useLines, useStations } from '../../hooks/useOperations';
import { downloadTextFile, toCsv } from '../../lib/download';

type Tab = 'lines' | 'stations';

const MODE_FILTERS: TfLMode[] = ['tube', 'overground', 'dlr', 'elizabeth-line', 'tram'];

interface LineTableRow {
  id: string;
  name: string;
  mode: string;
  colorHex: string | null;
  textColorHex: string | null;
  status: string;
  band: keyof typeof STATUS_BAND_COLORS;
  stationCount: number | null;
  disruptionCount: number | null;
}

export function ExplorerPage() {
  const [tab, setTab] = useState<Tab>('lines');
  const [query, setQuery] = useState('');
  const linesQuery = useLines();
  const stationsQuery = useStations();
  const apiLines = linesQuery.data?.data ?? null;
  const apiStations = stationsQuery.data?.data ?? null;
  const dataStatus =
    linesQuery.data?.meta.dataSourceStatus ??
    stationsQuery.data?.meta.dataSourceStatus ??
    'unconfigured';

  const exportedAt = new Date().toISOString();

  const lineRows: LineTableRow[] = useMemo(() => {
    if (apiLines && apiLines.length > 0) {
      return apiLines.map((line: LineSummary) => ({
        id: line.id,
        name: line.name,
        mode: line.mode,
        colorHex: line.colorHex,
        textColorHex: line.textColorHex,
        status: line.status?.description ?? 'Sem status',
        band: line.status?.band ?? 'unknown',
        stationCount: line.stationCount,
        disruptionCount: line.disruptionCount,
      }));
    }
    return LINE_BRANDING.map((line) => ({
      id: line.id,
      name: line.name,
      mode: line.mode,
      colorHex: line.colorHex,
      textColorHex: line.textColorHex,
      status: 'Sem status sincronizado',
      band: 'unknown',
      stationCount: null,
      disruptionCount: null,
    }));
  }, [apiLines]);

  const filteredLines = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return lineRows;
    return lineRows.filter(
      (line) =>
        line.name.toLowerCase().includes(normalized) ||
        line.id.toLowerCase().includes(normalized) ||
        line.mode.toLowerCase().includes(normalized),
    );
  }, [lineRows, query]);

  const filteredStations = useMemo(() => {
    const stations = apiStations ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return stations;
    return stations.filter(
      (station) =>
        station.name.toLowerCase().includes(normalized) ||
        station.id.toLowerCase().includes(normalized) ||
        station.lineIds.some((lineId) => lineId.toLowerCase().includes(normalized)),
    );
  }, [apiStations, query]);

  function exportCsv() {
    if (tab === 'lines') {
      const rows = filteredLines.map((line) => ({
        id: line.id,
        name: line.name,
        mode: line.mode,
        color_hex: line.colorHex,
        text_color_hex: line.textColorHex,
        status: line.status,
        band: line.band,
        station_count: line.stationCount,
        disruption_count: line.disruptionCount,
        exported_at: exportedAt,
      }));
      downloadTextFile(
        `london-lines-${exportedAt.slice(0, 10)}.csv`,
        toCsv(rows, [
          'id',
          'name',
          'mode',
          'color_hex',
          'text_color_hex',
          'status',
          'band',
          'station_count',
          'disruption_count',
          'exported_at',
        ]),
      );
      return;
    }

    const rows = filteredStations.map((station) => ({
      id: station.id,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      zone: station.zone,
      modes: station.modes.join('|'),
      line_ids: station.lineIds.join('|'),
      status_band: station.status?.band ?? '',
      step_free: station.stepFree,
      lifts: station.facilities.lifts,
      toilets: station.facilities.toilets,
      wifi: station.facilities.wifi,
      exported_at: exportedAt,
    }));
    downloadTextFile(
      `london-stations-${exportedAt.slice(0, 10)}.csv`,
      toCsv(rows, [
        'id',
        'name',
        'lat',
        'lon',
        'zone',
        'modes',
        'line_ids',
        'status_band',
        'step_free',
        'lifts',
        'toilets',
        'wifi',
        'exported_at',
      ]),
    );
  }

  function exportStationsGeoJson() {
    const featureCollection = {
      type: 'FeatureCollection',
      metadata: {
        source: 'TfL Unified API + TfL Open Data',
        exportedAt,
        coordinateSystem: 'EPSG:4326',
        dataQuality: 'reported',
      },
      features: filteredStations.map((station: StationSummary) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
        properties: {
          id: station.id,
          name: station.name,
          zone: station.zone,
          modes: station.modes,
          line_ids: station.lineIds,
          status_band: station.status?.band ?? null,
          step_free: station.stepFree,
          step_free_source: station.stepFreeSource,
          lifts: station.facilities.lifts,
          toilets: station.facilities.toilets,
          wifi: station.facilities.wifi,
          parking: station.facilities.parking,
        },
      })),
    };
    downloadTextFile(
      `london-stations-${exportedAt.slice(0, 10)}.geojson`,
      JSON.stringify(featureCollection, null, 2),
      'application/geo+json;charset=utf-8',
    );
  }

  const count = tab === 'lines' ? filteredLines.length : filteredStations.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Catálogo e exportações</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
              Exploração de dados
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Tabelas filtráveis de linhas e estações a partir dos endpoints normalizados. As
              exportações incluem o estado de frescura e a origem dos dados.
            </p>
          </div>
          <DataStateBadge
            status={dataStatus}
            ageSeconds={linesQuery.data?.meta.ageSeconds ?? null}
          />
        </div>

        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {(
                [
                  ['lines', 'Linhas', Table2],
                  ['stations', 'Estações', Database],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.6875rem] transition ${
                    tab === value
                      ? 'bg-accent/15 text-accent'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={tab === 'lines' ? 'Filtrar linhas…' : 'Filtrar estações…'}
                  className="w-40 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
                  aria-label="Filtrar dados"
                />
              </div>
              <button
                type="button"
                onClick={exportCsv}
                disabled={count === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-[0.6875rem] text-accent transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                type="button"
                onClick={exportStationsGeoJson}
                disabled={tab !== 'stations' || filteredStations.length === 0}
                title="GeoJSON de estações com coordenadas EPSG:4326"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[0.6875rem] text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileJson2 className="h-3.5 w-3.5" />
                GeoJSON
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <Filter className="h-3.5 w-3.5 text-slate-600" />
            {MODE_FILTERS.map((mode) => (
              <span
                key={mode}
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-slate-500"
              >
                {MODE_LABELS[mode]}
              </span>
            ))}
            <span className="ml-auto font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-600">
              {count} registos
            </span>
          </div>

          {tab === 'lines' ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="border-b border-white/10 bg-white/[0.02] font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Linha</th>
                    <th className="px-4 py-2.5 font-medium">ID TfL</th>
                    <th className="px-4 py-2.5 font-medium">Modo</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Estações</th>
                    <th className="px-4 py-2.5 text-right font-medium">Disrupções</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLines.map((line) => (
                    <tr
                      key={line.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: line.colorHex ?? '#7A879C' }}
                          />
                          <span className="font-medium text-slate-200">{line.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[0.625rem] text-slate-500">
                        {line.id}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {MODE_LABELS[line.mode as TfLMode] ?? line.mode}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.08em]"
                          style={{ color: STATUS_BAND_COLORS[line.band] }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: STATUS_BAND_COLORS[line.band] }}
                          />
                          {line.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[0.625rem] text-slate-400">
                        {line.stationCount ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[0.625rem] text-slate-400">
                        {line.disruptionCount ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : filteredStations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="border-b border-white/10 bg-white/[0.02] font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Estação</th>
                    <th className="px-4 py-2.5 font-medium">ID</th>
                    <th className="px-4 py-2.5 font-medium">Zona</th>
                    <th className="px-4 py-2.5 font-medium">Linhas</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Step-free</th>
                    <th className="px-4 py-2.5 text-right font-medium">Lifts</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStations.map((station) => (
                    <tr
                      key={station.id}
                      className="border-b border-white/5 last:border-0 hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-200">{station.name}</td>
                      <td className="px-4 py-2.5 font-mono text-[0.625rem] text-slate-500">
                        {station.id}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{station.zone ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {station.lineIds.slice(0, 5).map((lineId) => {
                            const branding = LINE_BRANDING_BY_ID[lineId];
                            return (
                              <span
                                key={lineId}
                                className="h-2 w-2 rounded-full"
                                title={branding?.name ?? lineId}
                                style={{ backgroundColor: branding?.colorHex ?? '#7A879C' }}
                              />
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[0.625rem] text-slate-400">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                STATUS_BAND_COLORS[station.status?.band ?? 'unknown'],
                            }}
                          />
                          {station.status?.label ?? 'Sem informação'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={station.stepFree === true ? 'success' : 'neutral'}>
                          {station.stepFree === true
                            ? 'sim'
                            : station.stepFree === false
                              ? 'não'
                              : 'não informado'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[0.625rem] text-slate-400">
                        {station.facilities.lifts ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<Database className="h-4 w-4" />}
              title={stationsQuery.isLoading ? 'A carregar estações' : 'Estações não disponíveis'}
              description="Executa /sync/reference para popular estações, facilities e coordenadas."
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[0.625rem] text-slate-600">
          <span>
            Dados operacionais via API própria. Status de estação é derivado das linhas servidas.
          </span>
          <span className="font-mono">
            <TrainFront className="mr-1 inline h-3 w-3" />
            exportado em {formatLondonDateTime(exportedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
