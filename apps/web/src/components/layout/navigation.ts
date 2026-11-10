import {
  Database,
  Info,
  LayoutDashboard,
  RadioTower,
  TriangleAlert,
  UserRound,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Centro de Controle',
    shortLabel: 'CCO',
    description: 'Mapa operacional da rede',
    icon: RadioTower,
    end: true,
  },
  {
    to: '/dashboard',
    label: 'Dashboard',
    shortLabel: 'Dashboard',
    description: 'KPIs e histórico',
    icon: LayoutDashboard,
  },
  {
    to: '/alerts',
    label: 'Alertas',
    shortLabel: 'Alertas',
    description: 'Disrupções e obras',
    icon: TriangleAlert,
  },
  {
    to: '/analytics',
    label: 'Análise',
    shortLabel: 'Análise',
    description: 'Grafo, resiliência e footfall',
    icon: Waypoints,
  },
  {
    to: '/explorer',
    label: 'Explorar dados',
    shortLabel: 'Dados',
    description: 'Estações, linhas e exportações',
    icon: Database,
  },
  {
    to: '/sources',
    label: 'Sobre os dados',
    shortLabel: 'Fontes',
    description: 'Fontes, licenças e limitações',
    icon: Info,
  },
  {
    to: '/account',
    label: 'Conta',
    shortLabel: 'Conta',
    description: 'Sessão, favoritos e alertas',
    icon: UserRound,
  },
] as const;

export const PAGE_TITLES: Record<string, { title: string; kicker: string }> = {
  '/': { title: 'Centro de Controle Operacional', kicker: 'Rede metroferroviária de Londres' },
  '/dashboard': { title: 'Dashboard operacional', kicker: 'Indicadores e histórico' },
  '/alerts': { title: 'Alertas e disrupções', kicker: 'Estado da rede' },
  '/analytics': { title: 'Análise da rede', kicker: 'Grafo, resiliência e footfall' },
  '/explorer': { title: 'Exploração de dados', kicker: 'Estações, linhas e exportações' },
  '/sources': { title: 'Sobre os dados', kicker: 'Fontes, licenças e limitações' },
  '/account': { title: 'Conta', kicker: 'Sessão, favoritos e alertas' },
  '/admin': { title: 'Administração', kicker: 'Saúde e jobs' },
  '/report': { title: 'Relatório operacional', kicker: 'Exportação PDF' },
};
