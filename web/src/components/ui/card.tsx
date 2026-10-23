import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Card —— 同心圆角（--cds-radius 8 + 4 = 12px）+ 发丝边面板阴影。
   卡片自身就是唯一的闭合边框：内部按钮 / 标签不再加边框（secondary 用柔和填充、工具条用 ghost）。
   interactive：悬停 translateY(-1.5px) + hover 阴影 + strong 边，200ms swift。
   ========================================================================== */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className, interactive, ...p }: CardProps) {
  return (
    <div
      data-cds="Card"
      className={cn('rounded-card bg-surface-2 shadow-panel', interactive && 'cds-card-interactive', className)}
      {...p}
    />
  );
}

export function CardHeader({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-0', className)} {...p} />;
}
export function CardTitle({ className, children, ...p }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-[15px] leading-6 font-semibold text-text-primary', className)} {...p}>
      {children}
    </h3>
  );
}
export function CardDescription({ className, ...p }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13.5px] leading-5 text-text-secondary', className)} {...p} />;
}
export function CardContent({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...p} />;
}
/** 底部操作区：单向细线分隔（内部分区只用单向细线） */
export function CardFooter({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 border-t border-hairline px-5 py-3', className)} {...p} />;
}

/* ==========================================================================
   Badge —— 20px 胶囊，柔和底色、无边框；mono 用于版本号 / 计数
   ========================================================================== */
export const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        accent: 'bg-accent-soft text-accent-text',
        neutral: 'bg-ghost-selected text-text-secondary',
        success: 'bg-success-fill/12 text-success',
        warning: 'bg-warning-fill/15 text-warning',
        danger: 'bg-danger-fill/12 text-danger',
        solid: 'bg-accent-brand text-accent-fg',
      },
      mono: { true: 'font-mono tracking-tight tabular-nums', false: '' },
    },
    defaultVariants: { variant: 'accent', mono: false },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, mono, ...p }: BadgeProps) {
  return <span data-cds="Badge" className={cn(badgeVariants({ variant, mono }), className)} {...p} />;
}
