import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useRealtimeStore } from '../store/realtimeStore';

const REALTIME_TABLES = [
  'line_status_snapshots',
  'disruptions',
  'network_status_snapshots',
] as const;

/** Invalida todas as queries afetadas por um novo snapshot/disrupção. */
const INVALIDATION_KEYS = [
  ['network'],
  ['network-status'],
  ['dashboard-summary'],
  ['dashboard-history'],
  ['data-health'],
  ['disruptions'],
  ['lines'],
  ['line-detail'],
  ['station-detail'],
  ['station-arrivals'],
  ['stations'],
  ['sources'],
] as const;

const INVALIDATE_DELAY_MS = 1_200;

/**
 * Assina alterações Realtime nas tabelas operacionais e invalida as queries.
 * O polling de 60 s em `useOperations` mantém-se como fallback quando o
 * Realtime não está configurado ou perde a ligação.
 */
export function useRealtimeSync(): void {
  const queryClient = useQueryClient();
  const setStatus = useRealtimeStore((state) => state.setStatus);
  const markEvent = useRealtimeStore((state) => state.markEvent);

  useEffect(() => {
    if (!supabase) {
      setStatus('unconfigured');
      return;
    }
    const client = supabase;

    setStatus('connecting');
    let timer: number | null = null;
    const channel = client.channel('ldt-operations');

    const flush = () => {
      timer = null;
      markEvent();
      for (const key of INVALIDATION_KEYS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    };

    // O sync grava várias linhas quase ao mesmo tempo; agrupa as invalidações.
    const schedule = () => {
      if (timer !== null) return;
      timer = window.setTimeout(flush, INVALIDATE_DELAY_MS);
    };

    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') setStatus('subscribed');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('error');
    });

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void client.removeChannel(channel);
      setStatus('unconfigured');
    };
  }, [markEvent, queryClient, setStatus]);
}
