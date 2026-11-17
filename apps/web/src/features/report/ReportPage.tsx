import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import {
  LINE_BRANDING_BY_ID,
  STATUS_BAND_COLORS,
  STATUS_BAND_LABELS,
  formatLondonDateTime,
  formatLondonTime,
  type LineSummary,
} from '@ldt/shared';
import { Badge } from '../../components/ui/Badge';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import {
  useDashboardHistory,
  useDashboardSummary,
  useDataHealth,
  useDisruptions,
  useLineBoardings,
  useLines,
  useNetwork,
} from '../../hooks/useOperations';
import { NetworkMapSvg } from './NetworkMapSvg';

const compactNumber = new Intl.NumberFormat('pt-PT', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function ReportPage() {
  const dashboard = useDashboardSummary();
  const history = useDashboardHistory(24);
  const health = useDataHealth();
  const lines = useLines();
  const disruptions = useDisruptions();
  const network = useNetwork();
  const boardings = useLineBoardings();

  const summary = dashboard.data?.data?.summary ?? null;
  const meta = dashboard.data?.meta ?? null;
  const lineRows = lines.data?.data ?? [];
  const alerts = (disruptions.data?.data ?? []).slice(0, 12);
  const dataHealth = health.data?.data ?? null;
  const historySeries = (history.data?.data?.series ?? []).slice(-8).reverse();
  const networkData = network.data?.data ?? null;
  const boardingsData = boardings.data?.data ?? null;
  const generatedAt = new Date();

  const mainLines = useMemo(() => {
    if (!networkData || !boardingsData) {
      return [] as Array<{ line: LineSummary; boardings: number }>;
    }
    const lineById = new Map(networkData.lines.map((line) => [line.id, line]));
    return boardingsData.lines
      .filter((row) => row.latestYear === boardingsData.latestYear && row.lineId)
      .sort((left, right) => (right.latestBoardings ?? 0) - (left.latestBoardings ?? 0))
      .slice(0, 6)
      .flatMap((row) => {
        const line = row.lineId ? lineById.get(row.lineId) : undefined;
        return line ? [{ line, boardings: row.latestBoardings ?? 0 }] : [];
      });
  }, [networkData, boardingsData]);

  return (
    <div className="h-full overflow-y-auto print:overflow-visible">
      <div className="print-report mx-auto max-w-[1000px] space-y-5 p-4 lg:p-6">
        <div className="hidden border-b border-slate-300 pb-3 print:block">
          <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.3em] text-slate-900">
            Vidrey&apos;s Report
          </p>
          <p className="mt-1 font-mono text-[0.5625rem] uppercase tracking-[0.18em] text-slate-500">
            Independent Audit for Brands
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <Link to="/dashboard" className="text-xs text-accent hover:underline">
            ← Voltar ao dashboard
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir / Guardar PDF
          </button>
        </div>

        <header className="border-b border-white/10 pb-4">
          <p className="kicker">London Digital Twin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
            Relatório operacional
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Gerado em {formatLondonDateTime(generatedAt)} · dados abertos da Transport for London
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DataStateBadge
              status={meta?.dataSourceStatus ?? 'unconfigured'}
              ageSeconds={meta?.ageSeconds}
            />
            {summary ? (
              <Badge tone="neutral">
                última coleta {meta?.fetchedAt ? formatLondonTime(meta.fetchedAt) : '—'}
              </Badge>
            ) : null}
          </div>
        </header>

        <section>
          <h2 className="text-sm font-semibold text-slate-100">Resumo da rede</h2>
          <div className="mt-2 grid grid-cols-2 gap-2.5 md:grid-cols-5">
            {[
              ['Linhas normais', summary?.normal ?? '—'],
              ['Linhas com disrupção', summary ? summary.attention + summary.severe : '—'],
              ['Alertas ativos', summary?.disruptionsActive ?? '—'],
              ['Estações afetadas', summary?.stationsAffected ?? '—'],
              ['Estações', summary?.stationsTotal ?? '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="stat-card">
                <p className="kicker">{label}</p>
                <p className="mt-1.5 font-mono text-xl font-semibold text-slate-100">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {networkData ? (
          <>
            <section className="map-block">
              <h2 className="text-sm font-semibold text-slate-100">Mapa da rede</h2>
              <div className="mx-auto mt-2 max-w-[640px] overflow-hidden rounded-xl border border-white/10 bg-white">
                <NetworkMapSvg
                  data={networkData}
                  labelCount={4}
                  viewBoxWidth={1000}
                  viewBoxHeight={820}
                  className="h-[460px] w-full"
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.625rem] sm:grid-cols-3">
                {networkData.lines.map((line) => (
                  <span key={line.id} className="inline-flex items-center gap-1.5 text-slate-400">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          line.colorHex ?? LINE_BRANDING_BY_ID[line.id]?.colorHex ?? '#7A879C',
                      }}
                    />
                    {line.name}
                  </span>
                ))}
              </div>
            </section>

            <section className="map-block">
              <h2 className="text-sm font-semibold text-slate-100">Principais linhas</h2>
              <p className="mt-1 text-xs text-slate-500">
                As seis linhas com mais boardings em {boardingsData?.latestYear ?? '—'}.
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {mainLines.map(({ line, boardings }) => (
                  <figure
                    key={line.id}
                    className="map-figure overflow-hidden rounded-xl border border-white/10 bg-white"
                  >
                    <NetworkMapSvg
                      data={networkData}
                      focusLineId={line.id}
                      labelCount={1}
                      viewBoxWidth={800}
                      viewBoxHeight={620}
                      className="h-[240px] w-full"
                    />
                    <figcaption className="flex flex-wrap items-center justify-between gap-1 px-3 py-2">
                      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] text-slate-700">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              line.colorHex ?? LINE_BRANDING_BY_ID[line.id]?.colorHex ?? '#7A879C',
                          }}
                        />
                        {line.name}
                      </span>
                      <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-slate-500">
                        {line.stationCount ?? '—'} estações · {compactNumber.format(boardings)}{' '}
                        boardings
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          </>
        ) : null}

        <section>
          <h2 className="text-sm font-semibold text-slate-100">Estado por linha</h2>
          <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Linha</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                  <th className="px-3 py-2 font-medium">Atualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lineRows.map((line) => {
                  const band = line.status?.band ?? 'unknown';
                  return (
                    <tr key={line.id} className="text-slate-400">
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-2 text-slate-200">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                line.colorHex ??
                                LINE_BRANDING_BY_ID[line.id]?.colorHex ??
                                '#7A879C',
                            }}
                          />
                          {line.name}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] uppercase"
                          style={{ color: STATUS_BAND_COLORS[band] }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: STATUS_BAND_COLORS[band] }}
                          />
                          {STATUS_BAND_LABELS[band]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">{line.status?.description ?? '—'}</td>
                      <td className="max-w-[260px] truncate px-3 py-1.5">
                        {line.status?.reason ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[0.625rem]">
                        {line.status?.capturedAt ? formatLondonTime(line.status.capturedAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-100">Alertas ativos</h2>
          {alerts.length > 0 ? (
            <div className="mt-2 space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-white/10 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">
                      {alert.lineId
                        ? (LINE_BRANDING_BY_ID[alert.lineId]?.name ?? alert.lineId)
                        : 'Rede'}
                    </span>
                    <Badge tone={alert.band === 'closure' ? 'danger' : 'warning'}>
                      {STATUS_BAND_LABELS[alert.band]}
                    </Badge>
                    <span className="text-[0.625rem] text-slate-500">
                      {alert.categoryDescription ?? alert.category ?? 'Info'}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-slate-400">
                    {alert.description ?? alert.summary ?? 'Sem descrição.'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Sem alertas ativos.</p>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-100">Histórico horário recente</h2>
          {historySeries.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Hora</th>
                    <th className="px-3 py-2 font-medium">Normais</th>
                    <th className="px-3 py-2 font-medium">Atenção</th>
                    <th className="px-3 py-2 font-medium">Severas</th>
                    <th className="px-3 py-2 font-medium">Fechadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {historySeries.map((point) => (
                    <tr key={point.bucketStart} className="text-slate-400">
                      <td className="px-3 py-1.5 font-mono text-[0.625rem] text-slate-300">
                        {formatLondonTime(point.bucketStart)}
                      </td>
                      <td className="px-3 py-1.5 font-mono">{point.normal}</td>
                      <td className="px-3 py-1.5 font-mono">{point.attention}</td>
                      <td className="px-3 py-1.5 font-mono">{point.severe}</td>
                      <td className="px-3 py-1.5 font-mono">{point.closure}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Sem histórico horário disponível.</p>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-100">Saúde dos dados</h2>
          <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-2">
            <p>
              Fontes com sucesso:{' '}
              <strong>{dataHealth?.sources.filter((s) => s.status === 'ok').length ?? '—'}</strong>
            </p>
            <p>
              Fontes com erro:{' '}
              <strong>
                {dataHealth?.sources.filter((s) => s.status === 'error').length ?? '—'}
              </strong>
            </p>
            <p>
              Jobs recentes: <strong>{dataHealth?.jobs.length ?? '—'}</strong>
            </p>
            <p>
              Retenção de snapshots:{' '}
              <strong>{dataHealth?.retention.statusSnapshotsDays ?? 90} dias</strong>
            </p>
          </div>
        </section>

        <footer className="border-t border-white/10 pt-3 text-[0.625rem] leading-relaxed text-slate-500">
          Informação fornecida pela Transport for London. Projeto independente, não afiliado à TfL.
          Dados históricos, derivados e de estado reportado; não há garantias de tempo real fora dos
          timestamps indicados.
        </footer>
        <p className="hidden border-t border-white/10 pt-3 text-[0.625rem] text-slate-500 print:block">
          Preparado por Vidrey&apos;s Report — Independent Audit for Brands. Relatório independente,
          não afiliado, endossado ou patrocinado pela Transport for London.
        </p>
      </div>
    </div>
  );
}
