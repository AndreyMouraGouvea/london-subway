import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../hooks/useAuth';
import { useFavorites, type FavoriteEntity } from '../../hooks/useAccount';

export function FavoriteButton({
  entityType,
  entityId,
  label,
}: {
  entityType: FavoriteEntity;
  entityId: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const favorites = useFavorites();
  const saved = favorites.isFavorite(entityType, entityId);

  return (
    <button
      type="button"
      className={clsx('icon-button', saved && 'border-status-closure/30 bg-status-closure/10')}
      title={
        user
          ? saved
            ? `Remover ${label ?? entityId} dos favoritos`
            : `Guardar ${label ?? entityId} nos favoritos`
          : 'Inicie sessão para guardar favoritos'
      }
      aria-label={saved ? 'Remover favorito' : 'Guardar favorito'}
      disabled={favorites.isToggling}
      onClick={() => {
        if (!user) {
          navigate('/account');
          return;
        }
        void favorites.toggleFavorite({ entityType, entityId });
      }}
    >
      <Heart
        className={clsx(
          'h-3.5 w-3.5',
          saved ? 'fill-current text-status-closure' : 'text-slate-400',
        )}
      />
    </button>
  );
}
