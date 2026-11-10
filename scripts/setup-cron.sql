-- Supabase Cron para o London Digital Twin.
--
-- Executa este script UMA vez no projeto de produção, depois de:
--   1. aplicar as migrações (`supabase db push --include-seed`);
--   2. publicar a Edge Function `api` (`npm run supabase:deploy -- --no-verify-jwt`);
--   3. definir `LDT_CRON_SECRET` como secret da função.
--
-- Substitui antes de executar:
--   <PROJECT_REF>   ex.: abcdefghijklmnopqrst
--   <CRON_SECRET>   o mesmo valor de `LDT_CRON_SECRET`
--
-- O segredo fica no Vault, nunca numa migração nem no repositório.
-- Os jobs são idempotentes: recriar substitui os agendamentos com o mesmo nome.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'ldt_project_url', 'URL base do projeto')
where not exists (select 1 from vault.secrets where name = 'ldt_project_url');

select vault.create_secret('<CRON_SECRET>', 'ldt_cron_secret', 'Segredo partilhado com a Edge Function api')
where not exists (select 1 from vault.secrets where name = 'ldt_cron_secret');

-- Atualiza os segredos se já existirem.
update vault.secrets
set secret = 'https://<PROJECT_REF>.supabase.co'
where name = 'ldt_project_url';

update vault.secrets
set secret = '<CRON_SECRET>'
where name = 'ldt_cron_secret';

create or replace function public.ldt_cron_call(job text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text;
  secret text;
begin
  select decrypted_secret into base_url
  from vault.decrypted_secrets
  where name = 'ldt_project_url';

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'ldt_cron_secret';

  if base_url is null or secret is null then
    raise exception 'Vault sem ldt_project_url/ldt_cron_secret';
  end if;

  return net.http_post(
    url := base_url || '/functions/v1/api/sync/' || job,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.ldt_cron_call(text) from public, anon, authenticated;

-- Remove agendamentos anteriores com o mesmo nome antes de recriar.
select cron.unschedule(jobname)
from cron.job
where jobname in (
  'ldt-sync-status',
  'ldt-sync-disruptions',
  'ldt-sync-reference',
  'ldt-sync-cleanup'
);

-- Estado da rede: cada 2 minutos (a TfL atualiza com frequência).
select cron.schedule('ldt-sync-status', '*/2 * * * *', $$select public.ldt_cron_call('status')$$);
select cron.schedule('ldt-sync-disruptions', '*/5 * * * *', $$select public.ldt_cron_call('disruptions')$$);

-- Referência (linhas/estações) uma vez por dia, fora do horário de ponta.
select cron.schedule('ldt-sync-reference', '15 3 * * *', $$select public.ldt_cron_call('reference')$$);

-- Limpeza de snapshots antigos uma vez por dia.
select cron.schedule('ldt-sync-cleanup', '45 3 * * *', $$select public.ldt_cron_call('cleanup')$$);
