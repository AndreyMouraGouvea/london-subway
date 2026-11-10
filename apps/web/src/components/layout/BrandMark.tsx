export function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <div
      className={`relative shrink-0 rounded-full border-2 border-accent/80 ${className}`}
      aria-hidden="true"
    >
      <span className="absolute left-1/2 top-1/2 h-[140%] w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-accent/80" />
      <span className="absolute left-1/2 top-1/2 h-[2px] w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-accent/80" />
    </div>
  );
}
