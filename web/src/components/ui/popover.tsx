'use client';
import { AnimatePresence, motion } from 'motion/react';
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { INSTANT, SPRING_CONTENT } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { Portal, getFocusable, useIsoLayoutEffect, useLayer } from './overlay';

/* ==========================================================================
   Popover —— 非模态浮层：触发器 + 任意内容（表单、设置、说明）。
   12px 圆角、--cds-shadow-popover（暗色内侧高光）、320/28 内容弹簧。
   打开聚焦首个可聚焦元素，Esc / 点外部关闭并把焦点还给触发器；贴边自动翻转 / 平移。
   ========================================================================== */
export interface PopoverProps {
  /** 单个按钮元素；会注入 aria-expanded / aria-controls / onClick */
  trigger: ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'center' | 'end';
  side?: 'bottom' | 'top';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  'aria-label'?: string;
  /** 面板说明文字的 id（如 Popconfirm 的描述） */
  'aria-describedby'?: string;
}

const EDGE = 8;
const GAP = 6;

export function Popover({
  trigger,
  children,
  align = 'center',
  side = 'bottom',
  open: openProp,
  onOpenChange,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedby,
}: PopoverProps) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpenRef = useRef<(o: boolean) => void>(() => {});
  setOpenRef.current = (o: boolean) => {
    if (openProp === undefined) setInner(o);
    onOpenChange?.(o);
  };
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const [actualSide, setActualSide] = useState(side);
  const id = useId();
  const reduce = useReducedMotionPref();

  const triggerEl = () => (anchor.current?.firstElementChild as HTMLElement | null) ?? anchor.current;
  const close = useCallback((focusTrigger = true) => {
    setOpenRef.current(false);
    if (focusTrigger) requestAnimationFrame(() => triggerEl()?.focus());
  }, []);
  useLayer(open, () => close(true));

  // 按真实尺寸定位：放不下就翻到另一侧，水平方向夹在视口内
  const place = useCallback(() => {
    const t = triggerEl()?.getBoundingClientRect();
    const el = panel.current;
    if (!t || !el) return;
    // offsetWidth/Height 不受入场 scale 影响（spec §7：测量别用含缩放的 getBoundingClientRect）
    const p = { width: el.offsetWidth, height: el.offsetHeight };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let s = side;
    if (s === 'bottom' && t.bottom + GAP + p.height > vh - EDGE && t.top - GAP - p.height > EDGE) s = 'top';
    if (s === 'top' && t.top - GAP - p.height < EDGE && t.bottom + GAP + p.height < vh - EDGE) s = 'bottom';
    let left = align === 'start' ? t.left : align === 'end' ? t.right - p.width : t.left + t.width / 2 - p.width / 2;
    left = Math.min(Math.max(EDGE, left), vw - EDGE - p.width);
    const top = s === 'bottom' ? t.bottom + GAP : t.top - GAP - p.height;
    setActualSide(s);
    setStyle({ left, top: Math.max(EDGE, top) });
  }, [align, side]);

  useIsoLayoutEffect(() => {
    if (!open) {
      setStyle({ visibility: 'hidden' });
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const raf = requestAnimationFrame(() => {
      const root = panel.current;
      if (!root) return;
      (root.querySelector<HTMLElement>('[data-autofocus]') ?? getFocusable(root, true)[0] ?? root).focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, close, place]);

  const t = trigger as ReactElement<{ onClick?: (e: ReactMouseEvent) => void }>;
  const triggerNode = isValidElement(trigger)
    ? cloneElement(t, {
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'aria-controls': open ? id : undefined,
        'data-state': open ? 'open' : 'closed',
        onClick: (e: ReactMouseEvent) => {
          t.props.onClick?.(e);
          if (!e.defaultPrevented) setOpenRef.current(!open);
        },
      } as Record<string, unknown>)
    : trigger;

  const origin = `${actualSide === 'bottom' ? 'top' : 'bottom'} ${align === 'start' ? 'left' : align === 'end' ? 'right' : 'center'}`;

  return (
    <>
      <span ref={anchor} className="inline-flex">
        {triggerNode}
      </span>
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panel}
              id={id}
              role="dialog"
              aria-label={ariaLabel}
              aria-describedby={ariaDescribedby}
              tabIndex={-1}
              data-cds="Popover"
              style={{ ...style, transformOrigin: origin }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: actualSide === 'bottom' ? -4 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: reduce ? 0 : 0.1 } }}
              transition={reduce ? INSTANT : SPRING_CONTENT}
              className={cn(
                'fixed z-[60] w-72 max-w-[calc(100vw-16px)] rounded-xl bg-popover-surface p-3 text-text-primary shadow-popover outline-none',
                className,
              )}
            >
              {typeof children === 'function' ? children(() => close(true)) : children}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
