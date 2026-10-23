'use client';
import { CaretDown } from '@phosphor-icons/react';
import { createContext, useContext, useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';

/* ==========================================================================
   Collapsible —— 单个折叠区（区别于 Accordion：一组互斥的折叠项）。
   - <Collapsible> 管状态：open / defaultOpen / onOpenChange，也可 disabled；
   - <CollapsibleTrigger> 是真正的 <button aria-expanded aria-controls>，Enter / Space 原生可用；
     chevron 只转 transform（200ms），showChevron={false} 可去掉；
   - <CollapsibleContent> 关闭时带 hidden（不可聚焦、读屏不读）；打开瞬时出现、内容 200ms 淡入（只改 opacity，规则：动效不动高度）；
     减弱动效时直接出现，没有淡入；keepMounted 让关闭时内容仍留在 DOM 里（hidden），适合要保留内部状态的内容；
   - 触屏命中区：触发器用 .cds-hit 撑到 44px 高，视觉高度不变；焦点环用 .cds-focus。
   ========================================================================== */

type Ctx = { open: boolean; setOpen: (v: boolean) => void; triggerId: string; contentId: string; disabled?: boolean };
const C = createContext<Ctx | null>(null);
const useC = () => {
  const c = useContext(C);
  if (!c) throw new Error('Collapsible 子组件必须放在 <Collapsible> 里');
  return c;
};

export interface CollapsibleProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

export function Collapsible({ open: openProp, defaultOpen = false, onOpenChange, disabled, className, ...props }: CollapsibleProps) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const uid = useId();
  const setOpen = (v: boolean) => {
    if (openProp === undefined) setInner(v);
    onOpenChange?.(v);
  };
  return (
    <C.Provider value={{ open, setOpen, triggerId: `${uid}-t`, contentId: `${uid}-c`, disabled }}>
      <div data-cds="Collapsible" data-state={open ? 'open' : 'closed'} className={className} {...props} />
    </C.Provider>
  );
}

export interface CollapsibleTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  showChevron?: boolean;
  children?: ReactNode;
}

export function CollapsibleTrigger({ showChevron = true, className, children, onClick, disabled, ...props }: CollapsibleTriggerProps) {
  const { open, setOpen, triggerId, contentId, disabled: groupDisabled } = useC();
  const off = disabled || groupDisabled;
  return (
    <button
      id={triggerId}
      type="button"
      aria-expanded={open}
      aria-controls={contentId}
      disabled={off}
      data-state={open ? 'open' : 'closed'}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) setOpen(!open);
      }}
      className={cn(
        'cds-focus cds-hit relative inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 py-1 text-start text-[13.5px] font-medium text-text-primary',
        'transition-colors duration-(--cds-dur-snap) hover:bg-ghost-hover disabled:cursor-default disabled:opacity-40',
        className,
      )}
      {...props}
    >
      {children}
      {showChevron && (
        <CaretDown
          aria-hidden
          weight="bold"
          className={cn('size-3 shrink-0 text-text-secondary transition-transform duration-(--cds-dur-base) ease-swift', open && 'rotate-180')}
        />
      )}
    </button>
  );
}

export interface CollapsibleContentProps extends HTMLAttributes<HTMLDivElement> {
  keepMounted?: boolean;
}

export function CollapsibleContent({ keepMounted, className, children, ...props }: CollapsibleContentProps) {
  const { open, triggerId, contentId } = useC();
  const reduce = useReducedMotionPref();
  if (!open && !keepMounted) return null;
  return (
    <div
      id={contentId}
      hidden={!open}
      data-state={open ? 'open' : 'closed'}
      aria-labelledby={triggerId}
      className={cn(open && !reduce && '[animation:cds-fade-in_200ms_ease-out]', className)}
      {...props}
    >
      {children}
    </div>
  );
}
