import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { avatarTone, initials } from '../lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_6px_20px_-8px_var(--color-brand-600)]',
  secondary: 'bg-ink-800 text-ink-100 hover:bg-ink-700 ring-1 ring-inset ring-ink-700',
  ghost: 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
  danger: 'bg-brand-700/15 text-brand-300 hover:bg-brand-700/25 ring-1 ring-inset ring-brand-700/40',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  loading,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'pressable inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80', className)}
    />
  );
}

export function Avatar({ id, name, src, size = 'md' }: { id: string; name: string; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-11 text-base' : 'size-9 text-[13px]';
  if (src) {
    return <img src={src} alt={`Ảnh đại diện của ${name}`} loading="lazy" referrerPolicy="no-referrer" className={cx(dim, 'shrink-0 rounded-[30%] object-cover bg-ink-800')} />;
  }
  return <div className={cx(dim, avatarTone(id), 'grid shrink-0 place-items-center rounded-[30%] font-bold')}>{initials(name)}</div>;
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-2xl bg-ink-900 ring-1 ring-inset ring-ink-800', className)}>{children}</section>;
}

export function PanelHeader({ title, icon, children }: { title: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex min-h-14 items-center gap-3 border-b border-ink-800 px-4 py-2.5">
      {icon ? <span className="text-ink-400">{icon}</span> : null}
      <h2 className="flex-1 text-[15px] font-semibold tracking-tight text-ink-100">{title}</h2>
      {children}
    </header>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-100">{label}</span>
        {description ? <span className="mt-0.5 block text-[13px] text-ink-400">{description}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-ink-700 transition-colors duration-200 peer-checked:bg-brand-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-400" />
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-spring)] peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'pressable inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium',
        active ? 'bg-ink-100 text-ink-950' : 'bg-ink-800 text-ink-300 hover:text-ink-100',
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-ink-800 text-ink-300 ring-1 ring-inset ring-ink-700">{icon}</div>
      <p className="text-[15px] font-semibold text-ink-100">{title}</p>
      {children ? <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-pretty text-ink-400">{children}</div> : null}
    </div>
  );
}

export function Stat({ label, value, icon, hint, className }: { label: ReactNode; value: ReactNode; icon?: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cx('min-w-0 rounded-xl bg-ink-850 px-3.5 py-3 ring-1 ring-inset ring-ink-800', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tracking-tight text-ink-50 tabular">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-ink-300 ring-1 ring-inset ring-ink-700">{children}</kbd>;
}
