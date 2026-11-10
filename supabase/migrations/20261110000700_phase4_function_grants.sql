-- Corrige os grants das funções da Fase 4: o Supabase concede EXECUTE a
-- anon/authenticated por default, mesmo quando se revoga de PUBLIC. As
-- funções security definer só podem ser executadas pelo service_role.

revoke all on function public.ldt_ensure_hourly_partitions(integer, integer)
  from public, anon, authenticated;
revoke all on function public.ldt_rollup_status_hourly(integer)
  from public, anon, authenticated;
revoke all on function public.ldt_network_history(timestamptz)
  from public, anon, authenticated;
revoke all on function public.ldt_top_disrupted_lines(timestamptz)
  from public, anon, authenticated;
revoke all on function public.ldt_apply_retention(integer, integer, integer, integer)
  from public, anon, authenticated;

grant execute on function public.ldt_ensure_hourly_partitions(integer, integer)
  to service_role;
grant execute on function public.ldt_rollup_status_hourly(integer)
  to service_role;
grant execute on function public.ldt_network_history(timestamptz)
  to service_role;
grant execute on function public.ldt_top_disrupted_lines(timestamptz)
  to service_role;
grant execute on function public.ldt_apply_retention(integer, integer, integer, integer)
  to service_role;
