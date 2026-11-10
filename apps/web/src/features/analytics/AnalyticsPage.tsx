import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CircleHelp,
  GitFork,
  Route,
  ShieldAlert,
  Users,
  Waypoints,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LINE_BRANDING_BY_ID, formatAge, type ScenarioType } from '@ldt/shared';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Stat } from '../../components/ui/Stat';
import {
  useAnalyticsNetwork,
  useAnalyticsScenario,
  useAnnualSummary,
  useFootfallSummary,
  useLineBoardings,
  useLines,
  useRodsStation,
  useStationCrowding,
  useStationFootfall,
  useStations,
} from '../../hooks/useOperations';

const compactNumber = new Intl.NumberFormat('pt-PT', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const integerNumber = new Intl.NumberFormat('pt-PT');
const dayFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/London',
  day: '2-digit',
  month: '2-digit',
});
const longDateFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/London',
  dateStyle: 'medium',
});

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  station_closure: 'Fecho de estação',
  line_failure: 'Falha de linha',
};

function formatCompact(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : compactNumber.format(value);
}

function formatDay(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dayFormatter.format(date);
}

function formatBillions(value: number): string {
  return `${(value / 1_000_000_000).toLocaleString('pt-PT', {
    maximumFractionDigits: 2,
  })} mil milhões`;
}

function formatLongDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : longDateFormatter.format(date);
}

