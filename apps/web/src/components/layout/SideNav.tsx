import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { BrandMark } from './BrandMark';
import { NAV_ITEMS } from './navigation';

export function SideNav() {
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-white/10 bg-ink-900/70 lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <BrandMark />
        <div className="leading-none">
          <p className="font-mono text-[0.6875rem] font-semibold tracking-[0.16em] text-slate-200">
            LONDON
          </p>
          <p className="mt-1 font-mono text-[0.5625rem] tracking-[0.22em] text-accent/90">
            DIGITAL TWIN
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <p className="kicker px-3 pb-2 pt-3">Operações</p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => clsx('nav-link group', isActive && 'nav-link-active')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="text-[0.625rem] leading-relaxed text-slate-500">
          Dados abertos da Transport for London. Projeto independente, não afiliado à TfL.
        </p>
        <p className="mt-2 font-mono text-[0.5625rem] uppercase tracking-[0.14em] text-slate-600">
          MVP · Fase 6
        </p>
      </div>
    </aside>
  );
}
