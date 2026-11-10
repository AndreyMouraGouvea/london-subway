import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  Filter,
  Layers3,
  MapPin,
  Search,
  SlidersHorizontal,
  TrainFront,
  X,
} from 'lucide-react';
import {
  MODE_LABELS,
  STATUS_BAND_COLORS,
  STATUS_BAND_LABELS,
  TFL_MODES,
  formatLondonDateTime,
  type LineSummary,
  type NetworkData,
  type StationSummary,
  type StatusBand,
  type TfLMode,
} from '@ldt/shared';
import { NetworkMap } from '../../components/map/NetworkMap';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Stat } from '../../components/ui/Stat';
import { useNetwork } from '../../hooks/useOperations';
import { useUiStore } from '../../store/uiStore';
import { LinePanel } from './LinePanel';
import { LineComparisonPanel } from './LineComparisonPanel';
import { StationPanel } from './StationPanel';

const STATUS_BANDS = ['normal', 'attention', 'severe', 'closure', 'unknown'] as const;
const ALL_BANDS = ['all', ...STATUS_BANDS] as const;

function ModeChips() {
  const selectedModes = useUiStore((state) => state.selectedModes);
  const toggleMode = useUiStore((state) => state.toggleMode);

  return (
    <div className="flex flex-wrap gap-1.5">
      {TFL_MODES.map((mode) => {
        const active = selectedModes.includes(mode);
        return (
          <button
            key={mode}
            type="button"
            onClick={() => toggleMode(mode)}
            className={`rounded-md border px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] transition ${
              active
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-white/10 bg-white/[0.04] text-slate-500 hover:text-slate-300'
            }`}
          >
            {MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {STATUS_BANDS.map((band) => (
        <span
          key={band}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-950/75 px-2.5 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-slate-400 backdrop-blur"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: STATUS_BAND_COLORS[band] }}
          />
          {STATUS_BAND_LABELS[band]}
        </span>
      ))}
    </div>
  );
}

export function CcoPage() {
  const [searchParams] = useSearchParams();
  const lineParam = searchParams.get('line');
  const linesParam = searchParams.get('lines');
  const stationParam = searchParams.get('station');
  const network = useNetwork();
  const data = network.data?.data ?? null;
  const meta = network.data?.meta ?? null;
  const dataStatus = meta?.dataSourceStatus ?? 'unconfigured';

  const selectedLineIds = useUiStore((state) => state.selectedLineIds);
  const selectedStationId = useUiStore((state) => state.selectedStationId);
  const mapColorMode = useUiStore((state) => state.mapColorMode);
  const setMapColorMode = useUiStore((state) => state.setMapColorMode);
  const filtersOpen = useUiStore((state) => state.filtersOpen);
  const setFiltersOpen = useUiStore((state) => state.setFiltersOpen);
  const selectedModes = useUiStore((state) => state.selectedModes);
  const statusBand = useUiStore((state) => state.statusBand);
  const onlyLifts = useUiStore((state) => state.onlyLifts);
  const onlyToilets = useUiStore((state) => state.onlyToilets);
  const onlyWifi = useUiStore((state) => state.onlyWifi);
  const showBoroughs = useUiStore((state) => state.showBoroughs);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const focus = useUiStore((state) => state.focus);
  const toggleLineSelection = useUiStore((state) => state.toggleLineSelection);
  const selectLine = useUiStore((state) => state.selectLine);
  const selectStation = useUiStore((state) => state.selectStation);
  const clearSelection = useUiStore((state) => state.clearSelection);
  const setStatusBand = useUiStore((state) => state.setStatusBand);
  const setOnlyLifts = useUiStore((state) => state.setOnlyLifts);
  const setOnlyToilets = useUiStore((state) => state.setOnlyToilets);
  const setOnlyWifi = useUiStore((state) => state.setOnlyWifi);
  const setShowBoroughs = useUiStore((state) => state.setShowBoroughs);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);
  const setFocus = useUiStore((state) => state.setFocus);

  // Deep links: /?line=bakerloo, /?lines=bakerloo,central ou /?station=940GZZLUOXC
  useEffect(() => {
    if (stationParam) {
      selectStation(stationParam);
      return;
    }
    const multi = linesParam
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (multi && multi.length > 0) {
      clearSelection();
      multi.forEach((lineId) => toggleLineSelection(lineId));
      return;
    }
    if (lineParam) selectLine(lineParam);
  }, [
    lineParam,
    linesParam,
    stationParam,
    clearSelection,
    selectLine,
    selectStation,
    toggleLineSelection,
  ]);

  const lines = useMemo(() => data?.lines ?? [], [data?.lines]);
  const stations = useMemo(() => data?.stations ?? [], [data?.stations]);
  const summary = data?.summary ?? null;

  const visibleLines = useMemo(
    () =>
      lines.filter((line) => {
        const mode = line.mode as TfLMode;
        if (!selectedModes.includes(mode)) return false;
        if (statusBand !== 'all' && line.status?.band !== statusBand) return false;
        return true;
      }),
    [lines, selectedModes, statusBand],
  );

  const visibleLineIds = useMemo(
    () => new Set(visibleLines.map((line) => line.id)),
    [visibleLines],
  );

  const visibleStations = useMemo(
    () =>
      stations.filter((station) => {
        if (!station.lineIds.some((lineId) => visibleLineIds.has(lineId))) return false;
        if (onlyLifts && !(station.facilities.lifts !== null && station.facilities.lifts > 0)) {
          return false;
        }
        if (onlyToilets && station.facilities.toilets !== true) return false;
        if (onlyWifi && station.facilities.wifi !== true) return false;
        return true;
      }),
    [stations, visibleLineIds, onlyLifts, onlyToilets, onlyWifi],
  );

  const visiblePaths = useMemo(
    () => (data?.paths ?? []).filter((path) => visibleLineIds.has(path.lineId)),
    [data?.paths, visibleLineIds],
  );

  const mapData: NetworkData | null = data
    ? {
        ...data,
        lines: visibleLines,
        stations: visibleStations,
        paths: visiblePaths,
      }
    : null;

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return { lines: [] as LineSummary[], stations: [] as StationSummary[] };
    return {
      lines: lines
        .filter(
          (line) =>
            line.name.toLowerCase().includes(query) ||
            line.id.toLowerCase().includes(query) ||
            line.mode.toLowerCase().includes(query),
        )
        .slice(0, 4),
      stations: stations
        .filter(
          (station) =>
            station.name.toLowerCase().includes(query) || station.id.toLowerCase().includes(query),
        )
        .slice(0, 6),
    };
  }, [lines, stations, searchQuery]);

  const selectedLines = lines.filter((line) => selectedLineIds.includes(line.id));

  function focusStation(station: StationSummary) {
    setFocus({ lon: station.lon, lat: station.lat, zoom: 15 });
  }

  function focusLine(line: LineSummary) {
    const lineStations = stations.filter((station) => station.lineIds.includes(line.id));
    if (lineStations.length === 0) return;
    const lon = lineStations.reduce((sum, station) => sum + station.lon, 0) / lineStations.length;
    const lat = lineStations.reduce((sum, station) => sum + station.lat, 0) / lineStations.length;
    setFocus({ lon, lat, zoom: 12 });
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink-950">
      <NetworkMap
        data={mapData}
        selectedLineIds={selectedLineIds}
        selectedStationId={selectedStationId}
        colorMode={mapColorMode}
        focus={focus}
        showBoroughs={showBoroughs}
        onToggleLine={toggleLineSelection}
        onSelectStation={selectStation}
        onClearSelection={clearSelection}
      />

      {!filtersOpen ? (
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="pointer-events-auto absolute left-3 top-3 z-10 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-ink-900/90 px-3 py-2 text-[0.6875rem] text-slate-200 shadow-panel backdrop-blur"
        >
          <Filter className="h-3.5 w-3.5 text-accent" />
          Filtros e resumo
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-0">
        {filtersOpen ? (
          <aside className="no-scrollbar pointer-events-auto absolute left-3 top-3 flex max-h-[calc(100dvh-88px)] w-[calc(100%-24px)] max-w-[350px] flex-col gap-3 overflow-y-auto pb-1">
            <section className="panel overflow-hidden">
              <div className="panel-header">
                <div>
                  <p className="kicker">Rede metroferroviária</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">Resumo operacional</p>
                </div>
                <div className="flex items-center gap-2">
                  <DataStateBadge status={dataStatus} ageSeconds={meta?.ageSeconds} />
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setFiltersOpen(false)}
                    aria-label="Esconder filtros"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3">
                <Stat
                  label="Linhas visíveis"
                  value={summary ? `${visibleLines.length}/${summary.linesTotal}` : '—'}
                  hint={summary ? 'filtros ativos' : 'aguarda sync'}
                />
                <Stat
                  label="Serviço normal"
                  value={summary?.normal ?? '—'}
                  hint={summary ? 'Good Service' : 'aguarda sync'}
                />
                <Stat
                  label="Com disrupção"
                  value={summary ? summary.attention + summary.severe : '—'}
                  hint={summary ? 'atenção + severa' : 'aguarda sync'}
                />
                <Stat
                  label="Fechadas"
                  value={summary?.closure ?? '—'}
                  hint={summary ? 'closure' : 'aguarda sync'}
                />
                <Stat
                  label="Estações visíveis"
                  value={mapData ? visibleStations.length : '—'}
                  hint={summary ? `de ${summary.stationsTotal}` : 'aguarda sync'}
                />
                <Stat
                  label="Alertas"
                  value={summary?.disruptionsActive ?? '—'}
                  hint={summary ? 'ativos' : 'aguarda sync'}
                />
              </div>

              <div className="space-y-3 border-t border-white/10 p-3">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-slate-400">
                    <Layers3 className="h-3.5 w-3.5" />
                    <span className="kicker">Modos</span>
                  </div>
                  <ModeChips />
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-slate-400">
                    <Activity className="h-3.5 w-3.5" />
                    <span className="kicker">Status</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_BANDS.map((band) => (
                      <button
                        key={band}
                        type="button"
                        onClick={() => setStatusBand(band === 'all' ? 'all' : (band as StatusBand))}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.08em] transition ${
                          statusBand === band
                            ? 'border-accent/30 bg-accent/10 text-accent'
                            : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {band !== 'all' ? (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                STATUS_BAND_COLORS[band as keyof typeof STATUS_BAND_COLORS],
                            }}
                          />
                        ) : null}
                        {band === 'all' ? 'Todos' : STATUS_BAND_LABELS[band as StatusBand]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-slate-400">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="kicker">Acessibilidade / facilities</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <FilterCheck label="Com lifts" checked={onlyLifts} onChange={setOnlyLifts} />
                    <FilterCheck label="Com WC" checked={onlyToilets} onChange={setOnlyToilets} />
                    <FilterCheck label="Com WiFi" checked={onlyWifi} onChange={setOnlyWifi} />
                    <FilterCheck
                      label="Boroughs (ONS)"
                      checked={showBoroughs}
                      onChange={setShowBoroughs}
                    />
                  </div>
                  <p className="mt-1.5 text-[0.625rem] leading-relaxed text-slate-600">
                    Boroughs: limites ONS 2025 (OGL). PTAL não está disponível como camada validada;
                    não é inferido.
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-slate-400">
                    <TrainFront className="h-3.5 w-3.5" />
                    <span className="kicker">Cor das linhas</span>
                  </div>
                  <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                    {(
                      [
                        ['brand', 'Oficial'],
                        ['status', 'Status'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMapColorMode(value)}
                        className={`rounded-md px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] transition ${
                          mapColorMode === value
                            ? 'bg-accent/15 text-accent'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <Search className="h-3.5 w-3.5 text-slate-500" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Buscar estação ou linha…"
                      className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="text-slate-500 hover:text-slate-300"
                        aria-label="Limpar busca"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                  {searchQuery.trim() ? (
                    <div className="mt-1 overflow-hidden rounded-lg border border-white/10 bg-ink-900/95">
                      {searchResults.lines.map((line) => (
                        <button
                          key={line.id}
                          type="button"
                          onClick={() => {
                            selectLine(line.id);
                            focusLine(line);
                            setSearchQuery('');
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[0.6875rem] text-slate-300 hover:bg-white/[0.06]"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: line.colorHex ?? '#7A879C' }}
                          />
                          <span className="min-w-0 flex-1 truncate">{line.name}</span>
                          <span className="font-mono text-[0.5625rem] text-slate-600">linha</span>
                        </button>
                      ))}
                      {searchResults.stations.map((station) => (
                        <button
                          key={station.id}
                          type="button"
                          onClick={() => {
                            selectStation(station.id);
                            focusStation(station);
                            setSearchQuery('');
                          }}
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[0.6875rem] text-slate-300 hover:bg-white/[0.06]"
                        >
                          <MapPin className="h-3 w-3 text-slate-600" />
                          <span className="min-w-0 flex-1 truncate">{station.name}</span>
                          <span className="font-mono text-[0.5625rem] text-slate-600">
                            {station.zone ?? station.id}
                          </span>
                        </button>
                      ))}
                      {searchResults.lines.length === 0 && searchResults.stations.length === 0 ? (
                        <p className="px-2.5 py-2 text-[0.625rem] text-slate-600">
                          Sem resultados.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <p className="text-[0.625rem] leading-relaxed text-slate-500">
                  Clique numa linha para destacar; Shift-clique ou clique em várias abre comparação
                  (máx. 3). Clique numa estação para ver o detalhe.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2.5">
                <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-600">
                  Última coleta
                </span>
                <span className="font-mono text-[0.625rem] text-slate-400">
                  {meta?.fetchedAt ? formatLondonDateTime(meta.fetchedAt) : '—'}
                </span>
              </div>
            </section>

            <section className="panel px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-accent" />
                <span className="kicker">Fase 3 · mapa interativo</span>
              </div>
              <p className="mt-1.5 text-[0.625rem] leading-relaxed text-slate-500">
                {data
                  ? `${visibleLines.length} linhas e ${visibleStations.length} estações visíveis. ${data.paths.length} geometrias carregadas.`
                  : 'Aguardando dados de rede. Executa /sync/reference.'}
              </p>
            </section>
          </aside>
        ) : null}

        {/* Painel de detalhes */}
        <aside
          className={`pointer-events-auto absolute inset-x-3 bottom-3 z-20 max-h-[58dvh] overflow-y-auto xl:inset-x-auto xl:right-3 xl:top-3 xl:bottom-auto xl:w-[400px] xl:max-h-[calc(100dvh-88px)] ${
            selectedStationId || selectedLineIds.length > 0 ? 'block' : 'hidden xl:block'
          }`}
        >
          {selectedStationId ? (
            <StationPanel
              stationId={selectedStationId}
              onClose={clearSelection}
              onSelectLine={selectLine}
            />
          ) : selectedLineIds.length > 1 ? (
            <LineComparisonPanel
              lines={selectedLines}
              onClose={clearSelection}
              onSelectLine={selectLine}
            />
          ) : selectedLineIds.length === 1 && selectedLineIds[0] ? (
            <LinePanel
              lineId={selectedLineIds[0]}
              onClose={clearSelection}
              onSelectStation={selectStation}
            />
          ) : (
            <section className="panel overflow-hidden">
              <EmptyState
                icon={<MapPin className="h-4 w-4" />}
                title="Nenhuma seleção ativa"
                description="Clique numa linha ou estação no mapa para abrir o painel operacional."
                compact
              />
            </section>
          )}
        </aside>

        {/* Legenda inferior */}
        <div className="pointer-events-auto absolute bottom-3 left-1/2 hidden -translate-x-1/2 md:block">
          <div className="panel px-3 py-2">
            <StatusLegend />
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.625rem] text-slate-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3 w-3 accent-[#39D0FF]"
      />
      {label}
    </label>
  );
}
