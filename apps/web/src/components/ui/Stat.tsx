import clsx from 'clsx';

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'normal' | 'attention' | 'severe' | 'closure';
}) {
  const toneClass = {
    default: 'text-slate-100',
    normal: 'text-status-normal',
    attention: 'text-status-attention',
    severe: 'text-status-severe',
    closure: 'text-status-closure',
  }[tone];

  return (
    <div className="stat-card">
      <p className="kicker">{label}</p>
      <p className={clsx('mt-1.5 font-mono text-2xl font-semibold tracking-tight', toneClass)}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[0.6875rem] text-slate-500">{hint}</p> : null}
    </div>
  );
}
