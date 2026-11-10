import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  CircleHelp,
  Clock3,
  Database,
  FileText,
  Gauge,
  RefreshCw,
  ServerCog,
  TriangleAlert,
  Wifi,
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
  type TooltipProps,
} from 'recharts';
import {
  LINE_BRANDING_BY_ID,
  STATUS_BAND_COLORS,
  STATUS_BAND_LABELS,
  formatAge,
  formatLondonDateTime,
  formatLondonTime,
  type StatusBand,
  type SyncJobStatus,
} from '@ldt/shared';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { Stat } from '../../components/ui/Stat';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useDashboardHistory, useDashboardSummary, useDataHealth } from '../../hooks/useOperations';
import { useRealtimeStore } from '../../store/realtimeStore';

const BANDS: readonly StatusBand[] = ['normal', 'attention', 'severe', 'closure', 'unknown'];
const HISTORY_RANGES = [
  { hours: 6, label: '6 h' },
  { hours: 24, label: '24 h' },
  { hours: 72, label: '72 h' },
] as const;

const hourFormatter = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit',
});

function formatHourLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : hourFormatter.format(date);
}

function jobTone(status: SyncJobStatus): BadgeTone {
  if (status === 'success') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'failed') return 'danger';
  return 'info';
}

function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function bucketLabel(count: number): string {
  return `${count} ${count === 1 ? 'bucket' : 'buckets'}`;
}

function sampleLabel(count: number): string {
  return `${count} ${count === 1 ? 'amostra' : 'amostras'}`;
}

function HistoryTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-ink-950/95 px-3 py-2 text-[0.6875rem] shadow-xl">
      <p className="mb-1.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => {
          const band = String(entry.dataKey ?? '') as StatusBand;
          return (
            <div key={String(entry.dataKey)} className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: entry.color ?? STATUS_BAND_COLORS.unknown }}
              />
              <span className="text-slate-400">{STATUS_BAND_LABELS[band] ?? band}</span>
              <span className="ml-auto font-mono text-slate-200">{entry.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DisruptionTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as
    { lineName?: string | null; disruptedBuckets?: number; totalBuckets?: number } | undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-ink-950/95 px-3 py-2 text-[0.6875rem] shadow-xl">
      <p className="font-medium text-slate-200">{point.lineName ?? 'Linha'}</p>
      <p className="mt-1 font-mono text-[0.625rem] text-slate-500">
        {point.disruptedBuckets ?? 0} de {point.totalBuckets ?? 0} buckets com disrupção
      </p>
    </div>
  );
}

