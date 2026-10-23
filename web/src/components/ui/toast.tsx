'use client';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, Info, Warning, WarningCircle } from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { DUR, INSTANT, SPRING_CONTENT } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { Button } from './button';
import { CloseButton } from './close-button';
import { Portal } from './overlay';

/* ==========================================================================
   Toast：轻提示（命令式 toast() + 页面里放一个 <Toaster />）。
   - 堆叠：最新一条在最前，较早的在后面露出 8px 并缩小；鼠标悬停 / 键盘聚焦 / 轻点通知区时展开成列表
   - 带操作按钮（如「撤销」）；加载 → 成功 / 失败：toast.loading() 后 toast.update()，或 toast.promise()
   - 读屏：通知区外常驻两个 aria-live 区（polite / assertive），每条出现或状态变化时播报其文字一次；
     错误用 assertive，其余 polite。Toast 从不抢焦点；按 F8（hotkey）可跳进通知区，Esc 回到原处
   - 计时：默认 5s（警告 6s、错误 / 带操作 8s、加载中不自动关），悬停、聚焦、页面隐藏时暂停
   - 关闭按钮触屏命中区 44px；375px 下通知区贴左右 12px 全宽
   - 动效：只动 transform / opacity（入场上浮 + 淡入，堆叠位移 / 缩放用 320/28 内容弹簧，退场 200ms 淡出）；减弱动效时瞬时
   ========================================================================== */

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** 操作按钮（点击后关闭这条） */
  action?: ToastAction;
  /** 毫秒；Infinity 不自动关闭 */
  duration?: number;
  /** 投递到哪个 <Toaster id>（页面里有多个通知区时） */
  toaster?: string;
  /** 是否显示关闭按钮，默认 true */
  dismissible?: boolean;
  /** 关闭（含自动关闭）时回调 */
  onDismiss?: () => void;
}

interface ToastRecord extends Omit<ToastOptions, 'id'> {
  id: string;
  /** 每次 update 递增：重新计时、重新播报 */
  rev: number;
}

