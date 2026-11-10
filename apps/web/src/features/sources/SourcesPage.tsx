import {
  CheckCircle2,
  Database,
  ExternalLink,
  Info,
  Map as MapIcon,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { DATA_SOURCES, formatLondonDateTime } from '@ldt/shared';
import { Badge } from '../../components/ui/Badge';
import { DataStateBadge } from '../../components/ui/DataStateBadge';
import { useSources } from '../../hooks/useOperations';

function sourceTone(status: string) {
  if (status === 'ok') return 'success' as const;
  if (status === 'degraded') return 'warning' as const;
  if (status === 'error') return 'danger' as const;
  return 'neutral' as const;
}

function sourceLabel(status: string) {
  if (status === 'ok') return 'Disponível';
  if (status === 'degraded') return 'Degradada';
  if (status === 'error') return 'Erro';
  if (status === 'not_synced') return 'Não sincronizado';
  return 'Desconhecido';
}

export function SourcesPage() {
  const sourcesQuery = useSources();
  const liveSources = new Map((sourcesQuery.data?.data ?? []).map((source) => [source.id, source]));
  const dataStatus = sourcesQuery.data?.meta.dataSourceStatus ?? 'unconfigured';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Transparência e conformidade</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
              Sobre os dados
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              Este projeto usa dados abertos da Transport for London e um basemap baseado em
              OpenStreetMap. Não é afiliado, endossado ou patrocinado pela TfL. As marcas e os dados
              pertencem aos respetivos titulares.
            </p>
          </div>
          <DataStateBadge status={dataStatus} ageSeconds={sourcesQuery.data?.meta.ageSeconds} />
        </div>

        <section className="panel overflow-hidden">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" />
              <div>
                <p className="kicker">Catálogo</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-100">Fontes utilizadas</p>
              </div>
            </div>
            <Badge tone="neutral">{DATA_SOURCES.length} fontes</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] font-mono text-[0.5625rem] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fonte</th>
                  <th className="px-4 py-2.5 font-medium">Publicador</th>
                  <th className="px-4 py-2.5 font-medium">Atualização</th>
                  <th className="px-4 py-2.5 font-medium">Licença</th>
                  <th className="px-4 py-2.5 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {DATA_SOURCES.map((source) => {
                  const live = liveSources.get(source.id);
                  const status = live?.status ?? source.status;
                  return (
                    <tr key={source.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 align-top">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-slate-200 hover:text-accent"
                        >
                          {source.name}
                          <ExternalLink className="h-3 w-3 text-slate-600" />
                        </a>
                        <p className="mt-1 max-w-md text-[0.625rem] leading-relaxed text-slate-600">
                          {source.notes}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-400">{source.publisher}</td>
                      <td className="px-4 py-3 align-top text-[0.625rem] text-slate-500">
                        <p>{source.refreshPolicy}</p>
                        {live?.lastSuccessAt ? (
                          <p className="mt-1 font-mono text-[0.5625rem] text-slate-600">
                            último sucesso {formatLondonDateTime(live.lastSuccessAt)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <a
                          href={source.licenseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[0.625rem] text-slate-400 hover:text-accent"
                        >
                          {source.license}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <Badge tone={sourceTone(status)}>{sourceLabel(status)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="panel p-4">
            <div className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-status-attention" />
              <p className="text-sm font-semibold text-slate-100">Limitações importantes</p>
            </div>
            <ul className="mt-3 space-y-2 text-[0.6875rem] leading-relaxed text-slate-500">
              <li>
                <strong className="text-slate-300">Status de estação é derivado.</strong> A TfL não
                expõe um status de estação equivalente ao status de linha; usamos linhas servidas e
                disrupções da estação, com rótulo explícito.
              </li>
              <li>
                <strong className="text-slate-300">Ocupação não é tempo real.</strong> Os datasets
                de crowding, footfall e RODS são históricos/típicos. Não há occupancy live confiável
                na Unified API.
              </li>
              <li>
                <strong className="text-slate-300">Step-free não é inferido.</strong>{' '}
                <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-[0.625rem] text-slate-300">
                  AccessViaLift
                </code>{' '}
                não equivale a step-free completo. Até ingerir o feed oficial, o valor fica como
                “não informado”.
              </li>
              <li>
                <strong className="text-slate-300">Fechamentos noturnos.</strong> “Service Closed”
                pode ser o encerramento normal fora do horário de operação; a UI separa `closed` de
                `disrupted` e explica.
              </li>
              <li>
                <strong className="text-slate-300">Estações afetadas.</strong> Quando a TfL devolve
                `affectedStops` vazio, mostramos “não informado”, nunca zero.
              </li>
            </ul>
          </section>

          <section className="panel p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-status-normal" />
              <p className="text-sm font-semibold text-slate-100">Atribuição e licenças</p>
            </div>
            <div className="mt-3 space-y-3 text-[0.6875rem] leading-relaxed text-slate-500">
              <p>
                <strong className="text-slate-300">Transport for London:</strong> “Information
                supplied by Transport for London”. O uso está sujeito aos Transport Data Terms and
                Conditions da TfL.
              </p>
              <p>
                <strong className="text-slate-300">Cores das linhas:</strong> derivadas dos valores
                RGB oficiais do TfL Colour Standard, Issue 11 (agosto de 2026). O projeto não usa o
                roundel nem o logotipo da TfL.
              </p>
              <p>
                <strong className="text-slate-300">Basemap:</strong> OpenFreeMap e © OpenStreetMap
                contributors, sob ODbL.
              </p>
              <p>
                <strong className="text-slate-300">Independência:</strong> este é um projeto
                independente de digital twin e não é afiliado à TfL. Não uses os dados para sugerir
                endosso oficial.
              </p>
            </div>
          </section>
        </div>

        <section className="panel p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-normal" />
            <p className="text-sm font-semibold text-slate-100">Validação da API (Fase 0)</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {[
              [
                'Arrivals',
                'O endpoint correto é /StopPoint/{id}/Arrivals; /ArrivalPredictions devolve 404.',
              ],
              ['Elizabeth line', 'O modo é elizabeth-line; tflrail devolve 400.'],
              [
                'Geometria',
                'Vem de /Line/{id}/Route/Sequence/{direction} em lineStrings; /Line/{id}/Route só traz metadados.',
              ],
              [
                'Frescura',
                'line.modified não é confiável como timestamp de status; usamos fetchedAt e validityPeriods.',
              ],
              [
                'Crowding',
                '/StopPoint/{id}/Crowding/{line} devolveu 404; usamos datasets históricos.',
              ],
              [
                'Severidade',
                'O mapa é por modo via /Line/Meta/Severity; não assumimos uma tabela global.',
              ],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-accent/80">
                  {title}
                </p>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-[0.625rem] leading-relaxed text-slate-500">
            Os dados operacionais só aparecem depois de uma coleta real. Este projeto não preenche
            lacunas com valores simulados: quando a fonte falha, mostra cache, último dado
            disponível ou indisponibilidade — sempre com timestamp e origem.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[0.625rem] text-slate-600">
          <MapIcon className="h-3.5 w-3.5" />
          <span>
            Basemap: OpenFreeMap / OpenStreetMap. Dados operacionais: Transport for London.
          </span>
        </div>
      </div>
    </div>
  );
}