export function DashboardPage() {
  const [historyHours, setHistoryHours] = useState(24);
  const health = useApiHealth();
  const dashboard = useDashboardSummary();
  const history = useDashboardHistory(historyHours);
  const dataHealth = useDataHealth();
  const realtimeStatus = useRealtimeStore((state) => state.status);
  const realtimeLastEventAt = useRealtimeStore((state) => state.lastEventAt);

  const data = dashboard.data?.data ?? null;
  const meta = dashboard.data?.meta ?? null;
  const summary = data?.summary ?? null;
  const historyData = history.data?.data ?? null;
  const historyMeta = history.data?.meta ?? null;
  const healthData = dataHealth.data?.data ?? null;
  const dataStatus = meta?.dataSourceStatus ?? 'unconfigured';
  const disrupted = summary ? summary.attention + summary.severe : null;
  const totalLines = summary?.linesTotal ?? 0;

  const series = (historyData?.series ?? []).map((point) => ({
    ...point,
    label: formatHourLabel(point.bucketStart),
    fullLabel: formatLondonDateTime(point.bucketStart),
  }));
  const disruptedLines = (historyData?.topDisruptedLines ?? [])
    .filter((line) => line.disruptedBuckets > 0)
    .slice(0, 8);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Operações · visão agregada</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
              Dashboard operacional
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              KPIs e séries calculados a partir de snapshots reais da TfL. Nenhum valor é preenchido
              artificialmente: enquanto não houver sincronização, os indicadores ficam vazios.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DataStateBadge status={dataStatus} ageSeconds={meta?.ageSeconds} />
            <Badge
              tone={
                health.isError
                  ? 'danger'
                  : health.health?.status === 'degraded'
                    ? 'warning'
                    : 'success'
              }
            >
              {health.isConfigured
                ? health.isError
                  ? 'API offline'
                  : health.health?.status === 'degraded'
                    ? 'API degradada'
                    : 'API ligada'
                : 'API não configurada'}
            </Badge>
            <Badge
              tone={
                realtimeStatus === 'subscribed'
                  ? 'success'
                  : realtimeStatus === 'error'
                    ? 'warning'
                    : 'neutral'
              }
              dot
              title={
                realtimeStatus === 'subscribed'
                  ? 'Realtime ativo; polling de 60 s como fallback.'
                  : realtimeStatus === 'unconfigured'
                    ? 'Supabase Realtime não configurado; a UI usa polling de 60 s.'
                    : 'A estabelecer ligação Realtime.'
              }
            >
              {realtimeStatus === 'subscribed'
                ? 'Realtime'
                : realtimeStatus === 'connecting'
                  ? 'Ligando'
                  : 'Polling'}
            </Badge>
            <Link
              to="/report"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-slate-400 hover:text-accent"
            >
              <FileText className="h-3 w-3" />
              Relatório PDF
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          <Stat
            label="Linhas a operar normalmente"
            value={summary?.normal ?? '—'}
            hint={summary ? 'Good Service / No Issues' : 'aguarda sync'}
            tone="normal"
          />
          <Stat
            label="Linhas com disrupção"
            value={disrupted ?? '—'}
            hint={summary ? 'atenção + severa' : 'aguarda sync'}
            tone="attention"
          />
          <Stat
            label="Alertas ativos"
            value={summary?.disruptionsActive ?? '—'}
            hint={summary ? 'feed TfL' : 'aguarda sync'}
            tone="severe"
          />
          <Stat
            label="Estações afetadas"
            value={summary?.stationsAffected ?? '—'}
            hint={summary ? 'só quando reportado' : 'aguarda sync'}
            tone="closure"
          />
          <Stat
            label="Última coleta"
            value={meta?.fetchedAt ? formatLondonTime(meta.fetchedAt) : '—'}
            hint={meta?.fetchedAt ? formatLondonDateTime(meta.fetchedAt) : 'timestamp real da TfL'}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="panel overflow-hidden">
            <div className="panel-header flex-wrap">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Série temporal</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Status das linhas por hora
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {HISTORY_RANGES.map((range) => (
                  <button
                    key={range.hours}
                    type="button"
                    onClick={() => setHistoryHours(range.hours)}
                    className={
                      historyHours === range.hours
                        ? 'rounded-md border border-accent/40 bg-accent/15 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-accent'
                        : 'rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-slate-500 hover:text-slate-300'
                    }
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
            {series.length > 0 ? (
              <div className="space-y-3 p-4">
                {series.length === 1 ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <span className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                      {series[0]?.fullLabel}
                    </span>
                    {BANDS.map((band) => (
                      <span
                        key={band}
                        className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] text-slate-400"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: STATUS_BAND_COLORS[band] }}
                        />
                        {STATUS_BAND_LABELS[band]}
                        <span className="text-slate-200">{series[0]?.[band] ?? 0}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <defs>
                        {BANDS.map((band) => (
                          <linearGradient
                            key={band}
                            id={`fill-${band}`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={STATUS_BAND_COLORS[band]}
                              stopOpacity={0.45}
                            />
                            <stop
                              offset="95%"
                              stopColor={STATUS_BAND_COLORS[band]}
                              stopOpacity={0.05}
                            />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                        minTickGap={32}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        domain={[0, totalLines || 'auto']}
                      />
                      <Tooltip content={<HistoryTooltip />} />
                      {BANDS.map((band) => (
                        <Area
                          key={band}
                          type="stepAfter"
                          dataKey={band}
                          name={STATUS_BAND_LABELS[band]}
                          stackId="lines"
                          stroke={STATUS_BAND_COLORS[band]}
                          fill={`url(#fill-${band})`}
                          strokeWidth={1.5}
                          dot={series.length === 1 ? { r: 3, strokeWidth: 0 } : false}
                          isAnimationActive={false}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {BANDS.map((band) => (
                      <span
                        key={band}
                        className="inline-flex items-center gap-1.5 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-slate-500"
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: STATUS_BAND_COLORS[band] }}
                        />
                        {STATUS_BAND_LABELS[band]}
                      </span>
                    ))}
                  </div>
                  <span className="font-mono text-[0.5625rem] text-slate-600">
                    {historyMeta?.dataSourceStatus === 'stale' ? 'último agregado · ' : ''}
                    {bucketLabel(historyData?.coverage.buckets ?? 0)} ·{' '}
                    {sampleLabel(historyData?.coverage.samples ?? 0)}
                  </span>
                </div>
                <p className="text-[0.625rem] leading-relaxed text-slate-600">
                  Cada bucket representa o snapshot mais recente dessa hora. A série é derivada dos
                  snapshots reais e não prolonga valores para horas sem coleta.
                </p>
              </div>
            ) : (
              <EmptyState
                icon={<BarChart3 className="h-4 w-4" />}
                title={history.isLoading ? 'A carregar histórico' : 'Sem série histórica'}
                description={
                  history.isLoading
                    ? 'A consultar os agregados horários.'
                    : 'A série aparece depois de existir pelo menos um snapshot horário. Não há dados de exemplo.'
                }
                compact
              />
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Estado da rede</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Distribuição por banda
                  </p>
                </div>
              </div>
              <Badge tone={summary ? 'success' : 'neutral'}>
                {summary ? 'snapshot atual' : 'sem snapshot'}
              </Badge>
            </div>
            <div className="space-y-3 p-4">
              {BANDS.map((band) => {
                const count = summary ? summary[band] : null;
                const percent =
                  count !== null && totalLines > 0 ? Math.round((count / totalLines) * 100) : 0;
                return (
                  <div key={band} className="flex items-center gap-3">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_BAND_COLORS[band] }}
                    />
                    <span className="w-28 text-xs text-slate-400">{STATUS_BAND_LABELS[band]}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: STATUS_BAND_COLORS[band],
                        }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-[0.625rem] text-slate-500">
                      {count ?? '—'}
                    </span>
                  </div>
                );
              })}
              <p className="pt-1 text-[0.625rem] leading-relaxed text-slate-600">
                A soma das bandas e a contagem de estações afetadas só são exibidas com um snapshot
                real. Disrupções sem <code>affectedStops</code> não são contadas como zero.
              </p>
            </div>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-status-attention" />
                <div>
                  <p className="kicker">Histórico</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Top linhas por tempo em disrupção
                  </p>
                </div>
              </div>
              <Badge tone="neutral">{historyHours} h</Badge>
            </div>
            {disruptedLines.length > 0 ? (
              <div className="h-[248px] w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={disruptedLines}
                    layout="vertical"
                    margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
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
                      width={104}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      content={<DisruptionTooltip />}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="disruptedBuckets" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                      {disruptedLines.map((line) => (
                        <Cell
                          key={line.lineId}
                          fill={LINE_BRANDING_BY_ID[line.lineId]?.colorHex ?? '#7A879C'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={<BarChart3 className="h-4 w-4" />}
                title="Sem disrupções na janela"
                description="Nenhuma linha teve buckets horários fora do estado normal no período selecionado."
                compact
              />
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <TriangleAlert className="h-4 w-4 text-status-attention" />
                <div>
                  <p className="kicker">Alertas</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Top linhas por alertas
                  </p>
                </div>
              </div>
            </div>
            {data && data.topLines.length > 0 ? (
              <div className="divide-y divide-white/5">
                {data.topLines.map((line) => {
                  const branding = line.lineId ? LINE_BRANDING_BY_ID[line.lineId] : undefined;
                  return (
                    <div key={line.lineId} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: branding?.colorHex ?? '#7A879C' }}
                      />
                      <span className="min-w-0 flex-1 truncate text-slate-300">
                        {line.lineName ?? line.lineId}
                      </span>
                      <span className="font-mono text-[0.625rem] text-status-attention">
                        {line.disruptionCount}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<BarChart3 className="h-4 w-4" />}
                title="Sem disrupções ativas"
                description="Quando houver disrupções ativas, o ranking por linha aparece aqui."
                compact
              />
            )}
          </section>
        </div>

        <section className="panel overflow-hidden">
          <div className="panel-header flex-wrap">
            <div className="flex items-center gap-2">
              <ServerCog className="h-4 w-4 text-accent" />
              <div>
                <p className="kicker">Health</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  Saúde dos dados, jobs e retenção
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={realtimeStatus === 'subscribed' ? 'success' : 'warning'} dot>
                {realtimeStatus === 'subscribed' ? 'Realtime' : 'Polling 60 s'}
              </Badge>
              {realtimeLastEventAt ? (
                <Badge tone="neutral" title={formatLondonDateTime(realtimeLastEventAt)}>
                  evento{' '}
                  {formatAge(Math.floor((Date.now() - Date.parse(realtimeLastEventAt)) / 1000))}
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="grid gap-5 p-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">API própria</span>
                <Badge tone={health.isError ? 'danger' : 'success'}>
                  {health.isConfigured
                    ? health.isError
                      ? 'offline'
                      : 'online'
                    : 'não configurada'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Base de dados</span>
                <Badge tone="neutral">
                  {
                    {
                      ok: 'conectada',
                      error: 'erro',
                      not_configured: 'não configurada',
                    }[health.health?.checks.database ?? 'not_configured']
                  }
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Linhas com status</span>
                <span className="font-mono text-[0.625rem] text-slate-500">
                  {data?.linesWithStatus ?? '—'}
                  {summary ? ` / ${summary.linesTotal}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Cobertura histórica</span>
                <span className="font-mono text-[0.625rem] text-slate-500">
                  {historyData
                    ? `${bucketLabel(historyData.coverage.buckets)} / ${sampleLabel(historyData.coverage.samples)}`
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Último status</span>
                <span className="font-mono text-[0.625rem] text-slate-500">
                  {data?.dataHealth.lastStatusAt
                    ? formatLondonDateTime(data.dataHealth.lastStatusAt)
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">Última referência</span>
                <span className="font-mono text-[0.625rem] text-slate-500">
                  {data?.dataHealth.lastReferenceAt
                    ? formatLondonDateTime(data.dataHealth.lastReferenceAt)
                    : '—'}
                </span>
              </div>
              <div className="border-t border-white/10 pt-3">
                <p className="kicker mb-2">Retenção</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="neutral">
                    snapshots {healthData?.retention.statusSnapshotsDays ?? 90} d
                  </Badge>
                  <Badge tone="neutral">jobs {healthData?.retention.syncJobsDays ?? 30} d</Badge>
                  <Badge tone="neutral">
                    cache {healthData?.retention.cacheStaleHours ?? 48} h
                  </Badge>
                  <Badge tone="neutral">
                    arrivals {healthData?.retention.arrivalPredictionsHours ?? 24} h
                  </Badge>
                </div>
              </div>
              <div className="border-t border-white/10 pt-3">
                <p className="kicker mb-2">Fontes</p>
                <div className="flex flex-wrap gap-1.5">
                  {(healthData?.sources ?? []).map((source) => (
                    <Badge
                      key={source.id}
                      tone={
                        source.status === 'ok'
                          ? 'success'
                          : source.status === 'error'
                            ? 'danger'
                            : 'neutral'
                      }
                      title={source.lastSuccessAt ? `Sucesso: ${source.lastSuccessAt}` : undefined}
                    >
                      {source.id}
                    </Badge>
                  ))}
                  {!healthData ? <span className="text-[0.625rem] text-slate-600">—</span> : null}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="kicker">Jobs de sincronização recentes</p>
                <Clock3 className="h-3.5 w-3.5 text-slate-600" />
              </div>
              {healthData && healthData.jobs.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <table className="w-full text-left text-[0.6875rem]">
                    <thead className="bg-white/[0.03] font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">Job</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium">Duração</th>
                        <th className="px-3 py-2 font-medium">Registos</th>
                        <th className="px-3 py-2 font-medium">Início</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {healthData.jobs.slice(0, 8).map((job) => (
                        <tr key={job.id} className="text-slate-400">
                          <td className="px-3 py-1.5 font-mono text-[0.625rem] text-slate-300">
                            {job.jobName}
                          </td>
                          <td className="px-3 py-1.5">
                            <Badge tone={jobTone(job.status)}>{job.status}</Badge>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[0.625rem]">
                            {formatDuration(job.durationMs)}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[0.625rem]">
                            {job.recordsUpserted ?? '—'}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[0.625rem]">
                            {formatLondonTime(job.startedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<RefreshCw className="h-4 w-4" />}
                  title={dataHealth.isLoading ? 'A carregar jobs' : 'Sem jobs registados'}
                  description="O histórico de jobs aparece depois da primeira sincronização."
                  compact
                />
              )}
              <p className="mt-2 text-[0.625rem] leading-relaxed text-slate-600">
                O Realtime invalida as queries quando entra um novo snapshot; se a ligação cair, o
                polling de 60 s mantém os dados a atualizar. Os jobs não expõem mensagens de erro
                internas.
              </p>
            </div>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" />
              <div>
                <p className="kicker">Fase 4</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                  Tempo real, histórico e retenção
                </p>
              </div>
            </div>
            <Wifi className="h-4 w-4 text-status-normal" />
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            {[
              [
                '1. Realtime com fallback',
                'Alterações em snapshots e disrupções invalidam as queries; o polling continua ativo.',
              ],
              [
                '2. Agregação horária',
                'Buckets horários particionados por mês, com o snapshot mais recente de cada hora.',
              ],
              [
                '3. Retenção auditável',
                'Snapshots, cache, jobs e partições antigas são removidos pela função de retenção.',
              ],
            ].map(([title, description]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-xs font-medium text-slate-200">{title}</p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-slate-500">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p className="flex items-center gap-1.5 pb-1 text-[0.625rem] text-slate-600">
          <CircleHelp className="h-3 w-3" />
          Dados reportados pela TfL e agregações derivadas. Nenhum valor em falta é substituído por
          zero.
        </p>
      </div>
    </div>
  );
}
