import { Outlet } from 'react-router-dom';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useAuthSync } from '../../hooks/useAuthSync';
import { useBrowserAlerts } from '../../hooks/useBrowserAlerts';

export function AppShell() {
  useRealtimeSync();
  useAuthSync();
  useBrowserAlerts();

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-ink-950">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