/* ---------- 全局存储 ---------- */
let records: ToastRecord[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => records;
const EMPTY: ToastRecord[] = [];
const getServerSnapshot = () => EMPTY;

function add(opts: ToastOptions): string {
  const id = opts.id ?? `t${++seq}`;
  if (records.some((r) => r.id === id)) return update(id, opts);
  records = [{ ...opts, id, rev: 0 }, ...records];
  emit();
  return id;
}
function update(id: string, patch: Partial<ToastOptions>): string {
  records = records.map((r) => (r.id === id ? { ...r, ...patch, id, rev: r.rev + 1 } : r));
  emit();
  return id;
}
function dismiss(id?: string) {
  const gone = id ? records.filter((r) => r.id === id) : records;
  records = id ? records.filter((r) => r.id !== id) : [];
  emit();
  gone.forEach((r) => r.onDismiss?.());
}

type Shortcut = (title: ReactNode, opts?: Omit<ToastOptions, 'title' | 'variant'>) => string;
const variantShortcut =
  (variant: ToastVariant): Shortcut =>
  (title, opts) =>
    add({ ...opts, title, variant });

export const toast = Object.assign((opts: ToastOptions | string) => add(typeof opts === 'string' ? { title: opts } : opts), {
  success: variantShortcut('success'),
  error: variantShortcut('error'),
  warning: variantShortcut('warning'),
  info: variantShortcut('info'),
  loading: variantShortcut('loading'),
  update,
  dismiss,
  /** 加载 → 成功 / 失败；返回原 promise */
  promise<T>(
    p: Promise<T>,
    msg: {
      loading: ReactNode;
      success: ReactNode | ((v: T) => ReactNode);
      error: ReactNode | ((e: unknown) => ReactNode);
      description?: { loading?: ReactNode; success?: ReactNode; error?: ReactNode };
      /** 只在对应状态出现的操作按钮（如失败后「重试」）；opts.action 则三种状态都显示 */
      action?: { loading?: ToastAction; success?: ToastAction; error?: ToastAction };
    },
    opts?: Omit<ToastOptions, 'title' | 'variant'>,
  ): Promise<T> {
    const id = add({
      ...opts,
      title: msg.loading,
      description: msg.description?.loading,
      action: msg.action?.loading ?? opts?.action,
      variant: 'loading',
    });
    p.then(
      (v) =>
        update(id, {
          variant: 'success',
          title: typeof msg.success === 'function' ? (msg.success as (v: T) => ReactNode)(v) : msg.success,
          description: msg.description?.success,
          action: msg.action?.success ?? opts?.action,
        }),
      (e) =>
        update(id, {
          variant: 'error',
          title: typeof msg.error === 'function' ? (msg.error as (e: unknown) => ReactNode)(e) : msg.error,
          description: msg.description?.error,
          action: msg.action?.error ?? opts?.action,
        }),
    );
    return p;
  },
});

function defaultDuration(r: ToastRecord) {
  if (r.duration !== undefined) return r.duration;
  if (r.variant === 'loading') return Infinity;
  if (r.variant === 'error' || r.action) return 8000;
  if (r.variant === 'warning') return 6000;
  return 5000;
}

/* ---------- Toaster ---------- */
export type ToasterPosition = 'bottom-right' | 'bottom-center' | 'top-right' | 'top-center';

export interface ToasterProps {
  /** 与 toast({ toaster }) 对应；页面里只有一个通知区时不用设 */
  id?: string;
  position?: ToasterPosition;
  /** 同时显示几条，其余排队，默认 3 */
  visibleToasts?: number;
  /** 通知区读屏名称，默认 "Notifications" */
  label?: string;
  /** 跳进通知区的快捷键（KeyboardEvent.key），默认 F8；传 null 关闭 */
  hotkey?: string | null;
  /** 关闭按钮读屏文字，默认 "Dismiss" */
  closeLabel?: string;
  /** 只在容器内定位（文档示例用）：absolute 而非 fixed */
  contained?: boolean;
  className?: string;
}

const GAP = 10;
const PEEK = 8;

export function Toaster({
  id = 'default',
  position = 'bottom-right',
  visibleToasts = 3,
  label = 'Notifications',
  hotkey = 'F8',
  closeLabel = 'Dismiss',
  contained,
  className,
}: ToasterProps) {
  const all = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mine = all.filter((r) => (r.toaster ?? 'default') === id);
  const shown = mine.slice(0, visibleToasts);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [hidden, setHidden] = useState(false);
  const region = useRef<HTMLElement>(null);
  const polite = useRef<HTMLDivElement>(null);
  const assertive = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotionPref();
  const top = position.startsWith('top');
  const expanded = hovered || focusWithin || tapped;
  const paused = expanded || hidden;
  const hasToasts = shown.length > 0;

  // 通知区的指针 / 焦点监听（原生事件；通知区经 Portal 挂载，用回调 ref 拿到元素后再绑定）
  const [regionEl, setRegionElState] = useState<HTMLElement | null>(null);
  const setRegionEl = useCallback((el: HTMLElement | null) => {
    region.current = el;
    setRegionElState(el);
  }, []);
  const tapInfo = useRef({ expanded: false, many: false });
  useEffect(() => {
    tapInfo.current = { expanded, many: shown.length > 1 };
  });
  useEffect(() => {
    const el = regionEl;
    if (!el) return;
    const enter = (e: PointerEvent) => e.pointerType === 'mouse' && setHovered(true);
    const leave = (e: PointerEvent) => e.pointerType === 'mouse' && setHovered(false);
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !tapInfo.current.expanded && tapInfo.current.many) setTapped(true);
    };
    const fin = (e: FocusEvent) => {
      const from = e.relatedTarget as HTMLElement | null;
      if (from && !el.contains(from)) returnFocus.current = from;
      setFocusWithin(true);
    };
    const fout = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node)) setFocusWithin(false);
    };
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    el.addEventListener('focusin', fin);
    el.addEventListener('focusout', fout);
    return () => {
      el.removeEventListener('pointerenter', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('focusin', fin);
      el.removeEventListener('focusout', fout);
    };
  }, [regionEl]);

  // 页面隐藏时暂停计时
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // 快捷键：跳进通知区（聚焦最新一条里的第一个按钮）
  useEffect(() => {
    if (!hotkey) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== hotkey || e.isComposing) return;
      const first = region.current?.querySelector<HTMLElement>('li button');
      if (!first) return;
      e.preventDefault();
      returnFocus.current = document.activeElement as HTMLElement | null;
      first.focus();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [hotkey]);

  // 通知区里按 Esc：回到跳进来之前的位置（原生监听，section 不挂键盘处理）
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const back = returnFocus.current;
      if (e.key !== 'Escape' || e.isComposing || !region.current?.contains(e.target as Node)) return;
      if (!back || !document.contains(back)) return;
      back.focus();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  // 没有 toast 时收起「轻点展开」
  useEffect(() => {
    if (!hasToasts && tapped) {
      const t = setTimeout(() => setTapped(false), 0);
      return () => clearTimeout(t);
    }
  }, [hasToasts, tapped]);

  // 轻点展开后，点通知区外收起
  useEffect(() => {
    if (!tapped) return;
    const on = (e: PointerEvent) => {
      if (!region.current?.contains(e.target as Node)) setTapped(false);
    };
    document.addEventListener('pointerdown', on, true);
    return () => document.removeEventListener('pointerdown', on, true);
  }, [tapped]);

  const announce = useCallback((text: string, level: 'polite' | 'assertive') => {
    const el = (level === 'assertive' ? assertive : polite).current;
    if (!el || !text) return;
    // 先清空再写入，保证相同文字也会再次播报
    el.textContent = '';
    window.setTimeout(() => {
      el.textContent = text;
    }, 60);
  }, []);

  const measure = useCallback((tid: string, h: number) => {
    setHeights((m) => (m[tid] === h ? m : { ...m, [tid]: h }));
  }, []);

  const onClosed = useCallback((tid: string, hadFocus: boolean) => {
    dismiss(tid);
    if (!hadFocus) return;
    requestAnimationFrame(() => {
      // 退场中的那条还留在 DOM 里（AnimatePresence），按 id 排除掉
      const next = [...(region.current?.querySelectorAll<HTMLElement>('li[data-toast-id]') ?? [])]
        .find((li) => li.dataset.toastId !== tid && !li.inert)
        ?.querySelector<HTMLElement>('button');
      if (next) next.focus();
      else (returnFocus.current && document.contains(returnFocus.current) ? returnFocus.current : null)?.focus();
    });
  }, []);

  const frontH = shown[0] ? (heights[shown[0].id] ?? 64) : 0;
  const sizes = shown.map((r) => (heights[r.id] ?? 64) + GAP);
  const offsets = sizes.map((_, i) => sizes.slice(0, i).reduce((x, y) => x + y, 0));
  const total = sizes.reduce((x, y) => x + y, 0);
  const listH = expanded ? Math.max(total - GAP, 0) : frontH + PEEK * Math.max(shown.length - 1, 0);

  const pos = {
    'bottom-right': 'bottom-4 end-4 sm:bottom-6 sm:end-6',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 sm:bottom-6',
    'top-right': 'top-4 end-4 sm:top-6 sm:end-6',
    'top-center': 'top-4 left-1/2 -translate-x-1/2 sm:top-6',
  }[position];

  const body = (
    <>
      <section
        ref={setRegionEl}
        aria-label={hotkey ? `${label} (${hotkey})` : label}
        tabIndex={-1}
        data-cds="Toaster"
        data-expanded={expanded || undefined}
        className={cn(
          contained ? 'absolute' : 'fixed',
          'z-[80] w-[min(356px,calc(100%-24px))] outline-none max-sm:inset-x-3! max-sm:w-auto! max-sm:translate-x-0!',
          pos,
          !hasToasts && 'pointer-events-none',
          className,
        )}
      >
        <ol className="relative m-0 list-none p-0" style={{ height: listH }}>
          <AnimatePresence initial={false}>
            {shown.map((r, i) => (
              <ToastItem
                key={r.id}
                record={r}
                index={i}
                offset={expanded ? offsets[i] : PEEK * i}
                scale={expanded ? 1 : 1 - 0.04 * i}
                collapsedHeight={!expanded && i > 0 ? frontH : undefined}
                top={top}
                paused={paused}
                reduce={reduce}
                closeLabel={closeLabel}
                onMeasure={measure}
                onClosed={onClosed}
                announce={announce}
              />
            ))}
          </AnimatePresence>
        </ol>
      </section>
      <div ref={polite} aria-live="polite" aria-atomic="true" className="sr-only" />
      <div ref={assertive} aria-live="assertive" aria-atomic="true" className="sr-only" />
    </>
  );
  return contained ? body : <Portal>{body}</Portal>;
}

