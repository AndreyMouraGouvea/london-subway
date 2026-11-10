-- Fase 6: perfis, favoritos e subscrições de alertas por utilizador.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
on public.profiles for select to authenticated
using (auth.uid() = id);

grant select on public.profiles to authenticated;

-- O perfil é criado automaticamente quando nasce um utilizador. O trigger é
-- security definer porque escreve numa tabela com RLS.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Utilizadores já existentes (ambiente local).
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

create table public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('line', 'station')),
  entity_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create index user_favorites_user_idx on public.user_favorites (user_id, created_at desc);

alter table public.user_favorites enable row level security;

create policy "read own favorites"
on public.user_favorites for select to authenticated
using (auth.uid() = user_id);

create policy "insert own favorites"
on public.user_favorites for insert to authenticated
with check (auth.uid() = user_id);

create policy "delete own favorites"
on public.user_favorites for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, delete on public.user_favorites to authenticated;

create table public.user_alert_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  line_id text not null references public.lines(id) on delete cascade,
  min_band text not null default 'attention'
    check (min_band in ('attention', 'severe', 'closure')),
  browser_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, line_id)
);

create index user_alert_subscriptions_user_idx
  on public.user_alert_subscriptions (user_id, created_at desc);

alter table public.user_alert_subscriptions enable row level security;

create policy "read own alert subscriptions"
on public.user_alert_subscriptions for select to authenticated
using (auth.uid() = user_id);

create policy "insert own alert subscriptions"
on public.user_alert_subscriptions for insert to authenticated
with check (auth.uid() = user_id);

create policy "update own alert subscriptions"
on public.user_alert_subscriptions for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "delete own alert subscriptions"
on public.user_alert_subscriptions for delete to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_alert_subscriptions to authenticated;

comment on table public.profiles is
  'Perfil público mínimo; is_admin só deve ser alterado com service_role.';
comment on table public.user_favorites is
  'Linhas e estações guardadas pelo utilizador. RLS por auth.uid().';
comment on table public.user_alert_subscriptions is
  'Subscrições de alertas por linha; não envia email, apenas preferências e notificações do browser.';
