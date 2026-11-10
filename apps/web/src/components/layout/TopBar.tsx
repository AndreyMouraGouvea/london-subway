import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { formatLondonTime } from '@ldt/shared';
import { Badge } from '../ui/Badge';
import { BrandMark } from './BrandMark';
import { NAV_ITEMS, PAGE_TITLES } from './navigation';
import { useApiHealth } from '../../hooks/useApiHealth';
import { useRealtimeStore } from '../../store/realtimeStore';

function ApiStatus() {
  const { isConfigured, isLoading, isError, health, dataUpdatedAt } = useApiHealth();

  if (!isConfigured) return <Badge tone="neutral">API não configurada</Badge>;
  if (isLoading)
    return (
      <Badge tone="info" dot>
        API a verificar
      </Badge>
    );
  if (isError)
    return (
      <Badge tone="danger" dot>
        API offline
      </Badge>
    );
  if (health?.status === 'degraded') {
    return (
      <Badge tone="warning" dot>
        API degradada
      </Badge>
    );
  }
  return (
    <Badge
      tone="success"
      dot
      className="cursor-default"
      title={dataUpdatedAt ? `Última verificação: ${formatLondonTime(dataUpdatedAt)}` : undefined}
    >
      API ligada
    </Badge>
  );
}

function RealtimeStatus() {
  const status = useRealtimeStore((state) => state.status);

  if (status === 'unconfigured') return null;
  if (status === 'connecting') {
    return (
      <Badge tone="info" dot className="hidden sm:inline-flex">
        Tempo real
      </Badge>
    );
  }
  if (status === 'subscribed') {
    return (
      <Badge
        tone="success"
        dot
        className="hidden sm:inline-flex"
        title="Assinatura Realtime ativa. O polling de 60 s continua como fallback."
      >
        Tempo real
      </Badge>
    );
  }
  return (
    <Badge
      tone="warning"
      dot
      className="hidden sm:inline-flex"
      title="Realtime indisponível; a UI atualiza por polling."
    >
      Polling
    </Badge>
  );
}

export function TopBar() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const page = PAGE_TITLES[location.pathname] ?? {
    title: 'London Digital Twin',
    kicker: 'Operações',
  };
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="shrink-0 border-b border-white/10 bg-ink-950/85 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="lg:hidden">
            <BrandMark className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <p className="kicker hidden sm:block">{page.kicker}</p>
            <h1 className="truncate text-sm font-semibold tracking-tight text-slate-100 sm:text-base">
              {page.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ApiStatus />
          <RealtimeStatus />
          <div className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[0.625rem] tracking-[0.12em] text-slate-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-accent/80" />
            LON {formatLondonTime(now)}
          </div>
          <button
            type="button"
            className="icon-button"
            title="Atualizar dados"
            aria-label="Atualizar dados"
            onClick={() => {
              void queryClient.invalidateQueries();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-white/5 px-3 py-2 lg:hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.6875rem] text-slate-400',
                  isActive && 'bg-accent/10 text-accent',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {item.shortLabel}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
