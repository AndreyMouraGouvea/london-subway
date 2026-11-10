import type { DataSourceStatus } from '@ldt/shared';
import { formatAge } from '@ldt/shared';
import { Badge, type BadgeTone } from './Badge';

const stateConfig: Record<
  DataSourceStatus | 'unconfigured',
  { label: string; tone: BadgeTone; dot: boolean }
> = {
  live: { label: 'Tempo real', tone: 'success', dot: true },
  cached: { label: 'Cache', tone: 'info', dot: false },
  stale: { label: 'Último dado', tone: 'warning', dot: false },
  unavailable: { label: 'Indisponível', tone: 'danger', dot: false },
  unconfigured: { label: 'Sem sincronização', tone: 'neutral', dot: false },
};

export function DataStateBadge({
  status,
  ageSeconds,
  className,
}: {
  status: DataSourceStatus | 'unconfigured';
  ageSeconds?: number | null;
  className?: string;
}) {
  const config = stateConfig[status];
  return (
    <Badge tone={config.tone} dot={config.dot} className={className}>
      {config.label}
      {ageSeconds !== null && ageSeconds !== undefined ? (
        <span className="opacity-70">· {formatAge(ageSeconds)}</span>
      ) : null}
    </Badge>
  );
}
