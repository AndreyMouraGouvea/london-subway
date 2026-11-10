import type { ReactNode } from 'react';
import { ArrowUpRight, CircleSlash2, Clock3, MapPin, Route, ShieldQuestion } from 'lucide-react';
import {
  LINE_BRANDING_BY_ID,
  STATUS_BAND_COLORS,
  STATUS_BAND_LABELS,
  formatAge,
  formatLondonDateTime,
} from '@ldt/shared';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { FavoriteButton } from '../../components/ui/FavoriteButton';
import { useStationArrivals, useStationDetail } from '../../hooks/useOperations';

function bandTone(band: string): BadgeTone {
  if (band === 'closure') return 'danger';
  if (band === 'severe') return 'warning';
  if (band === 'attention') return 'warning';
  if (band === 'normal') return 'success';
  return 'neutral';
}

export function StationPanel({
  stationId,
  onClose,
  onSelectLine,
}: {
  stationId: string;
  onClose: () => void;
  onSelectLine: (lineId: string) => void;
}) {
  const detail = useStationDetail(stationId);
  const arrivals = useStationArrivals(stationId, null, 8);
  const data = detail.data?.data ?? null;
  const meta = detail.data?.meta ?? null;
  const station = data?.station ?? null;

  if (detail.isLoading) {
    return (
      <div className="panel overflow-hidden">
        <PanelHeader title="Estação" onClose={onClose} />
        <EmptyState
          title="A carregar estação"
          description="A consultar facilities e previsões."
          compact
        />
      </div>
    );
  }

  if (!station) {
    return (
      <div className="panel overflow-hidden">
        <PanelHeader title="Estação" onClose={onClose} />
        <EmptyState
          title="Estação indisponível"
          description="O detalhe não pôde ser carregado."
          compact
        />
      </div>
    );
  }

  const band = station.status?.band ?? 'unknown';

  return (
    <div className="panel overflow-hidden">
      <PanelHeader
        title={station.name}
        subtitle={`${station.id}${station.zone ? ` · zona ${station.zone}` : ''}`}
        onClose={onClose}
        badge={
          <div className="flex items-center gap-2">
            <FavoriteButton entityType="station" entityId={station.id} label={station.name} />
            <DataStateBadge
              status={meta?.dataSourceStatus ?? 'unconfigured'}
              ageSeconds={meta?.ageSeconds}
            />
          </div>
        }
      />

      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={bandTone(band)}>{station.status?.label ?? STATUS_BAND_LABELS[band]}</Badge>
          <Badge tone={station.stepFree === true ? 'success' : 'neutral'}>
            {station.stepFree === true
              ? 'step-free'
              : station.stepFree === false
                ? 'sem step-free'
                : 'step-free não informado'}
          </Badge>
          <Badge tone="neutral">{station.modes.join(' · ') || 'modo n/d'}</Badge>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {station.lineIds.map((lineId) => {
            const branding = LINE_BRANDING_BY_ID[lineId];
            return (
              <button
                key={lineId}
                type="button"
                onClick={() => onSelectLine(lineId)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.625rem] text-slate-300 transition hover:bg-white/[0.07]"
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: branding?.colorHex ?? '#7A879C' }}
                />
                {branding?.name ?? lineId}
              </button>
            );
          })}
        </div>

        {station.status ? (
          <p className="text-[0.625rem] leading-relaxed text-slate-500">
            Status derivado das linhas servidas:{' '}
            {station.status.derivedFromLineIds
              .map((lineId) => LINE_BRANDING_BY_ID[lineId]?.name ?? lineId)
              .join(', ')}
            .
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Facility label="Lifts" value={station.facilities.lifts} />
          <Facility label="Escadas" value={station.facilities.escalators} />
          <Facility label="WC" value={boolLabel(station.facilities.toilets)} />
          <Facility label="WiFi" value={boolLabel(station.facilities.wifi)} />
          <Facility label="Parking" value={boolLabel(station.facilities.parking)} />
          <Facility label="Ticket halls" value={station.facilities.ticketHalls} />
        </div>

        <div className="flex items-center justify-between gap-2 text-[0.625rem] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            referência {formatLondonDateTime(station.updatedAt)}
          </span>
          <span>{meta?.ageSeconds ? formatAge(meta.ageSeconds) : ''}</span>
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Route className="h-3.5 w-3.5 text-accent" />
          <span className="kicker">Entradas</span>
        </div>
        {data && data.entrances.length > 0 ? (
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {data.entrances.map((entrance) => (
              <div
                key={entrance.id}
                className="flex items-center gap-2 text-[0.625rem] text-slate-400"
              >
                <MapPin className="h-3 w-3 text-slate-600" />
                <span className="min-w-0 flex-1 truncate">
                  {entrance.name ?? entrance.stopType ?? entrance.id}
                </span>
                <span className="font-mono text-slate-600">
                  {entrance.lat.toFixed(4)}, {entrance.lon.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.625rem] text-slate-600">Entradas não informadas.</p>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <ShieldQuestion className="h-3.5 w-3.5 text-status-attention" />
          <span className="kicker">Alertas da estação</span>
        </div>
        {data && data.disruptions.length > 0 ? (
          <div className="max-h-32 space-y-2 overflow-y-auto">
            {data.disruptions.map((disruption) => (
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
          <p className="text-[0.625rem] text-slate-600">Sem alertas específicos desta estação.</p>
        )}
      </div>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ArrowUpRight className="h-3.5 w-3.5 text-accent" />
            <span className="kicker">Próximas partidas</span>
          </div>
          <Badge tone={arrivals.data?.meta.dataSourceStatus === 'stale' ? 'warning' : 'neutral'}>
            {arrivals.data?.meta.dataSourceStatus ?? '—'}
          </Badge>
        </div>
        {arrivals.data?.data?.arrivals.length ? (
          <div className="max-h-52 space-y-1.5 overflow-y-auto">
            {arrivals.data.data.arrivals.map((arrival) => (
              <div key={arrival.id} className="flex items-center gap-2 text-[0.625rem]">
                <span className="w-9 shrink-0 font-mono text-accent">
                  {arrival.timeToStationSeconds !== null
                    ? `${Math.max(0, Math.round(arrival.timeToStationSeconds / 60))}m`
                    : '—'}
                </span>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      LINE_BRANDING_BY_ID[arrival.lineId ?? '']?.colorHex ?? '#7A879C',
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-slate-300">
                  {arrival.destinationName ?? arrival.towards ?? 'Destino n/d'}
                </span>
                <span className="max-w-[80px] truncate text-slate-600">
                  {arrival.platformName ?? 'plataforma n/d'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.625rem] text-slate-600">
            Previsões não disponíveis para esta estação neste momento.
          </p>
        )}
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  badge,
  onClose,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="panel-header">
      <div className="min-w-0">
        <p className="kicker">Estação</p>
        <p className="truncate text-sm font-semibold text-slate-100">{title}</p>
        {subtitle ? (
          <p className="truncate font-mono text-[0.5625rem] text-slate-600">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {badge}
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
          <CircleSlash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Facility({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-center">
      <p className="font-mono text-[0.5625rem] uppercase tracking-[0.08em] text-slate-600">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-xs text-slate-200">{value ?? 'n/d'}</p>
    </div>
  );
}

function boolLabel(value: boolean | null): string {
  if (value === null) return 'n/d';
  return value ? 'sim' : 'não';
}
