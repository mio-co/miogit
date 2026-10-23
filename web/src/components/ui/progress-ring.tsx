import { cn } from '@/lib/cn';
import { Legend, DataFallback } from './chart-parts';

const STROKE = ['stroke-accent-brand', 'stroke-success', 'stroke-warning', 'stroke-danger'];
export interface Ring { name: string; value: number }

/** 环形进度：支持多环同心；值 0–100，中心可放文字 */
/* [MioGit 小改] 新增可选 strokeWidth（默认 10 = 原值），小尺寸环（存储卡 36px）用细线 */
export function ProgressRing({ rings, label, center, size = 120, strokeWidth = 10, className }: { rings: Ring[]; label: string; center?: string; size?: number; strokeWidth?: number; className?: string }) {
  const sw = strokeWidth;
  return (
    <figure className={cn('inline-flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg role="img" aria-label={`${label} — ${rings.map((r) => `${r.name} ${r.value}%`).join(', ')}`} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {rings.map((r, k) => {
            const rad = size / 2 - sw / 2 - k * (sw + 4);
            const c = 2 * Math.PI * rad;
            return (
              <g key={r.name} fill="none" strokeWidth={sw}>
                <circle cx={size / 2} cy={size / 2} r={rad} className="stroke-ghost-selected" />
                <circle cx={size / 2} cy={size / 2} r={rad} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, r.value)) / 100)} className={STROKE[k % 4]} />
              </g>
            );
          })}
        </svg>
        {center && <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-text-primary">{center}</span>}
      </div>
      {rings.length > 1 && <Legend items={rings.map((r) => `${r.name} ${r.value}%`)} />}
      <DataFallback caption={label} head={['', '%']} rows={rings.map((r) => [r.name, r.value])} />
    </figure>
  );
}