/* ---------- 单条 ---------- */
const iconFor: Partial<Record<ToastVariant, ReactNode>> = {
  success: <CheckCircle weight="fill" className="text-success" />,
  error: <WarningCircle weight="fill" className="text-danger" />,
  warning: <Warning weight="fill" className="text-warning" />,
  info: <Info weight="fill" className="text-accent-text" />,
};

function LoadingIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className="size-4 animate-spin text-text-secondary">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface ToastItemProps {
  record: ToastRecord;
  index: number;
  offset: number;
  scale: number;
  collapsedHeight?: number;
  top: boolean;
  paused: boolean;
  reduce: boolean;
  closeLabel: string;
  onMeasure: (id: string, h: number) => void;
  onClosed: (id: string, hadFocus: boolean) => void;
  announce: (text: string, level: 'polite' | 'assertive') => void;
}

function ToastItem({
  record: r,
  index,
  offset,
  scale,
  collapsedHeight,
  top,
  paused,
  reduce,
  closeLabel,
  onMeasure,
  onClosed,
  announce,
}: ToastItemProps) {
  const li = useRef<HTMLLIElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const remaining = useRef<number>(Infinity);
  const startedAt = useRef(0);
  const variant = r.variant ?? 'default';
  const duration = defaultDuration(r);
  const behind = collapsedHeight !== undefined;

  const close = useCallback(() => {
    const hadFocus = !!li.current?.contains(document.activeElement);
    onClosed(r.id, hadFocus);
  }, [onClosed, r.id]);

  // 量自然高度（ResizeObserver 回调里上报，不在 effect 体内 setState）
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onMeasure(r.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure, r.id]);

  // 出现 / 状态变化：播报一次，并重新计时
  useEffect(() => {
    const t = text.current?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    announce(t, variant === 'error' ? 'assertive' : 'polite');
    remaining.current = duration;
  }, [r.rev, variant, duration, announce]);

  // 计时：暂停时记下剩余时间
  useEffect(() => {
    if (paused || !Number.isFinite(remaining.current)) return;
    startedAt.current = performance.now();
    const t = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt.current));
    };
  }, [paused, r.rev, close]);

  const dir = top ? 1 : -1;
  return (
    <motion.li
      ref={li}
      data-cds="Toast"
      data-toast-id={r.id}
      data-variant={variant}
      data-front={index === 0 || undefined}
      aria-hidden={behind || undefined}
      inert={behind || undefined}
      className={cn('absolute inset-x-0', top ? 'top-0' : 'bottom-0')}
      style={{ zIndex: 100 - index, transformOrigin: top ? 'bottom center' : 'top center' }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -dir * 24, scale: 1 }}
      animate={{ opacity: 1, y: dir * offset, scale }}
      exit={{ opacity: 0, transition: reduce ? INSTANT : { duration: DUR.base } }}
      transition={reduce ? INSTANT : SPRING_CONTENT}
    >
      <div
        ref={card}
        className="relative flex w-full gap-3 overflow-hidden rounded-xl bg-popover-surface py-3 ps-3.5 pe-11 text-[13.5px] leading-5 text-text-primary shadow-popover"
        style={behind ? { height: collapsedHeight } : undefined}
      >
        <div className={cn('flex w-full gap-3 transition-opacity duration-(--cds-dur-base)', behind && 'opacity-0')}>
          {(variant === 'loading' || iconFor[variant]) && (
            <span className="mt-0.5 flex size-4 shrink-0 [&_svg]:size-4">{variant === 'loading' ? <LoadingIcon /> : iconFor[variant]}</span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2 min-[400px]:flex-row min-[400px]:items-center">
            <div ref={text} className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {r.title != null && <p className="font-medium">{r.title}</p>}
              {r.description != null && <p className="mt-0.5 text-[13px] text-text-secondary">{r.description}</p>}
            </div>
            {r.action && (
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 self-start min-[400px]:self-center"
                onClick={() => {
                  r.action?.onClick();
                  close();
                }}
              >
                {r.action.label}
              </Button>
            )}
          </div>
        </div>
        {r.dismissible !== false && <CloseButton size="xs" aria-label={closeLabel} onClick={close} className="absolute end-2.5 top-2.5" />}
      </div>
    </motion.li>
  );
}