export function AnalyticsPage() {
  const network = useAnalyticsNetwork();
  const lines = useLines();
  const stations = useStations();
  const footfall = useFootfallSummary(30, 10);
  const annual = useAnnualSummary(10);
  const boardings = useLineBoardings();
  const [scenarioType, setScenarioType] = useState<ScenarioType>('station_closure');
  const [scenarioId, setScenarioId] = useState('940GZZLUOXC');
  const [footfallStationId, setFootfallStationId] = useState('940GZZLUOXC');
  const [crowdingStationId, setCrowdingStationId] = useState('940GZZLUOXC');
  const [rodsStationId, setRodsStationId] = useState('940GZZLUOXC');
  const [rodsMetric, setRodsMetric] = useState<'boarders' | 'alighters'>('boarders');
  const scenario = useAnalyticsScenario(scenarioType, scenarioId || null);
  const stationFootfall = useStationFootfall(footfallStationId || null, 90);
  const crowding = useStationCrowding(crowdingStationId || null);
  const rods = useRodsStation(rodsStationId || null, rodsMetric);

  const data = network.data?.data ?? null;
  const meta = network.data?.meta ?? null;
  const footfallData = footfall.data?.data ?? null;
  const footfallMeta = footfall.data?.meta ?? null;
  const annualData = annual.data?.data ?? null;
  const boardingsData = boardings.data?.data ?? null;
  const crowdingData = crowding.data?.data ?? null;
  const rodsData = rods.data?.data ?? null;
  const scenarioData = scenario.data?.data ?? null;
  const stationFootfallData = stationFootfall.data?.data ?? null;
  const stationOptions = stations.data?.data ?? [];
  const lineOptions = lines.data?.data ?? [];

  const lineImpact = useMemo(
    () => (data?.lineImpact ?? []).filter((line) => line.stationsOutsideLargest > 0).slice(0, 12),
    [data],
  );
  const topStations = footfallData?.topStations ?? [];
  const footfallSeries = (footfallData?.series ?? []).map((point) => ({
    ...point,
    label: formatDay(point.date),
  }));
  const stationSeries = (stationFootfallData?.series ?? []).map((point) => ({
    ...point,
    label: formatDay(point.date),
  }));
  const latestBoardings = (boardingsData?.lines ?? [])
    .filter(
      (line) => line.latestYear === boardingsData?.latestYear && (line.latestBoardings ?? 0) > 0,
    )
    .slice(0, 12);
  const annualTop = annualData?.topStations ?? [];
  const crowdingSeries = (crowdingData?.intervals ?? []).map((interval) => ({
    ...interval,
    label: interval.intervalStart,
  }));
  const rodsSeries = (rodsData?.intervals ?? []).map((interval) => ({
    ...interval,
    label: interval.intervalStart,
  }));

  const scenarioTargets =
    scenarioType === 'station_closure'
      ? stationOptions.map((station) => ({ id: station.id, label: station.name }))
      : lineOptions.map((line) => ({ id: line.id, label: line.name }));

  const onScenarioTypeChange = (type: ScenarioType) => {
    setScenarioType(type);
    setScenarioId('');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Digital twin analítico</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
              Análise da rede
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              Grafo estação–segmento construído a partir das sequências reais da TfL, indicadores de
              acessibilidade observada, resiliência topológica e footfall histórico. Cenários são
              marcados como <code>scenario</code>; não representam o serviço em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">derivado</Badge>
            <Badge tone="info">histórico</Badge>
            {meta?.dataSourceStatus ? (
              <Badge
                tone={meta.isStale ? 'warning' : 'neutral'}
                title={meta.fetchedAt ? `Reference: ${meta.fetchedAt}` : undefined}
              >
                referência {formatAge(meta.ageSeconds)}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="Estações"
            value={data?.graph.stations ?? '—'}
            hint="nós canónicos"
            tone="default"
          />
          <Stat
            label="Ligações"
            value={data?.graph.undirectedLinks ?? '—'}
            hint={`${data?.graph.transferLinks ?? 0} transferências`}
            tone="normal"
          />
          <Stat
            label="Componentes"
            value={data?.graph.components ?? '—'}
            hint="conectividade"
            tone="attention"
          />
          <Stat
            label="Maior componente"
            value={data?.graph.largestComponent ?? '—'}
            hint="estações ligadas"
            tone="normal"
          />
          <Stat
            label="Interchanges"
            value={data?.accessibility.interchanges ?? '—'}
            hint="servem 2+ linhas"
            tone="default"
          />
          <Stat
            label="Sem ligações"
            value={data?.graph.isolatedStations ?? '—'}
            hint="nós isolados no grafo"
            tone="severe"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Acessibilidade</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Facilities observadas
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {[
                ['Com lifts', data?.accessibility.withLifts],
                ['Com WC', data?.accessibility.withToilets],
                ['Com WiFi', data?.accessibility.withWifi],
                ['Interchanges', data?.accessibility.interchanges],
              ].map(([label, value]) => {
                const count = typeof value === 'number' ? value : null;
                const total = data?.accessibility.totalStations ?? 0;
                const percent = count !== null && total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={String(label)} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-slate-400">{label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-accent/70"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[0.625rem] text-slate-500">
                      {count ?? '—'}
                    </span>
                  </div>
                );
              })}
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">Step-free explícito</span>
                  <Badge tone="warning">
                    {data?.accessibility.stepFreeKnown ?? '—'} conhecidos
                  </Badge>
                </div>
                <p className="mt-2 text-[0.625rem] leading-relaxed text-slate-500">
                  {data?.accessibility.stepFreeUnknown ?? 0} estações sem valor explícito.
                  AccessViaLift não é convertido em step-free completo.
                </p>
              </div>
              <p className="text-[0.625rem] leading-relaxed text-slate-600">
                {data?.accessibility.note ?? 'Aguarda dados de referência.'}
              </p>
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <GitFork className="h-4 w-4 text-status-attention" />
                <div>
                  <p className="kicker">Topologia</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Estações críticas (articulações)
                  </p>
                </div>
              </div>
              <Badge tone="neutral">até 12</Badge>
            </div>
            {data && data.criticalStations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.6875rem]">
                  <thead className="bg-white/[0.03] font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Estação</th>
                      <th className="px-4 py-2 font-medium">Linhas</th>
                      <th className="px-4 py-2 font-medium">Grau</th>
                      <th className="px-4 py-2 font-medium">Articulação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.criticalStations.map((station) => (
                      <tr key={station.stationId} className="text-slate-400">
                        <td className="px-4 py-1.5 text-slate-200">{station.name}</td>
                        <td className="px-4 py-1.5 font-mono text-[0.625rem]">
                          {station.lineIds.length}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-[0.625rem]">{station.degree}</td>
                        <td className="px-4 py-1.5">
                          <Badge tone={station.articulation ? 'warning' : 'neutral'}>
                            {station.articulation ? 'sim' : 'não'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<GitFork className="h-4 w-4" />}
                title={network.isLoading ? 'A calcular grafo' : 'Sem grafo disponível'}
                description="O grafo é derivado de line_stations e hubs Naptan."
                compact
              />
            )}
            <p className="border-t border-white/5 px-4 py-2 text-[0.625rem] leading-relaxed text-slate-600">
              Articulação = estação cuja remoção aumenta o número de componentes. Grau inclui
              segmentos e transferências de hub. Os {data?.graph.isolatedStations ?? 0} nós isolados
              correspondem sobretudo a paragens de tram sem sequência em `line_stations`.
            </p>
          </section>
        </div>

        <section className="panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-accent" />
              <div>
                <p className="kicker">Resiliência</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  Impacto de falha por linha
                </p>
              </div>
            </div>
            <Badge tone="neutral">top {lineImpact.length}</Badge>
          </div>
          {lineImpact.length > 0 ? (
            <div className="h-[330px] w-full p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={lineImpact}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="lineName"
                    width={116}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{
                      background: '#0b1220',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [
                      `${integerNumber.format(value)} estações`,
                      'fora da maior componente',
                    ]}
                  />
                  <Bar
                    dataKey="stationsOutsideLargest"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                  >
                    {lineImpact.map((line) => (
                      <Cell key={line.lineId} fill={line.colorHex ?? '#7A879C'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<Route className="h-4 w-4" />}
              title="Sem impacto calculado"
              description="O grafo ainda não tem linhas suficientes para simular falhas."
              compact
            />
          )}
          <p className="border-t border-white/5 px-4 py-2 text-[0.625rem] leading-relaxed text-slate-600">
            Simulação topológica: remove as ligações da linha e mede componentes. Não modela
            frequências, capacidade, tempos de viagem ou autocarros de substituição.
          </p>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Annual station counts</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Entradas + saídas anuais (2025)
                  </p>
                </div>
              </div>
              <Badge tone="info">histórico</Badge>
            </div>
            {annualTop.length > 0 ? (
              <div className="h-[330px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={annualTop.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      tickFormatter={(value: number) => compactNumber.format(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={138}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [
                        integerNumber.format(value),
                        'entradas + saídas / ano',
                      ]}
                    />
                    <Bar
                      dataKey="annualEntriesExits"
                      fill="#38bdf8"
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={<BarChart3 className="h-4 w-4" />}
                title={annual.isLoading ? 'A carregar annual counts' : 'Sem annual counts'}
                description="Execute npm run ingest:annual."
                compact
              />
            )}
            <p className="border-t border-white/5 px-4 py-2 text-[0.625rem] leading-relaxed text-slate-600">
              {annualData
                ? `${annualData.stationCount} estações · ${formatBillions(annualData.totalAnnualEntriesExits)} entradas + saídas em ${annualData.year}.`
                : 'Sem dados anuais.'}{' '}
              {annualData?.note}
            </p>
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">NUMBAT</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Boardings anuais por linha
                  </p>
                </div>
              </div>
              <Badge tone="info">{boardingsData?.latestYear ?? '—'}</Badge>
            </div>
            {latestBoardings.length > 0 ? (
              <div className="h-[330px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={latestBoardings}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      tickFormatter={(value: number) => compactNumber.format(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="lineName"
                      width={124}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [
                        integerNumber.format(value),
                        'boardings / ano',
                      ]}
                    />
                    <Bar dataKey="latestBoardings" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {latestBoardings.map((line) => (
                        <Cell
                          key={line.lineCode}
                          fill={
                            (line.lineId && LINE_BRANDING_BY_ID[line.lineId]?.colorHex) ?? '#7A879C'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={<Route className="h-4 w-4" />}
                title={boardings.isLoading ? 'A carregar NUMBAT' : 'Sem NUMBAT'}
                description="Execute npm run ingest:numbat."
                compact
              />
            )}
            <p className="border-t border-white/5 px-4 py-2 text-[0.625rem] leading-relaxed text-slate-600">
              Boardings anuais estimados pela TfL (2016–2025). Dados históricos; não é procura em
              tempo real. HAM representa H&C + Circle em conjunto e não é atribuído a uma linha só.
            </p>
          </section>
        </div>

        <section className="panel overflow-hidden">
          <div className="panel-header flex-wrap">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-status-severe" />
              <div>
                <p className="kicker">Cenários</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  Simulador de conectividade
                </p>
              </div>
            </div>
            <Badge tone="danger">scenario</Badge>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[0.625rem] uppercase tracking-[0.1em] text-slate-500">
                Tipo
                <select
                  value={scenarioType}
                  onChange={(event) => onScenarioTypeChange(event.target.value as ScenarioType)}
                  className="min-w-[170px] rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-slate-300 focus:border-accent/40 focus:outline-none"
                >
                  <option value="station_closure">{SCENARIO_LABELS.station_closure}</option>
                  <option value="line_failure">{SCENARIO_LABELS.line_failure}</option>
                </select>
              </label>
              <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[0.625rem] uppercase tracking-[0.1em] text-slate-500">
                Alvo
                <select
                  value={scenarioId}
                  onChange={(event) => setScenarioId(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-slate-300 focus:border-accent/40 focus:outline-none"
                >
                  <option value="">Selecione…</option>
                  {scenarioTargets.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
                </select>
              </label>
              {scenarioData ? <Badge tone="info">{scenarioData.scenario.label}</Badge> : null}
            </div>

            {scenario.isLoading ? (
              <p className="text-xs text-slate-500">A calcular cenário…</p>
            ) : scenarioData ? (
              <>
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
                  <Stat
                    label="Estações removidas"
                    value={scenarioData.impact.removedStations}
                    hint="do grafo"
                    tone="severe"
                  />
                  <Stat
                    label="Ligações removidas"
                    value={scenarioData.impact.removedLinks}
                    hint="segmentos + transfers"
                    tone="attention"
                  />
                  <Stat
                    label="Componentes"
                    value={`${scenarioData.baseline.components} → ${scenarioData.impact.componentsAfter}`}
                    hint="antes → depois"
                    tone="attention"
                  />
                  <Stat
                    label="Maior componente"
                    value={`${scenarioData.baseline.largestComponent} → ${scenarioData.impact.largestComponent}`}
                    hint="estações"
                    tone="normal"
                  />
                  <Stat
                    label="Fora da maior"
                    value={scenarioData.impact.stationsOutsideLargest}
                    hint="estações"
                    tone="severe"
                  />
                  <Stat
                    label="Perda de conectividade"
                    value={`${(scenarioData.impact.connectivityLoss * 100).toFixed(1)}%`}
                    hint="das restantes"
                    tone="closure"
                  />
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <p className="kicker mb-1">Premissas</p>
                  <ul className="list-inside list-disc space-y-0.5 text-[0.6875rem] text-slate-400">
                    {scenarioData.scenario.assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="kicker">Estações afetadas</p>
                    <Badge tone="neutral">{scenarioData.affectedStations.length}</Badge>
                  </div>
                  {scenarioData.affectedStations.length > 0 ? (
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10">
                      <table className="w-full text-left text-[0.6875rem]">
                        <thead className="sticky top-0 bg-ink-900 font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Estação</th>
                            <th className="px-3 py-2 font-medium">Linhas</th>
                            <th className="px-3 py-2 font-medium">Motivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {scenarioData.affectedStations.slice(0, 100).map((station) => (
                            <tr
                              key={`${station.stationId}-${station.reason}`}
                              className="text-slate-400"
                            >
                              <td className="px-3 py-1.5 text-slate-200">{station.name}</td>
                              <td className="px-3 py-1.5 font-mono text-[0.625rem]">
                                {station.lineIds.length}
                              </td>
                              <td className="px-3 py-1.5">
                                <Badge
                                  tone={
                                    station.reason === 'removed'
                                      ? 'danger'
                                      : station.reason === 'isolated'
                                        ? 'warning'
                                        : 'neutral'
                                  }
                                >
                                  {station.reason}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Sem estações afetadas no grafo para este cenário.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <EmptyState
                icon={<ShieldAlert className="h-4 w-4" />}
                title="Escolha um alvo"
                description="Selecione uma estação ou linha para calcular o impacto topológico."
                compact
              />
            )}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="panel-header flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <div>
                <p className="kicker">Footfall histórico</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  Entradas e saídas por dia
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">histórico</Badge>
              {footfallMeta?.fetchedAt ? (
                <Badge tone="neutral">
                  ingerido {formatLongDate(footfallMeta.fetchedAt.slice(0, 10))}
                </Badge>
              ) : null}
            </div>
          </div>

          {footfallData && footfallSeries.length > 0 ? (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-3 text-[0.625rem] text-slate-500">
                <span>
                  {formatLongDate(footfallData.firstDate)} → {formatLongDate(footfallData.lastDate)}
                </span>
                <span>·</span>
                <span>{footfallData.stationsWithData} estações com dados</span>
                <span>·</span>
                <span>{formatCompact(footfallData.totalEntries)} entradas</span>
                <span>·</span>
                <span>{formatCompact(footfallData.totalExits)} saídas</span>
              </div>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={footfallSeries}
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="footfall-entries" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="footfall-exits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => compactNumber.format(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        integerNumber.format(value),
                        name,
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="entries"
                      name="Entradas"
                      stroke="#38bdf8"
                      fill="url(#footfall-entries)"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="exits"
                      name="Saídas"
                      stroke="#a78bfa"
                      fill="url(#footfall-exits)"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[0.625rem] leading-relaxed text-slate-600">
                {footfallData.note} Série de {footfallData.windowDays} dias por estação; agrega
                apenas valores observados, sem preencher dias em falta.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={<BarChart3 className="h-4 w-4" />}
              title={footfall.isLoading ? 'A carregar footfall' : 'Sem footfall ingerido'}
              description="Execute npm run ingest:footfall para carregar o dataset histórico da TfL."
              compact
            />
          )}
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Top estações</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Entradas + saídas (30 dias)
                  </p>
                </div>
              </div>
            </div>
            {topStations.length > 0 ? (
              <div className="h-[300px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topStations}
                    layout="vertical"
                    margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      tickFormatter={(value: number) => compactNumber.format(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [integerNumber.format(value), 'total']}
                    />
                    <Bar
                      dataKey="total"
                      fill="#38bdf8"
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={<BarChart3 className="h-4 w-4" />}
                title="Sem dados no período"
                description="O footfall histórico aparece após a ingestão."
                compact
              />
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header flex-wrap">
              <div className="flex items-center gap-2">
                <Waypoints className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Detalhe por estação</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">Série de 90 dias</p>
                </div>
              </div>
              <select
                value={footfallStationId}
                onChange={(event) => setFootfallStationId(event.target.value)}
                className="max-w-[220px] rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-slate-300 focus:border-accent/40 focus:outline-none"
              >
                {stationOptions.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>
            {stationFootfallData && stationSeries.length > 0 ? (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3 text-[0.625rem] text-slate-500">
                  <span className="text-slate-300">{stationFootfallData.station.name}</span>
                  <span>·</span>
                  <span>{formatCompact(stationFootfallData.totals.entries)} entradas</span>
                  <span>·</span>
                  <span>{formatCompact(stationFootfallData.totals.exits)} saídas</span>
                  <span>·</span>
                  <span>{stationFootfallData.totals.days} dias</span>
                </div>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={stationSeries}
                      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="station-footfall" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => compactNumber.format(value)}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#0b1220',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => [
                          integerNumber.format(value),
                          name,
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="entries"
                        name="Entradas"
                        stroke="#38bdf8"
                        fill="url(#station-footfall)"
                        strokeWidth={1.5}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="exits"
                        name="Saídas"
                        stroke="#a78bfa"
                        fill="transparent"
                        strokeWidth={1.2}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Waypoints className="h-4 w-4" />}
                title={stationFootfall.isLoading ? 'A carregar estação' : 'Sem série'}
                description="Escolha uma estação com footfall ingerido."
                compact
              />
            )}
          </section>
        </div>

        <section className="panel overflow-hidden">
          <div className="panel-header flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <div>
                <p className="kicker">Crowding típico 2017</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  Perfil por intervalos de 15 minutos
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">histórico</Badge>
              <select
                value={crowdingStationId}
                onChange={(event) => setCrowdingStationId(event.target.value)}
                className="max-w-[220px] rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-slate-300 focus:border-accent/40 focus:outline-none"
              >
                {stationOptions.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {crowdingData && crowdingSeries.length > 0 ? (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3 text-[0.625rem] text-slate-500">
                <span className="text-slate-300">{crowdingData.station.name}</span>
                <span>·</span>
                <span>{crowdingData.profileName}</span>
                <span>·</span>
                <span>{formatCompact(crowdingData.totalPassengers)} passageiros / dia típico</span>
              </div>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={crowdingSeries}
                    margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="crowding-profile" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      minTickGap={36}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => compactNumber.format(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [integerNumber.format(value), 'passageiros']}
                    />
                    <Area
                      type="monotone"
                      dataKey="passengers"
                      name="Passageiros"
                      stroke="#a78bfa"
                      fill="url(#crowding-profile)"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[0.625rem] leading-relaxed text-slate-600">
                {crowdingData.note} Agregação dos fluxos internos por estação; não representa
                ocupação de veículos nem tempo real.
              </p>
            </div>
          ) : (
            <EmptyState
              icon={<Activity className="h-4 w-4" />}
              title={crowding.isLoading ? 'A carregar crowding' : 'Sem perfil de crowding'}
              description="Execute npm run ingest:crowding."
              compact
            />
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="panel-header flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <div>
                <p className="kicker">RODS 2017</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  Boarders e alighters por intervalo
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">histórico</Badge>
              <div className="flex items-center gap-1">
                {(['boarders', 'alighters'] as const).map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    onClick={() => setRodsMetric(metric)}
                    aria-pressed={rodsMetric === metric}
                    className={
                      rodsMetric === metric
                        ? 'rounded-md border border-accent/40 bg-accent/15 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-accent'
                        : 'rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-slate-500 hover:text-slate-300'
                    }
                  >
                    {metric}
                  </button>
                ))}
              </div>
              <select
                value={rodsStationId}
                onChange={(event) => setRodsStationId(event.target.value)}
                className="max-w-[220px] rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-slate-300 focus:border-accent/40 focus:outline-none"
              >
                {stationOptions.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {rodsData && rodsSeries.length > 0 ? (
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3 text-[0.625rem] text-slate-500">
                <span className="text-slate-300">{rodsData.station.name}</span>
                <span>·</span>
                <span>{rodsData.metric}</span>
                <span>·</span>
                <span>{formatCompact(rodsData.totalPassengers)} por dia típico</span>
              </div>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rodsSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="rods-profile" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                      minTickGap={36}
                    />
                    <YAxis
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => compactNumber.format(value)}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0b1220',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [integerNumber.format(value), rodsMetric]}
                    />
                    <Area
                      type="monotone"
                      dataKey="passengers"
                      name={rodsMetric}
                      stroke="#34d399"
                      fill="url(#rods-profile)"
                      strokeWidth={1.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[0.625rem] leading-relaxed text-slate-600">{rodsData.note}</p>
            </div>
          ) : (
            <EmptyState
              icon={<Activity className="h-4 w-4" />}
              title={rods.isLoading ? 'A carregar RODS' : 'Sem dados RODS'}
              description="Execute npm run ingest:rods."
              compact
            />
          )}
        </section>

        <p className="flex items-center gap-1.5 pb-1 text-[0.625rem] text-slate-600">
          <CircleHelp className="h-3 w-3" />
          Grafo e cenários são derivados/`scenario`; footfall é `historical`. Nenhum valor em falta
          é substituído por zero.
        </p>
      </div>
    </div>
  );
}
