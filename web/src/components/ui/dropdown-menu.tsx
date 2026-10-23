'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from '@phosphor-icons/react';
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { INSTANT, SPRING_CONTENT } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { Portal, useIsoLayoutEffect, useLayer } from './overlay';

/* ==========================================================================
   DropdownMenu：触发器 + 菜单项（图标 / 文本 / 快捷键 / 危险 / 勾选）+ 分隔线 + 分组标题
   12px 面板 + 4px 内边距 → 8px 菜单项（同心圆角）；--cds-shadow-popover（暗色内侧高光）
   ↑↓ / Home / End / 首字母跳转，Esc 与点外部关闭；贴边自动翻转 / 平移；320/28 内容弹簧
   ========================================================================== */
type Ctx = { close: (focusTrigger?: boolean) => void };
const MenuCtx = createContext<Ctx | null>(null);

export interface DropdownMenuProps {
  /** 单个按钮元素；会注入 aria-haspopup / aria-expanded / onClick / onKeyDown */
  trigger: ReactElement;
  children: ReactNode;
  /** 与触发器的水平对齐 */
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  /** 受控 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 菜单面板类名（如 w-56） */
  className?: string;
  'aria-label'?: string;
}

const ITEM_SEL = '[role^="menuitem"]:not([aria-disabled="true"])';

export function DropdownMenu({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  open: openProp,
  onOpenChange,
  className,
  'aria-label': ariaLabel,
}: DropdownMenuProps) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = useCallback(
    (o: boolean) => {
      if (openProp === undefined) setInner(o);
      onOpenChange?.(o);
    },
    [openProp, onOpenChange],
  );
  const anchor = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusFirst = useRef<'first' | 'last' | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const menuId = useId();
  const reduce = useReducedMotionPref();

  const triggerEl = useCallback(() => (anchor.current?.firstElementChild as HTMLElement | null) ?? anchor.current, []);

  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  const close = useCallback((focusTrigger = true) => {
    setOpenRef.current(false);
    if (focusTrigger) requestAnimationFrame(() => triggerEl()?.focus());
  }, [triggerEl]);

  useLayer(open, () => close(true));

  const measure = useCallback(() => {
    const el = triggerEl();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s: CSSProperties = {};
    if (side === 'bottom') s.top = r.bottom + 6;
    else s.bottom = window.innerHeight - r.top + 6;
    if (align === 'start') s.left = Math.max(8, r.left);
    else s.right = Math.max(8, window.innerWidth - r.right);
    setStyle(s);
  }, [align, side, triggerEl]);

  // 打开后按真实尺寸修正：放不下就翻到另一侧，左右超出则平移回视口。
  // 尺寸用 offsetWidth / offsetHeight（布局尺寸）：入场动画 scale(.96) 期间 getBoundingClientRect
  // 会量小约 4%，375px 下贴边菜单因此仍会出视口；位置按 style 里的 top/left/right/bottom 推算。
  const { top, bottom, left, right } = style;
  useIsoLayoutEffect(() => {
    const m = menu.current;
    if (!open || !m) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const t = triggerEl()?.getBoundingClientRect();
    const next: CSSProperties = { top, bottom, left, right };
    let changed = false;
    if (t && top !== undefined && (top as number) + h > vh - 8 && t.top - 6 - h >= 8) {
      delete next.top;
      next.bottom = vh - t.top + 6;
      changed = true;
    } else if (t && bottom !== undefined && vh - (bottom as number) - h < 8 && t.bottom + 6 + h <= vh - 8) {
      delete next.bottom;
      next.top = t.bottom + 6;
      changed = true;
    }
    if (left !== undefined && (left as number) + w > vw - 8) {
      next.left = Math.max(8, vw - 8 - w);
      changed = next.left !== left || changed;
    }
    if (right !== undefined && vw - (right as number) - w < 8) {
      next.right = Math.max(8, vw - 8 - w);
      changed = next.right !== right || changed;
    }
    if (changed) setStyle(next);
  }, [open, top, bottom, left, right, triggerEl]);

  useEffect(() => {
    if (!open) return;
    measure();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || anchor.current?.contains(t)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', onResize);
    const raf = requestAnimationFrame(() => {
      const items = menu.current?.querySelectorAll<HTMLElement>(ITEM_SEL);
      if (!items?.length) return menu.current?.focus();
      const which = focusFirst.current;
      focusFirst.current = null;
      if (which === 'last') items[items.length - 1].focus();
      else if (which === 'first') items[0].focus();
      else menu.current?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure, close]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>(ITEM_SEL) ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      go(i < 0 ? items.length - 1 : i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(items.length - 1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      close(true);
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      const k = e.key.toLowerCase();
      const order = [...items.slice(i + 1), ...items.slice(0, i + 1)];
      order.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(k))?.focus();
    }
  };

  const t = trigger as ReactElement<{
    onClick?: (e: ReactMouseEvent) => void;
    onKeyDown?: (e: KeyboardEvent) => void;
  }>;
  const triggerNode = isValidElement(trigger)
    ? cloneElement(t, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        'data-state': open ? 'open' : 'closed',
        onClick: (e: ReactMouseEvent) => {
          t.props.onClick?.(e);
          if (!e.defaultPrevented) setOpen(!open);
        },
        onKeyDown: (e: KeyboardEvent) => {
          t.props.onKeyDown?.(e);
          if (e.defaultPrevented) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            focusFirst.current = e.key === 'ArrowUp' ? 'last' : 'first';
            if (open) {
              const items = menu.current?.querySelectorAll<HTMLElement>(ITEM_SEL);
              items?.[e.key === 'ArrowUp' ? items.length - 1 : 0]?.focus();
            } else setOpen(true);
          } else if ((e.key === 'Enter' || e.key === ' ') && !open) {
            focusFirst.current = 'first';
          }
        },
      } as Record<string, unknown>)
    : trigger;

  const origin = `${side === 'bottom' ? 'top' : 'bottom'} ${align === 'start' ? 'left' : 'right'}`;

  return (
    <MenuCtx.Provider value={{ close }}>
      <span ref={anchor} className="inline-flex">
        {triggerNode}
      </span>
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menu}
              id={menuId}
              role="menu"
              aria-label={ariaLabel}
              tabIndex={-1}
              onKeyDown={onMenuKey}
              style={{ ...style, transformOrigin: origin }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: side === 'bottom' ? -4 : 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduce ? 1 : 0.98, transition: { duration: reduce ? 0 : 0.1 } }}
              transition={reduce ? INSTANT : SPRING_CONTENT}
              data-cds="DropdownMenu"
              className={cn(
                'fixed z-[60] max-h-[min(70vh,28rem)] min-w-[200px] max-w-[min(320px,calc(100vw-16px))] overflow-y-auto rounded-xl bg-popover-surface p-1 text-text-primary shadow-popover outline-none',
                className,
              )}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </MenuCtx.Provider>
  );
}

