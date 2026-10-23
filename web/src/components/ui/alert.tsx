'use client';
import { CheckCircle, Info, Warning, WarningCircle } from '@phosphor-icons/react';
import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CloseButton } from './close-button';

/* ==========================================================================
   Alert / Banner：页内提示（不浮动、不自动消失）。
   - 四种语气 info / success / warning / danger：浅底 + 同色发丝边（单层闭合边框）+ 实心图标，
     标题 text-primary、正文 text-secondary（各主题浅深都 ≥4.5:1）；info 跟随主题强调色
   - 静态提示不带 live 角色（页面加载即存在，不需要播报）；运行时才出现的提示设 live="polite" | "assertive"，
     分别渲染为 role="status" / role="alert"
   - Alert：卡片式，放在表单 / 内容区里；Banner：贴顶通栏（只有下边线），适合整页公告
   - 可选操作区 action 与关闭按钮（onDismiss，44px 触屏命中区）；关闭后由父组件移除，焦点交给父组件安排
   ========================================================================== */
export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const tone: Record<AlertVariant, { box: string; icon: string; banner: string }> = {
  info: {
    box: 'bg-accent-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--cds-accent)_28%,transparent)]',
    banner: 'bg-accent-soft shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--cds-accent)_28%,transparent)]',
    icon: 'text-accent-text',
  },
  success: {
    box: 'bg-success-fill/10 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--cds-fill-success)_32%,transparent)]',
    banner: 'bg-success-fill/10 shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--cds-fill-success)_32%,transparent)]',
    icon: 'text-success',
  },
  warning: {
    box: 'bg-warning-fill/12 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--cds-fill-warning)_38%,transparent)]',
    banner: 'bg-warning-fill/12 shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--cds-fill-warning)_38%,transparent)]',
    icon: 'text-warning',
  },
  danger: {
    box: 'bg-danger-fill/10 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--cds-fill-danger)_32%,transparent)]',
    banner: 'bg-danger-fill/10 shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--cds-fill-danger)_32%,transparent)]',
    icon: 'text-danger',
  },
};

const icons: Record<AlertVariant, ReactNode> = {
  info: <Info weight="fill" />,
  success: <CheckCircle weight="fill" />,
  warning: <Warning weight="fill" />,
  danger: <WarningCircle weight="fill" />,
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
  /** 替换默认图标；传 null 不显示图标 */
  icon?: ReactNode | null;
  /** 操作区（按钮 / 链接），窄屏折到正文下方 */
  action?: ReactNode;
  /** 传入后显示关闭按钮 */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** 运行时出现的提示才需要播报：polite → role="status"，assertive → role="alert" */
  live?: 'off' | 'polite' | 'assertive';
}

function liveRole(live: AlertProps['live']) {
  return live === 'assertive' ? 'alert' : live === 'polite' ? 'status' : undefined;
}

export function Alert({
  variant = 'info',
  title,
  icon,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
  live = 'off',
  className,
  children,
  ...p
}: AlertProps) {
  const t = tone[variant];
  return (
    <div
      role={liveRole(live)}
      data-cds="Alert"
      data-variant={variant}
      className={cn('relative flex gap-3 rounded-[10px] px-4 py-3 text-[13.5px] leading-5', t.box, onDismiss && 'pe-11', className)}
      {...p}
    >
      {icon !== null && <span className={cn('mt-0.5 flex shrink-0 [&_svg]:size-4', t.icon)}>{icon ?? icons[variant]}</span>}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {title != null && <p className="font-medium text-text-primary">{title}</p>}
          {children != null && <div className={cn('text-text-secondary', title != null && 'mt-0.5')}>{children}</div>}
        </div>
        {action != null && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {onDismiss && <CloseButton size="xs" aria-label={dismissLabel} onClick={onDismiss} className="absolute end-2.5 top-2" />}
    </div>
  );
}

export interface BannerProps extends Omit<AlertProps, 'title'> {
  /** 内容最大宽度容器类名，默认与页面版心对齐 */
  innerClassName?: string;
}

/** 通栏公告：贴顶全宽，只有下边线；正文一行放不下时自动换行，操作区跟在后面 */
export function Banner({
  variant = 'info',
  icon,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
  live = 'off',
  className,
  innerClassName,
  children,
  ...p
}: BannerProps) {
  const t = tone[variant];
  return (
    <div role={liveRole(live)} data-cds="Banner" data-variant={variant} className={cn('relative w-full text-[13.5px] leading-5', t.banner, className)} {...p}>
      <div className={cn('mx-auto flex min-h-11 items-center gap-3 px-4 py-2', onDismiss && 'pe-12', innerClassName)}>
        {icon !== null && <span className={cn('flex shrink-0 [&_svg]:size-4', t.icon)}>{icon ?? icons[variant]}</span>}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="min-w-0 text-text-primary [overflow-wrap:anywhere]">{children}</div>
          {action != null && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      </div>
      {onDismiss && <CloseButton size="xs" aria-label={dismissLabel} onClick={onDismiss} className="absolute end-2.5 top-1/2 -translate-y-1/2" />}
    </div>
  );
}
