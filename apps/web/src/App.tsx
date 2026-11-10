import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CcoPage } from './features/cco/CcoPage';

// O CCO (mapa) fica no bundle inicial; as páginas analíticas são carregadas
// quando necessário para não atrasar o primeiro render do mapa.
const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const AlertsPage = lazy(() =>
  import('./features/alerts/AlertsPage').then((module) => ({ default: module.AlertsPage })),
);
const AnalyticsPage = lazy(() =>
  import('./features/analytics/AnalyticsPage').then((module) => ({
    default: module.AnalyticsPage,
  })),
);
const ExplorerPage = lazy(() =>
  import('./features/explorer/ExplorerPage').then((module) => ({ default: module.ExplorerPage })),
);
const SourcesPage = lazy(() =>
  import('./features/sources/SourcesPage').then((module) => ({ default: module.SourcesPage })),
);
const AccountPage = lazy(() =>
  import('./features/account/AccountPage').then((module) => ({ default: module.AccountPage })),
);
const AdminPage = lazy(() =>
  import('./features/admin/AdminPage').then((module) => ({ default: module.AdminPage })),
);
const ReportPage = lazy(() =>
  import('./features/report/ReportPage').then((module) => ({ default: module.ReportPage })),
);
const NotFoundPage = lazy(() =>
  import('./features/not-found/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  })),
);

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="kicker">A carregar…</p>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<CcoPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="explorer" element={<ExplorerPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="report" element={<ReportPage />} />
          <Route path="404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
