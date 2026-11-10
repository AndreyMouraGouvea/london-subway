import { Link } from 'react-router-dom';
import { Activity, Database, LockKeyhole, ServerCog } from 'lucide-react';
import { formatLondonDateTime } from '@ldt/shared';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useAccount';
import { useDataHealth } from '../../hooks/useOperations';
import type { SyncJobStatus } from '@ldt/shared';

function jobTone(status: SyncJobStatus): BadgeTone {
  if (status === 'success') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'failed') return 'danger';
  return 'info';
}

export function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const profile = useProfile();
  const health = useDataHealth();

  if (authLoading || profile.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="kicker">A verificar permissões…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto max-w-[900px]">
          <EmptyState
            icon={<LockKeyhole className="h-4 w-4" />}
            title="Sessão necessária"
            description="Inicie sessão para aceder à administração."
            action={
              <Link to="/account" className="text-xs text-accent hover:underline">
                Ir para a conta
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  if (!profile.data?.is_admin) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto max-w-[900px]">
          <EmptyState
            icon={<LockKeyhole className="h-4 w-4" />}
            title="Sem permissão de administração"
            description="A sua conta não tem a flag is_admin. A promoção é feita na base de dados com service_role."
          />
        </div>
      </div>
    );
  }

  const data = health.data?.data ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Administração</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
              Saúde operacional e jobs
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Vista read-only. Não expõe service_role, segredos de cron nem escrita de dados.
            </p>
          </div>
          <Badge tone="success">is_admin</Badge>
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Fontes</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">Estado da ingestão</p>
                </div>
              </div>
              <Badge tone="neutral">{data?.sources.length ?? 0}</Badge>
            </div>
            {data && data.sources.length > 0 ? (
              <div className="divide-y divide-white/5">
                {data.sources.map((source) => (
                  <div key={source.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.625rem] text-slate-300">
                      {source.id}
                    </span>
                    <span className="hidden text-[0.625rem] text-slate-500 sm:block">
                      {source.lastSuccessAt
                        ? formatLondonDateTime(source.lastSuccessAt)
                        : 'sem sucesso'}
                    </span>
                    <Badge
                      tone={
                        source.status === 'ok'
                          ? 'success'
                          : source.status === 'error'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {source.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Database className="h-4 w-4" />}
                title={health.isLoading ? 'A carregar fontes' : 'Sem fontes'}
                description="A API de health não devolveu fontes."
                compact
              />
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <ServerCog className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Jobs</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Últimas sincronizações
                  </p>
                </div>
              </div>
              <Badge tone="neutral">{data?.jobs.length ?? 0}</Badge>
            </div>
            {data && data.jobs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[0.6875rem]">
                  <thead className="bg-white/[0.03] font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Job</th>
                      <th className="px-4 py-2 font-medium">Estado</th>
                      <th className="px-4 py-2 font-medium">Registos</th>
                      <th className="px-4 py-2 font-medium">Início</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.jobs.map((job) => (
                      <tr key={job.id} className="text-slate-400">
                        <td className="px-4 py-1.5 font-mono text-[0.625rem] text-slate-300">
                          {job.jobName}
                        </td>
                        <td className="px-4 py-1.5">
                          <Badge tone={jobTone(job.status)}>{job.status}</Badge>
                        </td>
                        <td className="px-4 py-1.5 font-mono text-[0.625rem]">
                          {job.recordsUpserted ?? '—'}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-[0.625rem]">
                          {formatLondonDateTime(job.startedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<Activity className="h-4 w-4" />}
                title={health.isLoading ? 'A carregar jobs' : 'Sem jobs'}
                description="Ainda não há sincronizações registadas."
                compact
              />
            )}
            <div className="border-t border-white/5 px-4 py-2 text-[0.625rem] leading-relaxed text-slate-600">
              Retenção: snapshots {data?.retention.statusSnapshotsDays ?? 90} d · jobs{' '}
              {data?.retention.syncJobsDays ?? 30} d · cache {data?.retention.cacheStaleHours ?? 48}{' '}
              h · arrivals {data?.retention.arrivalPredictionsHours ?? 24} h.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
