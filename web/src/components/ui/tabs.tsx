'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { INSTANT, SPRING_PRESS } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';

/* [MioGit 小改] ①指示条改为 motion layoutId 共享布局动画（每个 <Tabs> 实例独立 layoutId，可用 layoutId prop
   指定，跨路由重新挂载时也能从旧位置滑过来；弹簧 600/30 = SPRING_PRESS，减弱动效瞬时）；
   ②TabsTrigger 支持 href：渲染为链接（导航标签，aria-current="page"），链接组件由 <Tabs linkComponent> 提供
   （客户端路由 + 预取）。不传 href / layoutId 时行为与原组件一致（指示条仍只改 transform/opacity）。 */
type LinkLike = (p: { href: string; className?: string; children?: ReactNode; 'aria-current'?: 'page'; 'data-state'?: string; id?: string; onClick?: (e: MouseEvent<HTMLElement>) => void }) => ReactNode;

/* ==========================================================================
   Tabs —— 标签页（WAI-ARIA Tabs 模式；漫游焦点按 spec/04 §6 校正版）。
   - 两种外观：line（线型，激活项下方 2px 强调色下划线）/ pill（胶囊，激活项柔和填充）。
     单闭合边框：线型只在列表底部画一条单向发丝线；胶囊不画边框。
   - 漫游焦点：Tab 只停在当前标签；←/→（RTL 镜像）、Home/End 移动，跳过禁用项、首尾回绕，
     忽略修饰键与输入法合成。activation="automatic"（默认）方向键即切换；"manual" 只移焦点，Enter/Space 切换。
   - 可滚动：标签过多时列表横向滚动（data-cds-scroll-fade="horizontal" 两端渐隐），
     切换 / 聚焦时把当前标签滚进可视区（不动页面纵向滚动）。375px 下不撑破页面。
   - 动效：下划线 / 胶囊只改 transform、opacity，200ms --cds-ease-swift；减弱动效由全局块归零。
   - 触屏（pointer: coarse）标签高 ≥44px。
   ========================================================================== */

type Ctx = {
  value: string;
  select: (v: string) => void;
  variant: 'line' | 'pill';
  activation: 'automatic' | 'manual';
  idOf: (kind: 't' | 'p', v: string) => string;
  layoutId: string;
  link?: LinkLike;
};
const TabsCtx = createContext<Ctx | null>(null);
function useTabs(name: string) {
  const c = useContext(TabsCtx);
  if (!c) throw new Error(`<${name}> 必须放在 <Tabs> 里`);
  return c;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: 'line' | 'pill';
  /** automatic：方向键移动即切换（默认）；manual：方向键只移焦点，Enter / Space 切换（面板渲染很重时用） */
  activation?: 'automatic' | 'manual';
  /** [小改] 指示条的 motion layoutId；默认每个实例自动生成 */
  layoutId?: string;
  /** [小改] href 标签使用的链接组件 */
  linkComponent?: LinkLike;
  children?: ReactNode;
}

export function Tabs({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  variant = 'line',
  activation = 'automatic',
  layoutId: layoutIdProp,
  linkComponent,
  className,
  children,
  ...props
}: TabsProps) {
  const [inner, setInner] = useState(defaultValue);
  const value = valueProp ?? inner;
  const base = useId();
  const select = useCallback(
    (v: string) => {
      if (valueProp === undefined) setInner(v);
      onValueChange?.(v);
    },
    [valueProp, onValueChange],
  );
  const idOf = useCallback((kind: 't' | 'p', v: string) => `${base}${kind}-${v.replace(/[^\w-]/g, '_')}`, [base]);
  return (
    <TabsCtx.Provider value={{ value, select, variant, activation, idOf, layoutId: layoutIdProp ?? `${base}ind`, link: linkComponent }}>
      <div data-cds="Tabs" data-variant={variant} className={cn('flex min-w-0 flex-col', className)} {...props}>
        {children}
      </div>
    </TabsCtx.Provider>
  );
}

export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  /** 读屏标签（没有可见标题关联时必填） */
  'aria-label'?: string;
  /** 撑满宽度、各标签等分（胶囊常用） */
  block?: boolean;
}

const TAB_SELECTOR = '[role="tab"]';

