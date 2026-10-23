'use client';
import { AnimatePresence, motion } from 'motion/react';
import { GithubLogo, GoogleLogo, WarningCircle } from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn as twMerge } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { DUR, EASE, INSTANT } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';

/* ==========================================================================
   认证区块共享零件（CDS v1 重做）：OAuthButtons / OrDivider / ShakeError / TurnstileSlot / OtpInput
   ========================================================================== */

export type OAuthProvider = 'github' | 'google';

/*
 * 共用视觉约定（CDS v1）：
 * - 卡片 / 弹窗本身不画闭合描边，输入框是视线上唯一一层闭合边框；按钮一律 secondary 柔和填充、无边框
 * - 分隔线用 box-shadow 画 1px 单向线；动效只改 transform / opacity，时长取 --cds-dur-*
 * - 父级用 `@container/auth` 声明容器，窄于 384 / 320 时逐级收紧
 */

/** 第三方登录按钮：secondary 柔和填充（单闭合边框）；容器 <320 时纵向堆叠 */
export function OAuthButtons({
  onSelect,
  disabled,
  githubLabel = 'GitHub',
  googleLabel = 'Google',
  className,
}: {
  onSelect?: (p: OAuthProvider) => void;
  disabled?: boolean;
  githubLabel?: ReactNode;
  googleLabel?: ReactNode;
  className?: string;
}) {
  return (
    <div className={twMerge('grid grid-cols-2 gap-2 @max-[320px]/auth:grid-cols-1', className)}>
      <Button type="button" variant="secondary" size="lg" className="text-body" disabled={disabled} onClick={() => onSelect?.('github')}>
        <GithubLogo weight="fill" />
        {githubLabel}
      </Button>
      <Button type="button" variant="secondary" size="lg" className="text-body" disabled={disabled} onClick={() => onSelect?.('google')}>
        <GoogleLogo weight="bold" />
        {googleLabel}
      </Button>
    </div>
  );
}

/** “或” 分隔线：两侧 1px 发丝线（box-shadow），文字 secondary 保证 AA */
export function OrDivider({ children = 'or', className }: { children?: ReactNode; className?: string }) {
  return (
    <div role="separator" className={twMerge('flex items-center gap-3 text-caption text-text-secondary', className)}>
      <span aria-hidden className="h-px flex-1 shadow-[inset_0_1px_0_0_var(--cds-border)]" />
      <span>{children}</span>
      <span aria-hidden className="h-px flex-1 shadow-[inset_0_1px_0_0_var(--cds-border)]" />
    </div>
  );
}

/**
 * 错误横幅（6% 红底：暗色弹窗 popover 表面上仍 ≥4.5:1）：出现时 opacity + translateY 渐入（200ms enter）；每次 shakeKey 变化横向抖动一次（450ms），
 * 减弱动效时只淡入、不抖。role="alert" 读屏即时播报。message 为空时移除。
 */
export function ShakeError({ message, shakeKey, className }: { message?: ReactNode; shakeKey?: number | string; className?: string }) {
  const reduce = useReducedMotionPref();
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div
          key="err"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: reduce ? INSTANT : { duration: DUR.snap, ease: EASE.out } }}
          transition={reduce ? INSTANT : { duration: DUR.base, ease: EASE.enter }}
        >
          <motion.div
            key={shakeKey}
            role="alert"
            initial={reduce ? false : { x: 0 }}
            animate={reduce ? undefined : { x: [0, -6, 6, -4, 4, -2, 0] }}
            transition={{ duration: DUR.slow, ease: EASE.out }}
            className={twMerge(
              'flex items-start gap-2 rounded-lg bg-danger-fill/6 px-3 py-2 text-footnote text-danger [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0',
              className,
            )}
          >
            <WarningCircle weight="fill" aria-hidden />
            <span className="min-w-0 flex-1 wrap-anywhere-cjk">{message}</span>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Cloudflare Turnstile 占位：300×65 柔和填充块（不用虚线框，避免在卡片里再画一层边）。
 * 传 children 时直接渲染真实组件。
 */
export function TurnstileSlot({ children, label = 'Cloudflare Turnstile', className }: { children?: ReactNode; label?: ReactNode; className?: string }) {
  if (children) return <div className={twMerge('flex justify-center', className)}>{children}</div>;
  return (
    <div className={twMerge('flex justify-center', className)}>
      <div
        aria-hidden
        className="flex h-[65px] w-full max-w-[300px] items-center justify-center rounded-lg bg-ghost-hover text-caption text-text-secondary"
      >
        {label}
      </div>
    </div>
  );
}

