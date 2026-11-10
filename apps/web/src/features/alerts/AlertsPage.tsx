import { useMemo, useState } from 'react';
import {
  BellOff,
  Clock3,
  Filter,
  MapPin,
  RotateCcw,
  Search,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';
import {
  LINE_BRANDING_BY_ID,
  STATUS_BAND_COLORS,
  STATUS_BAND_LABELS,
  formatLondonDateTime,
  type StatusBand,
} from '@ldt/shared';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useDisruptions, useLines } from '../../hooks/useOperations';

const BANDS: readonly StatusBand[] = ['closure', 'severe', 'attention', 'normal', 'unknown'];

const SCOPES = [
  { value: 'all', label: 'Todos os âmbitos' },
  { value: 'line', label: 'Linha' },
  { value: 'station', label: 'Estação' },
  { value: 'network', label: 'Rede' },
] as const;

type ScopeFilter = (typeof SCOPES)[number]['value'];

function bandTone(band: string): BadgeTone {
  if (band === 'closure') return 'danger';
  if (band === 'severe') return 'warning';
  if (band === 'attention') return 'warning';
  if (band === 'normal') return 'success';
  return 'neutral';
}

export function AlertsPage() {
  const disruptions = useDisruptions();
  const lines = useLines();
  const [selectedBands, setSelectedBands] = useState<StatusBand[]>([]);
  const [lineId, setLineId] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [query, setQuery] = useState('');

  const data = disruptions.data?.data ?? null;
  const meta = disruptions.data?.meta ?? null;
  const dataStatus = meta?.dataSourceStatus ?? 'unconfigured';
  const lineOptions = lines.data?.data ?? [];

  const bandCounts = useMemo(() => {
    const counts = new Map<StatusBand, number>();
    for (const disruption of data ?? []) {
      counts.set(disruption.band, (counts.get(disruption.band) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data ?? []).filter((disruption) => {
      if (selectedBands.length > 0 && !selectedBands.includes(disruption.band)) return false;
      if (lineId && disruption.lineId !== lineId) return false;
      if (scope !== 'all' && disruption.scope !== scope) return false;
      if (needle) {
        const haystack = [
          disruption.summary,
          disruption.description,
          disruption.additionalInfo,
          disruption.categoryDescription,
          disruption.closureText,
          disruption.lineId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [data, lineId, query, scope, selectedBands]);

  const filtersActive =
    selectedBands.length > 0 || Boolean(lineId) || scope !== 'all' || Boolean(query.trim());

  const toggleBand = (band: StatusBand) => {
    setSelectedBands((current) =>
      current.includes(band)
        ? current.filter((candidate) => candidate !== band)
        : [...current, band],
    );
  };

  const resetFilters = () => {
    setSelectedBands([]);
    setLineId('');
    setScope('all');
    setQuery('');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Incidentes e obras</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
              Alertas e disrupções
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Lista de interrupções ativas, obras planeadas e alertas reportados pela TfL. Cada item
              mostra a categoria, a validade e as estações afetadas quando a fonte as informa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DataStateBadge status={dataStatus} ageSeconds={meta?.ageSeconds} />
            <Badge tone="neutral">
              {filtered.length}
              {data && filtered.length !== data.length ? ` de ${data.length}` : ''} registos
            </Badge>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-accent" />
              <span className="kicker">Filtros reais</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="success">fase 4</Badge>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-slate-400 hover:text-slate-200"
                >
                  <RotateCcw className="h-3 w-3" />
                  Limpar
                </button>
              ) : null}
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {BANDS.map((band) => {
                const active = selectedBands.includes(band);
                const count = bandCounts.get(band) ?? 0;
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() => toggleBand(band)}
                    aria-pressed={active}
                    className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] transition-colors"
                    style={{
                      borderColor: active
                        ? `${STATUS_BAND_COLORS[band]}66`
                        : 'rgba(255,255,255,0.1)',
                      backgroundColor: active
                        ? `${STATUS_BAND_COLORS[band]}1F`
                        : 'rgba(255,255,255,0.03)',
                      color: active ? STATUS_BAND_COLORS[band] : '#94a3b8',
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: STATUS_BAND_COLORS[band] }}
                    />
                    {STATUS_BAND_LABELS[band]}
                    <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Pesquisar descrição, categoria ou linha"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent/40 focus:outline-none"
                />
              </div>

              <select
                value={lineId}
                onChange={(event) => setLineId(event.target.value)}
                className="rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-xs text-slate-300 focus:border-accent/40 focus:outline-none"
              >
                <option value="">Todas as linhas</option>
                {lineOptions.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                {SCOPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScope(option.value)}
                    aria-pressed={scope === option.value}
                    className={
                      scope === option.value
                        ? 'rounded-md border border-accent/40 bg-accent/15 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-accent'
                        : 'rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-slate-500 hover:text-slate-300'
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section className="panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-status-attention" />
              <div>
                <p className="kicker">Feed operacional</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">Alertas ativos</p>
              </div>
            </div>
            <Badge tone={filtered.length > 0 ? 'warning' : 'neutral'}>
              {filtered.length} {filtered.length === 1 ? 'visível' : 'visíveis'}
            </Badge>
          </div>

          {filtered.length > 0 ? (
            <div className="divide-y divide-white/5">
              {filtered.map((disruption) => {
                const branding = disruption.lineId
                  ? LINE_BRANDING_BY_ID[disruption.lineId]
                  : undefined;
                const affectedStops = disruption.affectedStops.length;
                return (
                  <article key={disruption.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: branding?.colorHex ?? STATUS_BAND_COLORS.unknown,
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-100">
                            {branding?.name ?? disruption.lineId ?? 'Rede'}
                          </span>
                          <Badge tone={bandTone(disruption.band)}>
                            {STATUS_BAND_LABELS[disruption.band]}
                          </Badge>
                          <Badge tone="neutral">
                            {disruption.categoryDescription ?? disruption.category ?? 'Info'}
                          </Badge>
                          <Badge tone="neutral">{disruption.scope}</Badge>
                          {disruption.closureText ? (
                            <Badge tone="danger">{disruption.closureText}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                          {disruption.description ??
                            disruption.summary ??
                            'Sem descrição disponível.'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.625rem] text-slate-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {disruption.startsAt
                              ? formatLondonDateTime(disruption.startsAt)
                              : 'início não informado'}
                            {disruption.endsAt
                              ? ` → ${formatLondonDateTime(disruption.endsAt)}`
                              : ''}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {affectedStops > 0
                              ? `${affectedStops} estações afetadas`
                              : 'estações afetadas não informadas'}
                          </span>
                          <span className="font-mono">
                            coletado {formatLondonDateTime(disruption.lastSeenAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<BellOff className="h-4 w-4" />}
              title={
                disruptions.isLoading
                  ? 'A carregar disrupções'
                  : data && data.length > 0
                    ? 'Nenhum alerta corresponde aos filtros'
                    : 'Nenhuma disrupção ativa'
              }
              description={
                disruptions.isLoading
                  ? 'A consultar o snapshot mais recente.'
                  : data && data.length > 0
                    ? 'Ajuste os filtros para ver outros alertas.'
                    : 'Não exibimos alertas de exemplo como se fossem reais.'
              }
            />
          )}
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: TriangleAlert,
              title: 'Real-time vs. planeado',
              text: 'Cada alerta conserva a categoria original da TfL (RealTime, PlannedWork, Information etc.).',
            },
            {
              icon: BellOff,
              title: 'Estações afetadas',
              text: 'Quando a TfL não devolve affectedStops, a UI mostra “não informado” em vez de inventar uma lista.',
            },
            {
              icon: ShieldAlert,
              title: 'Acessibilidade',
              text: 'Falhas de elevador e avisos step-free terão origem no feed específico, não em inferência.',
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="panel p-4">
              <Icon className="h-4 w-4 text-accent" />
              <p className="mt-3 text-xs font-medium text-slate-200">{title}</p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
