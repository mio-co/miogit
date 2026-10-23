import { cva, type VariantProps } from 'class-variance-authority';
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr';
import {
  Children,
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Button —— CDS 结构（spec/02 §B1）：
   外层交互壳（squish 弹簧、焦点环、文字色）+ 内层 paint 层 data-cds-part="paint"（-z-10，只画背景）。
   悬停写在外层（hover:[--paint:…]），不放在 paint 层上，避免指针在文字上时悬停色闪烁。
   6 个变体：secondary（默认）· primary · ghost · danger · brand · onContent；
   outline 仅为兼容别名（只用于空白画布）；link 为文字链接样式（不画背景）。
   5 个尺寸：xxs 20 · xs 24 · sm 28 · md 32（默认）· lg 40（Web 端 rem-scale = 1）；icon 让按钮成为当前高度的正方形。
   loading：转圈叠在中央、内容透明但仍占位 → 宽度不变；用 aria-disabled 而不是 disabled，焦点不丢。
   触屏（pointer: coarse）下 .cds-hit 用 ::after 把命中区撑到至少 44×44，视觉尺寸不变。
   同一文件导出 IconButton（必须 aria-label）与 LinkButton（渲染 <a>）。
   本文件不使用 hooks，可在 Server Component 中直接渲染。
   ========================================================================== */

export const buttonVariants = cva(
  [
    'cds-btn-squish cds-hit group/btn relative isolate inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap',
    'border-0 font-sans outline-none no-underline [&_svg]:shrink-0',
    'focus-visible:shadow-focus',
    'data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[loading]:cursor-progress',
  ],
  {
    variants: {
      variant: {
        secondary:
          'text-text-primary aria-pressed:text-accent-text [--paint:var(--cds-fill-secondary)] hover:[--paint:var(--cds-fill-secondary-hover)]',
        primary:
          'font-medium text-accent-fg [--paint:var(--cds-accent)] hover:[--paint:var(--cds-accent-fill-hover)] active:[--paint:var(--cds-accent-fill-hover)]',
        ghost:
          'text-text-secondary hover:text-text-primary aria-pressed:text-text-primary aria-expanded:text-text-primary [--paint:transparent] hover:[--paint:var(--cds-fill-ghost-hover)] active:[--paint:var(--cds-fill-ghost-selected)] aria-pressed:[--paint:var(--cds-fill-ghost-selected)] aria-expanded:[--paint:var(--cds-fill-ghost-selected)]',
        danger:
          'font-medium text-white [--paint:var(--cds-fill-danger-solid)] hover:[--paint:color-mix(in_oklab,var(--cds-fill-danger-solid)_88%,black)] focus-visible:shadow-focus-danger',
        /** 【a11y】白字在 --brand #c6613f 上只有 4.05:1；paint 用同色相压暗的 --cds-fill-brand-solid（#ba5837，4.63:1），
         *  字重 semibold —— 任何尺寸都过 AA 正文，不依赖“大字”豁免（lg 15px 粗体仍不到 WCAG 大字的 18.66px）。 */
        brand:
          'font-semibold text-white [--paint:var(--cds-fill-brand-solid)] hover:[--paint:color-mix(in_oklab,var(--cds-fill-brand-solid)_88%,black)]',
        onContent:
          'text-white backdrop-blur-md [--paint:var(--cds-button-on-content)] hover:[--paint:var(--cds-button-on-content-hover)] shadow-[inset_0_0_0_1px_var(--cds-button-on-content-ring)]',
        /** 兼容别名：只用于空白画布，禁止放进带边框的容器（单闭合边框原则） */
        outline:
          'text-text-primary [--paint:transparent] hover:[--paint:var(--cds-fill-ghost-hover)] aria-pressed:[--paint:var(--cds-fill-ghost-selected)] shadow-[inset_0_0_0_1px_var(--cds-border-strong)]',
        /** 文字链接样式：不画背景，悬停出下划线；高度仍跟随 size，便于与按钮同排对齐 */
        link: 'text-accent-text decoration-[color-mix(in_srgb,currentColor_45%,transparent)] underline-offset-4 hover:underline [--paint:transparent]',
      },
      size: {
        xxs: 'h-5 gap-1 rounded-sm px-1.5 text-[11px] [--cds-btn-press:0.984] [&_svg]:size-3',
        xs: 'h-6 gap-1 rounded-md px-2 py-0.5 text-[11.5px] [--cds-btn-press:0.981] [&_svg]:size-3.5',
        sm: 'h-7 gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] [--cds-btn-press:0.978] [&_svg]:size-3.5',
        md: 'h-8 gap-1.5 rounded-lg px-3.5 py-1.5 text-[13.5px] [--cds-btn-press:0.975] [&_svg]:size-4',
        lg: 'h-10 gap-2 rounded-xl px-5 py-2 text-[15px] [--cds-btn-press:0.969] [&_svg]:size-[18px]',
      },
      icon: { true: 'aspect-square px-0 py-0', false: '' },
      /** 圆形（如 Composer 发送钮）；与 icon 一起用 */
      round: { true: 'rounded-full', false: '' },
      fullWidth: { true: 'w-full', false: '' },
      /** 组合按钮中的位置：首项去掉结束侧圆角、中间两侧直角、末项去掉起始侧圆角（在 ButtonGroup 里会自动处理） */
      joined: { start: 'rounded-e-none', middle: 'rounded-none', end: 'rounded-s-none', none: '' },
    },
    compoundVariants: [{ variant: 'link', icon: false, class: 'px-0.5' }],
    defaultVariants: { variant: 'secondary', size: 'md', icon: false, round: false, fullWidth: false, joined: 'none' },
  },
);

/** 只画背景的 paint 层；颜色来自外层的 --paint，过渡在这一层完成 */
const PAINT_CLASS =
  'pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[var(--paint)] transition-[background-color] duration-(--cds-dur-snap) ease-swift';

type Variants = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<Variants['variant']>;
export type ButtonSize = NonNullable<Variants['size']>;
type Size = ButtonSize | 'icon';

type CommonProps = Omit<Variants, 'size'> & {
  /** 'icon' 等同于 size="md" icon（兼容旧写法） */
  size?: Size;
  /** 起始侧图标（LTR 在左，RTL 在右） */
  startIcon?: ReactNode;
  /** 结束侧图标 */
  endIcon?: ReactNode;
  /** 末尾快捷键提示，如 "⌘K"（xxs 尺寸不显示） */
  shortcut?: ReactNode;
};

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> &
  CommonProps & {
    /** 加载中：中央转圈、宽度不变、aria-busy + aria-disabled（保留焦点），点击被拦截 */
    loading?: boolean;
    /** 把样式与 paint 层套到唯一子元素上（如 next/link 的 <Link>） */
    asChild?: boolean;
    children?: ReactNode;
    ref?: Ref<HTMLButtonElement>;
  };

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden data-cds-part="spinner" className={cn('animate-spin', className)}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Shortcut({ children }: { children: ReactNode }) {
  return (
    <kbd className="-me-1 ms-auto inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-sm bg-[color-mix(in_srgb,currentColor_12%,transparent)] px-1 font-mono text-[11px] leading-none font-normal tabular-nums group-data-[size=xs]/btn:h-4 group-data-[size=xs]/btn:text-[10px]">
      {children}
    </kbd>
  );
}

/** 按钮内部内容：常态 display:contents（子元素直接参与按钮的 flex），加载时变为透明的占位行 */
function Content({
  loading,
  startIcon,
  endIcon,
  shortcut,
  showShortcut,
  children,
}: {
  loading?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  shortcut?: ReactNode;
  showShortcut: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      <span data-cds-part="content" className={loading ? 'inline-flex items-center justify-center gap-[inherit] opacity-0' : 'contents'}>
        {startIcon}
        {children}
        {endIcon}
        {showShortcut && shortcut != null && <Shortcut>{shortcut}</Shortcut>}
      </span>
      {loading && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </>
  );
}

const preventClick = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

export function Button({
  className,
  variant,
  size = 'md',
  icon,
  round,
  fullWidth,
  joined,
  loading,
  disabled,
  asChild,
  type,
  startIcon,
  endIcon,
  shortcut,
  children,
  onClick,
  ref,
  ...props
}: ButtonProps) {
  const isIcon = icon ?? size === 'icon';
  const sz = size === 'icon' ? 'md' : size;
  const classes = cn(buttonVariants({ variant, size: sz, icon: isIcon, round, fullWidth, joined }), className);
  const paint = <span aria-hidden data-cds-part="paint" className={PAINT_CLASS} />;
  const data = { 'data-cds': 'Button', 'data-variant': variant ?? 'secondary', 'data-size': sz };

  if (asChild && isValidElement(children)) {
    const child = Children.only(children) as ReactElement<HTMLAttributes<HTMLElement> & { children?: ReactNode }>;
    return cloneElement(child, {
      ...(props as HTMLAttributes<HTMLElement>),
      ...data,
      ...(onClick ? { onClick } : null),
      className: cn(classes, child.props.className),
      children: (
        <>
          {paint}
          {startIcon}
          {child.props.children}
          {endIcon}
        </>
      ),
    } as HTMLAttributes<HTMLElement>);
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      {...data}
      data-disabled={disabled ? '' : undefined}
      data-loading={loading ? '' : undefined}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      className={classes}
      // 只在加载时挂拦截函数：常态下不创建事件处理器，Server Component 也能渲染
      onClick={loading ? preventClick : onClick}
      {...props}
    >
      {paint}
      <Content loading={loading} startIcon={startIcon} endIcon={endIcon} shortcut={shortcut} showShortcut={!isIcon && sz !== 'xxs'}>
        {children}
      </Content>
    </button>
  );
}

/* ==========================================================================
   IconButton —— 正方形纯图标按钮。aria-label 必填（类型层面强制），尺寸与 Button 高度一致。
   默认 ghost：工具条 / 带边框容器内的图标钮一律无边框（单闭合边框原则）。
   ========================================================================== */
export type IconButtonProps = Omit<ButtonProps, 'icon' | 'startIcon' | 'endIcon' | 'shortcut' | 'fullWidth' | 'size'> & {
  /** 读屏名称（必填）。需要可见提示时外面再包一层 Tooltip */
  'aria-label': string;
  size?: ButtonSize;
  /** 圆形 */
  round?: boolean;
};

export function IconButton({ variant = 'ghost', size = 'md', ...props }: IconButtonProps) {
  if (process.env.NODE_ENV !== 'production' && !props['aria-label']?.trim()) {
    console.warn('[MioUI] <IconButton> 需要非空的 aria-label。');
  }
  return <Button variant={variant} size={size} icon {...props} />;
}

/* ==========================================================================
   LinkButton —— 用按钮外观渲染 <a>（导航用链接，动作用按钮）。
   external：新窗口打开 + rel="noopener noreferrer" + ↗ 图标 + 读屏提示。
   disabled：去掉 href、aria-disabled，不可聚焦。
   Next.js 站内跳转请用 <Button asChild><Link /></Button>（客户端路由）。
   ========================================================================== */
export type LinkButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> &
  CommonProps & {
    /** 外部链接：target="_blank"、rel="noopener noreferrer"，末尾 ↗ 图标 */
    external?: boolean;
    /** 外部链接的读屏补充文本 */
    externalLabel?: string;
    disabled?: boolean;
    children?: ReactNode;
    ref?: Ref<HTMLAnchorElement>;
  };

export function LinkButton({
  className,
  variant,
  size = 'md',
  icon,
  round,
  fullWidth,
  joined,
  startIcon,
  endIcon,
  shortcut,
  external,
  externalLabel = '(opens in a new tab)',
  disabled,
  href,
  target,
  rel,
  children,
  ref,
  ...props
}: LinkButtonProps) {
  const isIcon = icon ?? size === 'icon';
  const sz = size === 'icon' ? 'md' : size;
  return (
    <a
      ref={ref}
      href={disabled ? undefined : href}
      target={external ? (target ?? '_blank') : target}
      rel={external ? (rel ?? 'noopener noreferrer') : rel}
      aria-disabled={disabled || undefined}
      data-cds="Button"
      data-variant={variant ?? 'secondary'}
      data-size={sz}
      data-disabled={disabled ? '' : undefined}
      className={cn(buttonVariants({ variant, size: sz, icon: isIcon, round, fullWidth, joined }), className)}
      {...props}
    >
      <span aria-hidden data-cds-part="paint" className={PAINT_CLASS} />
      <Content
        startIcon={startIcon}
        endIcon={external ? (endIcon ?? <ArrowUpRight aria-hidden data-cds-part="external" className="-ms-0.5 opacity-70" />) : endIcon}
        shortcut={shortcut}
        showShortcut={!isIcon && sz !== 'xxs'}
      >
        {children}
        {external && <span className="sr-only"> {externalLabel}</span>}
      </Content>
    </a>
  );
}

export { ButtonGroup, type ButtonGroupProps } from './button-group';
