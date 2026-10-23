'use client';
import { Check, Copy, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import { INSTANT, SPRING_PLAYFUL } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { Button, type ButtonProps, type ButtonSize } from './button';

/* ==========================================================================
   CopyButton —— 复制到剪贴板，图标 Copy → Check 反馈。
   spec 修正点（02 §0.4 / §B15、03 §复制衰减）：
   - await clipboard.writeText 并 catch；非安全上下文回退到隐藏 textarea + execCommand；失败显示 ✕；
   - 状态机 idle → copied | error → 2.5s → idle；连点先 clearTimeout，卸载时清理计时器；
   - 对勾入场用"俏皮"弹簧 380/18/1，随后 saved-check-decay 2.5s 衰减，结束时恰好复位（不截断）；
   - 结果写进 aria-live="polite" 区域，读屏会播报"已复制"。减弱动效时无弹簧、无衰减。
   ========================================================================== */
type State = 'idle' | 'copied' | 'error';

export type CopyButtonProps = Omit<ButtonProps, 'children' | 'value' | 'onCopy' | 'onError' | 'size' | 'icon' | 'loading' | 'asChild'> & {
  /** 要复制的文本，或返回文本的函数（可异步） */
  value: string | (() => string | Promise<string>);
  /** 显示文字（默认只显示图标，正方形） */
  showLabel?: boolean;
  size?: ButtonSize;
  /** 文案：按钮名 / 成功 / 失败 */
  labels?: { copy?: string; copied?: string; failed?: string };
  /** 复位时长，默认 2500ms（与 saved-check-decay 对齐） */
  timeout?: number;
  onCopied?: (text: string) => void;
  onCopyError?: (error: unknown) => void;
};

async function writeClipboard(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* 落到回退方案 */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

export function CopyButton({
  value,
  showLabel,
  size = 'md',
  variant = 'ghost',
  labels,
  timeout = 2500,
  onCopied,
  onCopyError,
  onClick,
  className,
  'aria-label': ariaLabel,
  ...props
}: CopyButtonProps) {
  const L = { copy: 'Copy', copied: 'Copied', failed: 'Copy failed', ...labels };
  const [state, setState] = useState<State>('idle');
  const [tick, setTick] = useState(0); // 连点时重播入场与衰减
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduce = useReducedMotionPref();

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (timer.current) clearTimeout(timer.current);
    try {
      const text = typeof value === 'function' ? await value() : value;
      await writeClipboard(text);
      setState('copied');
      onCopied?.(text);
    } catch (err) {
      setState('error');
      onCopyError?.(err);
    }
    setTick((t) => t + 1);
    timer.current = setTimeout(() => setState('idle'), timeout);
  };

  const icon =
    state === 'copied' ? (
      <Check weight="bold" className={cn('text-success', !reduce && 'cds-copy-decay')} style={{ animationDuration: `${timeout}ms` }} />
    ) : state === 'error' ? (
      <X weight="bold" className="text-danger" />
    ) : (
      <Copy />
    );
  const label = state === 'copied' ? L.copied : state === 'error' ? L.failed : L.copy;

  return (
    <>
    <Button
      {...props}
      variant={variant}
      size={size}
      icon={!showLabel}
      aria-label={showLabel ? ariaLabel : (ariaLabel ?? L.copy)}
      data-state={state}
      onClick={copy}
      className={className}
    >
      <span className="relative inline-flex">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${state}-${state === 'idle' ? 0 : tick}`}
            className="inline-flex"
            initial={reduce ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: INSTANT } : { scale: 0.5, opacity: 0, transition: { duration: 0.12 } }}
            transition={reduce ? INSTANT : SPRING_PLAYFUL}
          >
            {icon}
          </motion.span>
        </AnimatePresence>
      </span>
      {showLabel && (
        // 三种文案叠在同一格里，宽度取最长者 → 切换时按钮不跳
        <span className="inline-grid">
          {(['copy', 'copied', 'failed'] as const).map((k) => (
            <span key={k} aria-hidden={L[k] !== label || undefined} className={cn('col-start-1 row-start-1', L[k] !== label && 'invisible')}>
              {L[k]}
            </span>
          ))}
        </span>
      )}
    </Button>
    <span role="status" aria-live="polite" className="sr-only">
      {state === 'copied' ? L.copied : state === 'error' ? L.failed : ''}
    </span>
    </>
  );
}
