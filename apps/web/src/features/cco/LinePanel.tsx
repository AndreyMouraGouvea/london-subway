import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CircleSlash2, Clock3, MapPin, TrainFront } from 'lucide-react';
import {
  STATUS_BAND_COLORS,
  STATUS_BAND_LABELS,
  formatAge,
  formatLondonDateTime,
} from '@ldt/shared';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { FavoriteButton } from '../../components/ui/FavoriteButton';
import { useLineDetail, useStationArrivals } from '../../hooks/useOperations';

function bandTone(band: string): BadgeTone {
  if (band === 'closure') return 'danger';
  if (band === 'severe') return 'warning';
  if (band === 'attention') return 'warning';
  if (band === 'normal') return 'success';
  return 'neutral';
}

export function LinePanel({
  lineId,
  onClose,
  onSelectStation,
}: {
  lineId: string;
  onClose: () => void;
  onSelectStation: (stationId: string) => void;
}) {
  const detail = useLineDetail(lineId);
  const data = detail.data?.data ?? null;
  const meta = detail.data?.meta ?? null;
  const line = data?.line ?? null;
  const stations = useMemo(() => data?.stations ?? [], [data?.stations]);
  const [arrivalStationId, setArrivalStationId] = useState<string | null>(null);
  const arrivals = useStationArrivals(arrivalStationId, lineId, 5);

  useEffect(() => {
    if (stations.length === 0) {
      setArrivalStationId(null);
      return;
    }
    if (!arrivalStationId || !stations.some((station) => station.id === arrivalStationId)) {
      setArrivalStationId(stations[0]?.id ?? null);
    }
  }, [arrivalStationId, stations]);

  if (detail.isLoading) {
    return (
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <p className="kicker">Linha</p>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <CircleSlash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <EmptyState
          title="A carregar linha"
          description="A consultar o detalhe operacional."
          compact
        />
      </div>
    );
  }

  if (!line) {
    return (
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <p className="kicker">Linha</p>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <CircleSlash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <EmptyState
          title="Linha indisponível"
          description="O detalhe não pôde ser carregado."
          compact
        />
      </div>
    );
  }

  const status = line.status;
  const band = status?.band ?? 'unknown';

  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: line.colorHex ?? '#7A879C' }}
          />
          <div className="min-w-0">
            <p className="kicker">Linha · {line.mode}</p>
            <p className="truncate text-sm font-semibold text-slate-100">{line.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FavoriteButton entityType="line" entityId={line.id} label={line.name} />
          <DataStateBadge
            status={meta?.dataSourceStatus ?? 'unconfigured'}
            ageSeconds={meta?.ageSeconds}
          />
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <CircleSlash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={bandTone(band)}>{STATUS_BAND_LABELS[band]}</Badge>
          <Badge tone="neutral">{status?.description ?? 'Sem informação'}</Badge>
          <span className="font-mono text-[0.5625rem] text-slate-600">{line.id}</span>
        </div>

        {status?.reason ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[0.6875rem] leading-relaxed text-slate-300">
            {status.reason}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Estações" value={line.stationCount ?? '—'} />
          <Metric label="Alertas" value={line.disruptionCount} />
          <Metric label="Geometrias" value={data?.paths.length ?? 0} />
        </div>

        <div className="flex items-center justify-between gap-2 text-[0.625rem] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {status?.capturedAt
              ? `coletado ${formatLondonDateTime(status.capturedAt)}`
              : 'sem timestamp'}
          </span>
          <span>
            {meta?.ageSeconds !== null && meta?.ageSeconds !== undefined
              ? formatAge(meta.ageSeconds)
              : ''}
          </span>
        </div>

        {status?.validityFrom || status?.validityTo ? (
          <p className="text-[0.625rem] text-slate-500">
            Validade: {status.validityFrom ? formatLondonDateTime(status.validityFrom) : '—'} →{' '}
            {status.validityTo ? formatLondonDateTime(status.validityTo) : '—'}
          </p>
        ) : null}
      </div>

      <div className="border-t border-white/10">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <TrainFront className="h-3.5 w-3.5 text-accent" />
            <span className="kicker">Alertas e estações</span>
          </div>
          <span className="font-mono text-[0.5625rem] text-slate-600">
            {data?.disruptions.length === 1
              ? '1 alerta'
              : `${data?.disruptions.length ?? 0} alertas`}
          </span>
        </div>

        {data && data.disruptions.length > 0 ? (
          <div className="max-h-40 space-y-2 overflow-y-auto px-3 pb-2">
            {data.disruptions.slice(0, 6).map((disruption) => (
              <div
                key={disruption.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-2"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: STATUS_BAND_COLORS[disruption.band] }}
                  />
                  <span className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-slate-500">
                    {disruption.categoryDescription ?? disruption.category ?? 'Info'}
                  </span>
                </div>
                <p className="mt-1 text-[0.625rem] leading-relaxed text-slate-400">
                  {disruption.description ?? 'Sem descrição.'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 pb-3 text-[0.625rem] text-slate-600">
            Sem alertas ativos para esta linha.
          </p>
        )}

        <div className="max-h-52 overflow-y-auto border-t border-white/5">
          {stations.map((station) => (
            <button
              key={station.id}
              type="button"
              onClick={() => onSelectStation(station.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/[0.04]"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: STATUS_BAND_COLORS[station.status?.band ?? 'unknown'],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-slate-300">
                {station.name}
              </span>
              <span className="font-mono text-[0.5625rem] text-slate-600">
                {station.facilities.lifts !== null
                  ? `${station.facilities.lifts} lifts`
                  : 'lifts n/d'}
              </span>
              <ArrowUpRight className="h-3 w-3 text-slate-600" />
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-accent" />
          <span className="kicker">Próximas partidas</span>
        </div>
        <select
          value={arrivalStationId ?? ''}
          onChange={(event) => setArrivalStationId(event.target.value || null)}
          className="mb-2 w-full rounded-lg border border-white/10 bg-ink-950 px-2 py-1.5 text-[0.6875rem] text-slate-300 outline-none"
        >
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </select>

        {arrivals.data?.data?.arrivals.length ? (
          <div className="space-y-1.5">
            {arrivals.data.data.arrivals.map((arrival) => (
              <div key={arrival.id} className="flex items-center gap-2 text-[0.625rem]">
                <span className="w-10 shrink-0 font-mono text-accent">
                  {arrival.timeToStationSeconds !== null
                    ? `${Math.max(0, Math.round(arrival.timeToStationSeconds / 60))} min`
                    : '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-300">
                  {arrival.destinationName ?? arrival.towards ?? 'Destino não informado'}
                </span>
                <span className="truncate text-slate-600">
                  {arrival.platformName ?? 'plataforma n/d'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.625rem] text-slate-600">
            Previsões não disponíveis para esta estação/linha neste momento.
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-center">
      <p className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-slate-600">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm text-slate-200">{value}</p>
    </div>
  );
}
