'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DUR, INSTANT, SPRING_CONTENT } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';

/* ==========================================================================
   Spinner
   ========================================================================== */
const spinnerSize = { xs: 'size-3', sm: 'size-3.5', md: 'size-4', lg: 'size-5', xl: 'size-6' };

export interface SpinnerProps {
  size?: keyof typeof spinnerSize;
  /** 读屏文本，默认 "Loading" */
  label?: string;
  className?: string;
}

/** 继承 currentColor 的圆环转圈 */
export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <svg
      role="status"
      aria-label={label}
      viewBox="0 0 16 16"
      fill="none"
      className={cn('shrink-0 animate-spin text-current', spinnerSize[size], className)}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ==========================================================================
   Skeleton：柔和填充 + 2s linear 105° 扫光（RTL 255°，spec §5.6）；减弱动效时为静态色块
   ========================================================================== */
export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** 圆形（头像） */
  circle?: boolean;
}

export function Skeleton({ className, circle, ...p }: SkeletonProps) {
  const reduce = useReducedMotionPref();
  return (
    <div
      aria-hidden
      data-cds="Skeleton"
      className={cn('relative h-4 overflow-hidden bg-ghost-selected', circle ? 'rounded-full' : 'rounded-md', className)}
      {...p}
    >
      {!reduce && <span className="cds-skel-band" />}
    </div>
  );
}

/* ==========================================================================
   TopLoadingBar：顶部细进度条（主题色），涓流增长；loading=false 时冲到 100% 再淡出
   ========================================================================== */
export interface TopLoadingBarProps {
  loading: boolean;
  /** fixed（默认，贴视口顶）或 absolute（贴最近的 relative 容器顶） */
  position?: 'fixed' | 'absolute';
  /** 高度 px，默认 2 */
  height?: number;
  className?: string;
  label?: string;
}

export function TopLoadingBar({ loading, position = 'fixed', height = 2, className, label = 'Loading' }: TopLoadingBarProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const reduce = useReducedMotionPref();
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 只在 loading 变化时运行；visible 读最新值，避免它变化时重置进度
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    clearTimeout(hideTimer.current);
    if (loading) {
      setVisible(true);
      setProgress(0.08);
      const id = setInterval(() => {
        setProgress((p) => {
          // 越接近 90% 越慢
          const step = p < 0.3 ? 0.06 : p < 0.6 ? 0.03 : p < 0.85 ? 0.012 : 0.003;
          return Math.min(0.94, p + step * (0.6 + Math.random() * 0.8));
        });
      }, 260);
      return () => clearInterval(id);
    }
    if (!visibleRef.current) return;
    setProgress(1);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 420);
    return () => clearTimeout(hideTimer.current);
  }, [loading]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className={cn('pointer-events-none inset-x-0 top-0 z-[80]', position, className)}
          style={{ height }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : DUR.base, delay: DUR.snap } }}
        >
          <motion.div
            className="h-full origin-left rounded-e-full bg-accent-brand shadow-[0_0_8px_var(--cds-accent)]"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progress }}
            transition={reduce ? INSTANT : SPRING_CONTENT}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 命令式控制：const bar = useTopLoadingBar(); bar.start(); bar.done(); <TopLoadingBar {...bar.props} /> */
export function useTopLoadingBar() {
  const [loading, setLoading] = useState(false);
  const start = useCallback(() => setLoading(true), []);
  const done = useCallback(() => setLoading(false), []);
  /** 包裹一个 Promise：开始 → 结束 */
  const track = useCallback(
    async <T,>(p: Promise<T>) => {
      start();
      try {
        return await p;
      } finally {
        done();
      }
    },
    [start, done],
  );
  return { loading, start, done, track, props: { loading } };
}

/* ==========================================================================
   EmptyState：柔色圆底图标 + 标题 + 说明 + 操作
   ========================================================================== */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 操作区：按钮等 */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon && (
        <span aria-hidden className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-ghost-selected text-text-secondary [&_svg]:size-5">
          {icon}
        </span>
      )}
      <h3 className="text-[15px] leading-6 font-semibold text-text-primary">{title}</h3>
      {description && <p className="mt-1 max-w-[340px] text-[13.5px] leading-5 text-text-secondary">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
