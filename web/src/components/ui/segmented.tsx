'use client';
import { useId, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { INSTANT, SPRING_PRESS } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';

/* [MioGit 小改] 滑块改为 motion layoutId 共享布局动画：滑块渲染在当前项内部，切换时由 motion 只做 transform 过渡
   （SPRING_PRESS 600/30，减弱动效瞬时）。每个实例独立 layoutId（默认 useId，可用 layoutId prop 固定，
   这样跨路由重新挂载——如 分支 / 标签 两个页面——也能从旧位置滑过来）。外观、语义、键盘行为不变。 */

/* ==========================================================================
   Segmented —— 分段胶囊（spec/02 §B2）
   轨道 999px、内边距 1px、container-type: inline-size；
   指示器纯几何：width = (100% - 2px) / N，用 translateX(i * 100%) 移动（不动 left/width，不触发布局），
   120ms --cds-ease-snap。每个实例独立，不共享 layoutId。
   语义：radiogroup + radio，←/→/↑/↓/Home/End 漫游并选中（RTL 镜像），Tab 只停在当前项。
   窄容器（2 项 ≤180px、3 项 ≤254px）时未激活项折叠为图标（需要提供 icon）。
   ========================================================================== */

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** 右侧计数徽标 */
  badge?: ReactNode;
  disabled?: boolean;
  /** 只有图标时的读屏文本 */
  'aria-label'?: string;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  /** 读屏标签（必填，描述这组选项） */
  ariaLabel: string;
  size?: 'sm' | 'md';
  /** 撑满父容器宽度 */
  block?: boolean;
  className?: string;
  /** [小改] 滑块的 motion layoutId；默认每个实例自动生成 */
  layoutId?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'sm',
  block,
  className,
  layoutId,
}: SegmentedProps<T>) {
  const name = useId();
  const reduce = useReducedMotionPref();
  const thumbId = layoutId ?? `${name}thumb`;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = options.length;
  const active = options.findIndex((o) => o.value === value);

  const move = (from: number, dir: 1 | -1 | 'first' | 'last') => {
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    if (!enabled.length) return;
    let next: number;
    if (dir === 'first') next = enabled[0];
    else if (dir === 'last') next = enabled[enabled.length - 1];
    else {
      const pos = enabled.indexOf(from);
      next = enabled[(pos + dir + enabled.length) % enabled.length];
    }
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const fwd = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const to = e.key === fwd || e.key === 'ArrowDown' ? 1 : e.key === back || e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
    if (to === null) return;
    e.preventDefault();
    move(i, to);
  };

  const h = size === 'md' ? 'h-8' : 'h-7';
  const style = { '--n': n, '--i': Math.max(0, active) } as CSSProperties;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-cds="SegmentedControl"
      data-segmented=""
      data-pills={n}
      style={style}
      className={cn(
        'cds-seg relative isolate auto-cols-fr grid-flow-col rounded-full bg-segmented-track p-px',
        block ? 'grid w-full [container-type:inline-size]' : 'inline-grid',
        h,
        className,
      )}
    >
      {options.map((o, i) => {
        const on = i === active;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            name={name}
            aria-checked={on}
            aria-label={o['aria-label'] ?? (typeof o.label === 'string' ? o.label : undefined)}
            disabled={o.disabled}
            data-active={on || undefined}
            tabIndex={on || (active < 0 && i === 0) ? 0 : -1}
            onClick={() => !on && onChange(o.value)}
            onKeyDown={onKey(i)}
            className={cn(
              'cds-seg-item cds-focus cds-hit relative isolate inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-[12.5px] whitespace-nowrap',
              'transition-colors duration-(--cds-dur-snap) ease-swift disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0',
              on ? 'font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {on && (
              <motion.span
                aria-hidden
                layoutId={thumbId}
                transition={reduce ? INSTANT : SPRING_PRESS}
                className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-segmented-thumb shadow-segmented-thumb"
              />
            )}
            {o.icon}
            {o.label != null && <span className="cds-seg-label truncate">{o.label}</span>}
            {o.badge != null && (
              <span className="ms-0.5 rounded-full bg-ghost-selected px-1.5 font-mono text-[10px] leading-4 tabular-nums dark:text-text-primary">
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