/**
 * 6 位验证码输入：自动前进、退格回退、←→ 移动、整段粘贴、仅数字。
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  autoFocus,
  'aria-label': ariaLabel = 'Verification code',
  digitLabel = (i: number) => `Digit ${i}`,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
  digitLabel?: (i: number) => string;
  className?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const reduce = useReducedMotionPref();
  const chars = Array.from({ length }, (_, i) => value[i] ?? '');
  // 最新值（commit 后立即更新），供 onFocus 在父组件重渲染前判断
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (!autoFocus) return;
    // 只在 autoFocus 打开时聚焦一次；当前值从 latest ref 读，避免每次输入都重新抢焦点
    const id = requestAnimationFrame(() => refs.current[Math.min(latest.current.length, length - 1)]?.focus());
    return () => cancelAnimationFrame(id);
  }, [autoFocus, length]);

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(length - 1, i))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string) => {
    const v = next.replace(/\D/g, '').slice(0, length);
    latest.current = v;
    onChange(v);
    if (v.length === length) onComplete?.(v);
  };

  const setAt = (i: number, d: string) => {
    const arr = chars.slice();
    arr[i] = d;
    // 不允许中间留空：截断到第一个空位
    const joined = arr.join('');
    commit(joined);
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (chars[i]) {
        commit(value.slice(0, i) + value.slice(i + 1));
        focusAt(i);
      } else if (i > 0) {
        commit(value.slice(0, i - 1) + value.slice(i));
        focusAt(i - 1);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusAt(Math.min(i + 1, value.length));
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const pos = Math.min(i, value.length);
      if (pos < value.length) setAt(pos, e.key);
      else commit(value + e.key);
      focusAt(pos + 1);
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    e.preventDefault();
    commit(digits);
    focusAt(Math.min(digits.length, length - 1));
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={twMerge('flex justify-center gap-2 @max-[384px]/auth:gap-1.5 @max-[320px]/auth:gap-1', className)}
    >
      {chars.map((c, i) => {
        const filled = c !== '';
        return (
          <div key={i} className="relative">
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={c}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              disabled={disabled}
              aria-label={digitLabel(i + 1)}
              aria-invalid={invalid || undefined}
              onKeyDown={onKey(i)}
              onPaste={onPaste}
              // 移动端软键盘 / 自动填充可能绕过 keydown，这里兜底
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, '');
                if (!d) return;
                if (d.length > 1) {
                  commit(value.slice(0, i) + d);
                  focusAt(i + d.length);
                } else {
                  setAt(Math.min(i, value.length), d);
                  focusAt(i + 1);
                }
              }}
              onFocus={(e) => {
                // 只允许落在第一个空位或已填位置
                if (i > latest.current.length) focusAt(latest.current.length);
                else e.currentTarget.select();
              }}
              className={twMerge(
                // 18px Mono 等宽数字（≥16px 防 iOS 缩放）；1px 内嵌发丝边，悬停加深，聚焦三层强调色焦点环（状态切换不做颜色过渡）
                'size-11 rounded-lg bg-surface-3 text-center font-mono text-[18px] tabular-nums text-text-primary caret-accent-brand outline-none',
                '@max-[384px]/auth:[@media(pointer:fine)]:size-10 @max-[320px]/auth:[@media(pointer:fine)]:w-9',
                'shadow-field hover:shadow-field-strong focus:shadow-focus disabled:opacity-50',
                invalid &&
                  'shadow-[inset_0_0_0_1px_var(--cds-fill-danger)] hover:shadow-[inset_0_0_0_1px_var(--cds-fill-danger)] focus:shadow-focus-danger',
              )}
            />
            {filled && !reduce && (
              <motion.span
                key={c + i}
                aria-hidden
                initial={{ scale: 0.85, opacity: 0.6 }}
                animate={{ scale: 1.08, opacity: 0 }}
                transition={{ duration: DUR.sheet, ease: EASE.out }}
                className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_0_0_1.5px_var(--cds-accent)]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 重新发送倒计时：start(60) 开始，left 为剩余秒数（0 表示可重发） */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  // start / reset 只依赖 setState，用 useCallback 固定引用，调用方可放心写进依赖数组
  const start = useCallback((s: number) => setLeft(s), []);
  const reset = useCallback(() => setLeft(0), []);
  return { left, start, reset };
}
