import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, Heart, Loader2, LogOut, Shield, Trash2, UserRound } from 'lucide-react';
import { LINE_BRANDING_BY_ID } from '@ldt/shared';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../hooks/useAuth';
import {
  useAlertSubscriptions,
  useFavorites,
  useProfile,
  type AlertBand,
} from '../../hooks/useAccount';
import { useLines, useStations } from '../../hooks/useOperations';
import { signInWithPassword, signOut, signUpWithPassword } from '../../lib/auth';

type AuthMode = 'signin' | 'signup';

const BAND_OPTIONS: Array<{ value: AlertBand; label: string }> = [
  { value: 'attention', label: 'Atenção ou pior' },
  { value: 'severe', label: 'Severa ou fecho' },
  { value: 'closure', label: 'Apenas fecho' },
];

export function AccountPage() {
  const { user, loading: authLoading } = useAuth();
  const profile = useProfile();
  const favorites = useFavorites();
  const lines = useLines();
  const stations = useStations();
  const subscriptions = useAlertSubscriptions();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));

  const lineById = useMemo(
    () => new Map((lines.data?.data ?? []).map((line) => [line.id, line])),
    [lines.data],
  );
  const stationById = useMemo(
    () => new Map((stations.data?.data ?? []).map((station) => [station.id, station])),
    [stations.data],
  );
  const subscriptionByLine = useMemo(
    () => new Map(subscriptions.subscriptions.map((item) => [item.line_id, item])),
    [subscriptions.subscriptions],
  );

  const favoriteLines = favorites.favorites.filter((item) => item.entity_type === 'line');
  const favoriteStations = favorites.favorites.filter((item) => item.entity_type === 'station');

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === 'signin') {
        await signInWithPassword(email.trim(), password);
      } else {
        const signedIn = await signUpWithPassword(email.trim(), password);
        if (!signedIn) {
          setMessage('Conta criada. Confirme o email antes de iniciar sessão.');
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  };

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  if (!envIsConfigured()) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-[900px] p-6">
          <EmptyState
            icon={<UserRound className="h-4 w-4" />}
            title="Autenticação não configurada"
            description="Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para ativar conta, favoritos e alertas."
          />
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="kicker">A carregar sessão…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto grid max-w-[1000px] gap-5 p-4 lg:grid-cols-[0.9fr_1.1fr] lg:p-6">
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-accent" />
                <div>
                  <p className="kicker">Conta</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Entrar na plataforma
                  </p>
                </div>
              </div>
            </div>
            <form className="space-y-3 p-4" onSubmit={onSubmit}>
              <label className="block text-xs text-slate-400">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 focus:border-accent/40 focus:outline-none"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Palavra-passe
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 focus:border-accent/40 focus:outline-none"
                />
              </label>
              {error ? <p className="text-xs text-status-closure">{error}</p> : null}
              {message ? <p className="text-xs text-status-attention">{message}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {mode === 'signin' ? 'Entrar' : 'Criar conta'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                  setMessage(null);
                }}
                className="w-full text-center text-[0.6875rem] text-slate-500 hover:text-slate-300"
              >
                {mode === 'signin' ? 'Ainda não tem conta? Criar conta' : 'Já tem conta? Entrar'}
              </button>
            </form>
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <p className="kicker">O que fica disponível</p>
            </div>
            <div className="space-y-3 p-4 text-xs leading-relaxed text-slate-400">
              <p className="flex gap-2">
                <Heart className="mt-0.5 h-4 w-4 shrink-0 text-status-closure" />
                Guardar linhas e estações favoritas; os favoritos aparecem no CCO e na sua conta.
              </p>
              <p className="flex gap-2">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-status-attention" />
                Subscrever linhas e escolher o nível mínimo de alerta.
              </p>
              <p className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-normal" />
                Notificações do browser enquanto a aplicação estiver aberta (sem serviço de push).
              </p>
              <p className="text-slate-500">
                A conta usa Supabase Auth. A chave pública é a anon key; os dados de utilizador
                ficam protegidos por RLS.
              </p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="kicker">Conta e preferências</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">
              A minha conta
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {user.email}
              {profile.data?.is_admin ? ' · administrador' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {profile.data?.is_admin ? (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-accent"
              >
                <Shield className="h-3 w-3" />
                Administração
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-slate-400 hover:text-slate-200"
            >
              <LogOut className="h-3 w-3" />
              Sair
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-status-closure" />
                <div>
                  <p className="kicker">Favoritos</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">
                    Linhas e estações guardadas
                  </p>
                </div>
              </div>
              <Badge tone="neutral">{favorites.favorites.length}</Badge>
            </div>
            {favorites.favorites.length > 0 ? (
              <div className="divide-y divide-white/5">
                {favoriteLines.map((favorite) => {
                  const line = lineById.get(favorite.entity_id);
                  return (
                    <div
                      key={`line-${favorite.entity_id}`}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            line?.colorHex ??
                            LINE_BRANDING_BY_ID[favorite.entity_id]?.colorHex ??
                            '#7A879C',
                        }}
                      />
                      <Link
                        to={`/?line=${encodeURIComponent(favorite.entity_id)}`}
                        className="min-w-0 flex-1 truncate text-xs text-slate-200 hover:text-accent"
                      >
                        {line?.name ?? favorite.entity_id}
                      </Link>
                      <Badge tone="neutral">linha</Badge>
                      <button
                        type="button"
                        className="icon-button h-7 w-7"
                        aria-label="Remover favorito"
                        onClick={() =>
                          void favorites.toggleFavorite({
                            entityType: 'line',
                            entityId: favorite.entity_id,
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {favoriteStations.map((favorite) => {
                  const station = stationById.get(favorite.entity_id);
                  return (
                    <div
                      key={`station-${favorite.entity_id}`}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
                      <Link
                        to={`/?station=${encodeURIComponent(favorite.entity_id)}`}
                        className="min-w-0 flex-1 truncate text-xs text-slate-200 hover:text-accent"
                      >
                        {station?.name ?? favorite.entity_id}
                      </Link>
                      <Badge tone="neutral">estação</Badge>
                      <button
                        type="button"
                        className="icon-button h-7 w-7"
                        aria-label="Remover favorito"
                        onClick={() =>
                          void favorites.toggleFavorite({
                            entityType: 'station',
                            entityId: favorite.entity_id,
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Heart className="h-4 w-4" />}
                title="Sem favoritos"
                description="Abra uma linha ou estação no CCO e use o coração para guardar."
                compact
              />
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-status-attention" />
                <div>
                  <p className="kicker">Alertas personalizados</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">As minhas linhas</p>
                </div>
              </div>
              <Badge tone="neutral">{subscriptions.subscriptions.length}</Badge>
            </div>
            <div className="max-h-[430px] divide-y divide-white/5 overflow-y-auto">
              {(lines.data?.data ?? []).map((line) => {
                const subscription = subscriptionByLine.get(line.id);
                return (
                  <div key={line.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: line.colorHex ?? '#7A879C' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                      {line.name}
                    </span>
                    <label className="flex items-center gap-1 text-[0.625rem] text-slate-500">
                      <input
                        type="checkbox"
                        checked={Boolean(subscription)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            void subscriptions.setSubscription({
                              lineId: line.id,
                              minBand: 'attention',
                              browserNotifications: true,
                            });
                          } else {
                            void subscriptions.removeSubscription(line.id);
                          }
                        }}
                      />
                      subscrever
                    </label>
                    <select
                      value={subscription?.min_band ?? 'attention'}
                      disabled={!subscription}
                      onChange={(event) =>
                        void subscriptions.setSubscription({
                          lineId: line.id,
                          minBand: event.target.value as AlertBand,
                          browserNotifications: subscription?.browser_notifications ?? true,
                        })
                      }
                      className="rounded-md border border-white/10 bg-ink-900 px-1.5 py-1 text-[0.625rem] text-slate-300 disabled:opacity-40"
                    >
                      {BAND_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[0.625rem] text-slate-500">
                      <input
                        type="checkbox"
                        checked={subscription?.browser_notifications ?? false}
                        disabled={!subscription}
                        onChange={(event) =>
                          void subscriptions.setSubscription({
                            lineId: line.id,
                            minBand: subscription?.min_band ?? 'attention',
                            browserNotifications: event.target.checked,
                          })
                        }
                      />
                      browser
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-white/5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.625rem] leading-relaxed text-slate-500">
                  As notificações do browser só funcionam com a aplicação aberta; não há serviço de
                  push.
                </p>
                <button
                  type="button"
                  onClick={() => void requestNotifications()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-slate-400 hover:text-slate-200"
                >
                  {notificationPermission === 'granted' ? 'Permitido' : 'Ativar notificações'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function envIsConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
  );
}
