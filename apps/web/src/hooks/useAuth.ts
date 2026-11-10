import { useAuthStore } from '../store/authStore';

export function useAuth() {
  const session = useAuthStore((state) => state.session);
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  return {
    session,
    user,
    loading,
    isAuthenticated: Boolean(user),
  };
}
