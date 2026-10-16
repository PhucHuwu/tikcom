import { fmt, fmtTime } from '../lib/format';
import type { RankItem } from '../lib/types';
import { cx } from './ui';

export interface TimelinePoint {
  minute: number;
  comments: number;
  diamonds: number;
  viewers?: number;
}

export function TimelineChart({ points }: { points: TimelinePoint[] }) {
  if (!points.length) return <p className="px-4 py-10 text-center text-sm text-ink-500">Biểu đồ sẽ hiện khi có dữ liệu.</p>;

  const W = 640;
  const H = 180;
  const top = 12;
  const n = points.length;
  const maxC = Math.max(...points.map((p) => p.comments), 1);
  const maxV = Math.max(...points.map((p) => p.viewers ?? 0), 1);
  const maxD = Math.max(...points.map((p) => p.diamonds), 1);
  const bw = W / n;
  const y = (v: number, max: number) => H - (v / max) * (H - top);
  const hasViewers = points.some((p) => p.viewers);

  const viewerPath = hasViewers ? points.map((p, i) => `${i ? 'L' : 'M'}${i * bw + bw / 2},${y(p.viewers ?? 0, maxV)}`).join(' ') : '';

  return (
    <div className="px-4 pt-4 pb-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full overflow-visible" role="img" aria-label="Biểu đồ bình luận, người xem và kim cương theo phút">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H - f * (H - top)} y2={H - f * (H - top)} stroke="var(--color-ink-800)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        ))}
        {points.map((p, i) => {
          const h = H - y(p.comments, maxC);
          return (
            <rect key={p.minute} x={i * bw + bw * 0.18} y={H - h} width={bw * 0.64} height={Math.max(h, 1)} rx={Math.min(3, bw * 0.2)} fill="var(--color-brand-500)" opacity={0.7}>
              <title>{`${fmtTime(p.minute)} · ${p.comments} bình luận${p.viewers ? ` · ${p.viewers} người xem` : ''}${p.diamonds ? ` · ${fmt(p.diamonds)} kim cương` : ''}`}</title>
            </rect>
          );
        })}
        {hasViewers ? <path d={viewerPath} fill="none" stroke="var(--color-foreign)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
        {points.map((p, i) =>
          p.diamonds ? <circle key={`d${p.minute}`} cx={i * bw + bw / 2} cy={y(p.diamonds, maxD)} r="4" fill="var(--color-gold)" stroke="var(--color-ink-900)" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null,
        )}
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
        <Legend color="bg-brand-500" label={`Bình luận/phút (cao nhất ${fmt(maxC)})`} />
        {hasViewers ? <Legend color="bg-foreign" label={`Người xem (cao nhất ${fmt(maxV)})`} /> : null}
        <Legend color="bg-gold" label="Kim cương" />
        <span className="ml-auto font-mono tabular">
          {fmtTime(points[0].minute)} – {fmtTime(points[n - 1].minute)}
        </span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={cx('size-2.5 rounded-sm', color)} />
      {label}
    </span>
  );
}

export function RankList({ items, unit, bars = false, empty = 'Chưa có dữ liệu' }: { items: RankItem[]; unit?: React.ReactNode; bars?: boolean; empty?: string }) {
  if (!items.length) return <p className="px-4 py-8 text-center text-sm text-ink-500">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="divide-y divide-ink-800/70 px-4 py-1">
      {items.map((it, i) => (
        <li key={`${it.name}-${i}`} className="flex items-center gap-3 py-2.5">
          <span className={cx('w-5 shrink-0 font-mono text-xs tabular', i === 0 ? 'font-bold text-gold' : 'text-ink-500')}>{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-ink-100">{it.name}</div>
            {bars ? (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full rounded-full bg-foreign transition-[width] duration-500" style={{ width: `${(it.value / max) * 100}%` }} />
              </div>
            ) : null}
          </div>
          <span className="flex shrink-0 items-center gap-1 font-mono text-sm font-semibold text-ink-100 tabular">
            {fmt(it.value)}
            {unit}
          </span>
        </li>
      ))}
    </ol>
  );
}
