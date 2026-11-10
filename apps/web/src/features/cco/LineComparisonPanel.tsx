import { CircleSlash2, GitCompareArrows } from 'lucide-react';
import {
  STATUS_BAND_COLORS,
  STATUS_BAND_LABELS,
  formatLondonDateTime,
  type LineSummary,
} from '@ldt/shared';
import { Badge } from '../../components/ui/Badge';

export function LineComparisonPanel({
  lines,
  onClose,
  onSelectLine,
}: {
  lines: LineSummary[];
  onClose: () => void;
  onSelectLine: (lineId: string) => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-accent" />
          <div>
            <p className="kicker">Comparação</p>
            <p className="text-sm font-semibold text-slate-100">{lines.length} linhas</p>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
          <CircleSlash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="divide-y divide-white/5">
        {lines.map((line) => {
          const band = line.status?.band ?? 'unknown';
          return (
            <button
              key={line.id}
              type="button"
              onClick={() => onSelectLine(line.id)}
              className="flex w-full items-start gap-3 px-3 py-3 text-left transition hover:bg-white/[0.04]"
            >
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: line.colorHex ?? '#7A879C' }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-100">{line.name}</span>
                  <Badge
                    tone={
                      band === 'normal' ? 'success' : band === 'unknown' ? 'neutral' : 'warning'
                    }
                  >
                    {STATUS_BAND_LABELS[band]}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-[0.625rem] text-slate-400">
                  {line.status?.description ?? 'Sem status'}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[0.5625rem] text-slate-600">
                  <span>{line.stationCount ?? '—'} estações</span>
                  <span>
                    {line.disruptionCount === 1 ? '1 alerta' : `${line.disruptionCount} alertas`}
                  </span>
                  <span>
                    {line.updatedAt ? formatLondonDateTime(line.updatedAt) : 'sem timestamp'}
                  </span>
                </div>
              </div>
              <span
                className="mt-1 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: STATUS_BAND_COLORS[band] }}
              />
            </button>
          );
        })}
      </div>

      <p className="border-t border-white/10 px-3 py-2 text-[0.625rem] text-slate-600">
        Clica numa linha para abrir o detalhe completo. A comparação mantém até 3 linhas.
      </p>
    </div>
  );
}
