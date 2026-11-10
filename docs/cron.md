# Supabase Cron — agendamento

A Fase 2 expõe rotas de sincronização protegidas por `x-cron-secret`. O agendamento com
`pg_cron` + `pg_net` + Vault deve ser aplicado no projeto Supabase hospedado (o Supabase local
pode não ter `pg_cron`/`pg_net` disponíveis).

## Segredos no Vault

```sql
select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/api',
  'ldt_api_url'
);

select vault.create_secret(
  '<LDT_CRON_SECRET>',
  'ldt_cron_secret'
);
```

## Função de invocação

```sql
create or replace function public.ldt_invoke_sync(p_path text)
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'ldt_api_url'
    ) || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'ldt_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$;
```

## Agendamentos sugeridos

```sql
-- Referência: diariamente às 03:10 UTC
select cron.schedule(
  'ldt-sync-reference',
  '10 3 * * *',
  $$select public.ldt_invoke_sync('/sync/reference')$$
);

-- Status: a cada minuto
select cron.schedule(
  'ldt-sync-status',
  '* * * * *',
  $$select public.ldt_invoke_sync('/sync/status')$$
);

-- Disrupções: a cada minuto
select cron.schedule(
  'ldt-sync-disruptions',
  '* * * * *',
  $$select public.ldt_invoke_sync('/sync/disruptions')$$
);

-- Limpeza: a cada hora
select cron.schedule(
  'ldt-sync-cleanup',
  '5 * * * *',
  $$select public.ldt_invoke_sync('/sync/cleanup')$$
);
```

## Observações

- `sync-reference` faz ~43 chamadas à TfL. Sem `app_key`, o cliente usa concorrência conservadora.
- `sync-status` e `sync-disruptions` devem correr a cada 60 s para manter o CCO atualizado.
- O TTL de status é 60 s; a UI mostra `stale` quando o snapshot envelhece.
- Os jobs registam início, fim, estado, contagens e erro em `public.data_sync_jobs`.
- `sync-cleanup` chama `public.ldt_apply_retention`, que remove arrivals antigos, cache
  expirado, snapshots e jobs fora da retenção e faz drop das partições horárias antigas.
- `sync-status` atualiza os agregados horários com `public.ldt_rollup_status_hourly`;
  não é necessário um job separado para o histórico.
- O Realtime não substitui o cron: se os snapshots não forem gravados, não há evento
  para o browser receber. O polling de 60 s cobre falhas da ligação Realtime.
- Nunca colocar o segredo diretamente em SQL versionado; usar Vault.
