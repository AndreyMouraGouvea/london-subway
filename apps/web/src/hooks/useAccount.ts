import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StatusBand } from '@ldt/shared';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type FavoriteEntity = 'line' | 'station';
export type AlertBand = Extract<StatusBand, 'attention' | 'severe' | 'closure'>;

export interface FavoriteRow {
  entity_type: FavoriteEntity;
  entity_id: string;
  created_at: string;
}

export interface AlertSubscriptionRow {
  line_id: string;
  min_band: AlertBand;
  browser_notifications: boolean;
}

function requireClient() {
  if (!supabase) throw new Error('Supabase não está configurado.');
  return supabase;
}

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await requireClient()
        .from('profiles')
        .select('id,email,is_admin')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { id: string; email: string | null; is_admin: boolean } | null;
    },
    enabled: Boolean(supabase && user?.id),
    staleTime: 60_000,
  });
}

export function useFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: async () => {
      const { data, error } = await requireClient()
        .from('user_favorites')
        .select('entity_type,entity_id,created_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FavoriteRow[];
    },
    enabled: Boolean(supabase && user?.id),
    staleTime: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async ({
      entityType,
      entityId,
    }: {
      entityType: FavoriteEntity;
      entityId: string;
    }) => {
      const client = requireClient();
      if (!user) throw new Error('Inicie sessão para guardar favoritos.');
      const existing = query.data?.find(
        (favorite) => favorite.entity_type === entityType && favorite.entity_id === entityId,
      );
      if (existing) {
        const { error } = await client
          .from('user_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId);
        if (error) throw new Error(error.message);
        return false;
      }
      const { error } = await client
        .from('user_favorites')
        .insert({ user_id: user.id, entity_type: entityType, entity_id: entityId });
      if (error) throw new Error(error.message);
      return true;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] });
    },
  });

  return {
    favorites: query.data ?? [],
    isLoading: query.isLoading,
    isFavorite: (entityType: FavoriteEntity, entityId: string) =>
      Boolean(
        query.data?.some(
          (favorite) => favorite.entity_type === entityType && favorite.entity_id === entityId,
        ),
      ),
    toggleFavorite: toggle.mutateAsync,
    isToggling: toggle.isPending,
  };
}

export function useAlertSubscriptions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['alert-subscriptions', user?.id];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await requireClient()
        .from('user_alert_subscriptions')
        .select('line_id,min_band,browser_notifications')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as AlertSubscriptionRow[];
    },
    enabled: Boolean(supabase && user?.id),
    staleTime: 30_000,
  });

  const upsert = useMutation({
    mutationFn: async ({
      lineId,
      minBand,
      browserNotifications,
    }: {
      lineId: string;
      minBand: AlertBand;
      browserNotifications: boolean;
    }) => {
      if (!user) throw new Error('Inicie sessão para configurar alertas.');
      const { error } = await requireClient().from('user_alert_subscriptions').upsert(
        {
          user_id: user.id,
          line_id: lineId,
          min_band: minBand,
          browser_notifications: browserNotifications,
        },
        { onConflict: 'user_id,line_id' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: async (lineId: string) => {
      if (!user) throw new Error('Inicie sessão para configurar alertas.');
      const { error } = await requireClient()
        .from('user_alert_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('line_id', lineId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    subscriptions: query.data ?? [],
    isLoading: query.isLoading,
    setSubscription: upsert.mutateAsync,
    removeSubscription: remove.mutateAsync,
    isSaving: upsert.isPending || remove.isPending,
  };
}