export interface DropdownMenuItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  icon?: ReactNode;
  /** 右侧快捷键文本，如 "⌘D" */
  shortcut?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** 设置后变为 menuitemcheckbox，选中时显示对勾 */
  checked?: boolean;
  /** 选择回调；调用 e.preventDefault() 可阻止菜单关闭 */
  onSelect?: (e: Event) => void;
}

export function DropdownMenuItem({
  icon,
  shortcut,
  danger,
  disabled,
  checked,
  onSelect,
  className,
  children,
  ...p
}: DropdownMenuItemProps) {
  const ctx = useContext(MenuCtx);
  const select = () => {
    if (disabled) return;
    const ev = new Event('select', { cancelable: true });
    onSelect?.(ev);
    if (!ev.defaultPrevented) ctx?.close(true);
  };
  const isCheck = checked !== undefined;
  return (
    <div
      role={isCheck ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={isCheck ? checked : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      data-danger={danger || undefined}
      onClick={select}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      }}
      onPointerMove={(e) => !disabled && e.currentTarget !== document.activeElement && e.currentTarget.focus({ preventScroll: true })}
      className={cn(
        'flex h-8 cursor-default select-none items-center gap-2.5 rounded-lg px-2 text-[13.5px] outline-none [@media(pointer:coarse)]:min-h-11',
        'text-text-primary transition-colors duration-(--cds-dur-fast) focus:bg-ghost-hover active:bg-ghost-selected',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        danger && 'text-danger focus:bg-danger-fill/10',
        disabled && 'pointer-events-none opacity-45',
        className,
      )}
      {...p}
    >
      {icon != null && <span className={cn('flex items-center', danger ? 'text-danger' : 'text-text-secondary')}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {isCheck && <Check weight="bold" className={cn('text-accent-text', !checked && 'invisible')} />}
      {shortcut != null && (
        <span className={cn('ms-3 font-mono text-[11.5px] tabular-nums', danger ? 'text-danger' : 'text-text-hint')}>{shortcut}</span>
      )}
    </div>
  );
}

export function DropdownMenuSeparator({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('-mx-1 my-1 h-px bg-hairline', className)} {...p} />;
}

/** 分组小标题（不可聚焦） */
export function DropdownMenuLabel({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 pb-1 pt-1.5 text-[11.5px] font-medium text-text-hint', className)} {...p} />;
}