export function TabsList({ className, block, children, onKeyDown, ...props }: TabsListProps) {
  const { variant, activation, select, value } = useTabs('TabsList');
  const ref = useRef<HTMLDivElement>(null);

  // 当前标签滚进可视区：只滚列表自身的横向，不调用 scrollIntoView（会连带滚动页面）
  useEffect(() => {
    const list = ref.current;
    const el = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (list && el) reveal(list, el);
  }, [value]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const list = ref.current;
    const cur = (e.target as HTMLElement).closest<HTMLElement>(TAB_SELECTOR);
    if (!list || !cur) return;
    const tabs = [...list.querySelectorAll<HTMLButtonElement>(TAB_SELECTOR)].filter((t) => !t.disabled);
    const n = tabs.length;
    const i = tabs.indexOf(cur as HTMLButtonElement);
    if (!n || i < 0) return;
    if (activation === 'manual' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const v = cur.dataset.value;
      if (v != null) select(v);
      return;
    }
    const rtl = getComputedStyle(list).direction === 'rtl';
    let t: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
        t = i + (rtl ? -1 : 1);
        break;
      case 'ArrowLeft':
        t = i + (rtl ? 1 : -1);
        break;
      case 'Home':
        t = 0;
        break;
      case 'End':
        t = n - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = tabs[((t % n) + n) % n];
    next.focus({ preventScroll: true });
    reveal(list, next);
    if (activation === 'automatic' && next.dataset.value != null) select(next.dataset.value);
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-orientation="horizontal"
      data-cds="TabsList"
      data-cds-scroll-fade="horizontal"
      onKeyDown={onKey}
      className={cn(
        'flex min-w-0 max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'line' && 'gap-1 px-1 py-1 shadow-[inset_0_-1px_0_var(--cds-border)]',
        variant === 'pill' && 'gap-1 p-1',
        block && '[&>[role=tab]]:flex-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function reveal(list: HTMLElement, el: HTMLElement) {
  const pad = 28; // 与 --cds-scroll-fade-size 一致，不让当前项落在渐隐带里
  const l = el.offsetLeft - list.offsetLeft;
  const r = l + el.offsetWidth;
  if (l - pad < list.scrollLeft) list.scrollLeft = Math.max(0, l - pad);
  else if (r + pad > list.scrollLeft + list.clientWidth) list.scrollLeft = r + pad - list.clientWidth;
}

export interface TabsTriggerProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'value'> {
  value: string;
  disabled?: boolean;
  icon?: ReactNode;
  /** 右侧计数徽标 */
  badge?: ReactNode;
  /** [小改] 导航标签：渲染为链接 */
  href?: string;
}

export function TabsTrigger({ value: v, disabled, icon, badge, href, className, children, onClick, ...props }: TabsTriggerProps) {
  const { value, select, variant, idOf, layoutId, link } = useTabs('TabsTrigger');
  const reduce = useReducedMotionPref();
  const on = value === v;
  const cls = cn(
    'cds-focus group/tab relative isolate inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap select-none',
    'text-[13.5px] leading-5 outline-none transition-colors duration-(--cds-dur-snap) ease-swift',
    'disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [@media(pointer:coarse)]:min-w-11',
    on ? 'font-medium text-text-primary' : 'text-text-secondary hover:text-text-primary',
    variant === 'line' && 'h-10 rounded-md px-3 [@media(pointer:coarse)]:h-11',
    variant === 'pill' && 'h-8 rounded-full px-3.5 [@media(pointer:coarse)]:h-11',
    className,
  );
  const indicator = on ? (
    <motion.span
      aria-hidden
      layoutId={layoutId}
      transition={reduce ? INSTANT : SPRING_PRESS}
      className={cn(
        'pointer-events-none absolute',
        variant === 'line' ? 'inset-x-2 -bottom-1 h-0.5 rounded-full bg-accent-brand' : 'inset-0 -z-10 rounded-full bg-ghost-selected',
      )}
    />
  ) : variant === 'pill' ? (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 scale-95 rounded-full bg-ghost-selected opacity-0 transition-[transform,opacity] duration-(--cds-dur-base) ease-swift group-hover/tab:scale-100 group-hover/tab:opacity-50"
    />
  ) : null;
  const inner = (
    <>
      {indicator}
      {icon}
      <span>{children}</span>
      {badge != null && (
        <span className="rounded-full bg-fill-secondary px-1.5 font-mono text-[11px] leading-4 text-text-primary tabular-nums">{badge}</span>
      )}
    </>
  );
  if (href != null) {
    const L: LinkLike = link ?? ((p) => <a {...p} />);
    return <L href={href} id={idOf('t', v)} aria-current={on ? 'page' : undefined} data-state={on ? 'active' : 'inactive'} className={cls}>{inner}</L>;
  }
  return (
    <button
      type="button"
      role="tab"
      id={idOf('t', v)}
      aria-selected={on}
      aria-controls={idOf('p', v)}
      tabIndex={on ? 0 : -1}
      disabled={disabled}
      data-value={v}
      data-state={on ? 'active' : 'inactive'}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !on) select(v);
      }}
      className={cls}
      {...props}
    >
      {inner}
    </button>
  );
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  /** 未激活时仍保留在 DOM（只隐藏），保住表单输入等内部状态 */
  forceMount?: boolean;
}

export function TabsContent({ value: v, forceMount, className, children, ...props }: TabsContentProps) {
  const { value, idOf } = useTabs('TabsContent');
  const on = value === v;
  if (!on && !forceMount) return null;
  return (
    <div
      role="tabpanel"
      id={idOf('p', v)}
      aria-labelledby={idOf('t', v)}
      tabIndex={0}
      hidden={!on}
      data-cds="TabsContent"
      className={cn('cds-focus min-w-0 rounded-md pt-4 outline-none', className)}
      {...props}
    >
      {children}
    </div>
  );
}
