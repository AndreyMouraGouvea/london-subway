import clsx from 'clsx';
import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-white/10 bg-white/5 text-slate-300',
  accent: 'border-accent/30 bg-accent/10 text-accent',
  success: 'border-status-normal/30 bg-status-normal/10 text-status-normal',
  warning: 'border-status-attention/30 bg-status-attention/10 text-status-attention',
  danger: 'border-status-closure/30 bg-status-closure/10 text-status-closure',
  info: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={clsx('data-badge', toneClasses[tone], className)} title={title}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
