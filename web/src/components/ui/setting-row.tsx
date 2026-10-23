import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   SettingRow —— 设置行：标题 + 说明 + 右侧控件。
   - 标题是 <div id>，说明是 <p id>；控件容器 role="group" 且 aria-labelledby 标题、aria-describedby 说明，
     所以放进去的 Switch / Select / Button 即使自己没有名称，读屏也能念到“标题，说明”；
     group 只提供分组上下文，不覆盖控件自己的名称；
   - ≥640px：左文右控件一行（控件靠右，垂直居中）；<640px：上下堆叠，控件在说明下方、左对齐，375px 不溢出；
   - divided：行与行之间发丝分隔线；danger：标题用 danger 语义色（删除账号之类），文字 ≥4.5:1；
   - 整行不可点击（不是 button），避免“整行可点”与控件重复命中；服务端组件，无动效。
   ========================================================================== */

export interface SettingRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** 右侧控件 */
  control?: ReactNode;
  divided?: boolean;
  danger?: boolean;
}

export function SettingRow({ title, description, control, divided = false, danger = false, className, children, ...props }: SettingRowProps) {
  const id = useId();
  return (
    <div
      data-cds="SettingRow"
      className={cn(
        'flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        divided && 'border-t border-hairline first:border-t-0',
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <div id={`${id}-t`} className={cn('text-[14px] leading-5 font-medium [overflow-wrap:anywhere]', danger ? 'text-danger' : 'text-text-primary')}>
          {title}
        </div>
        {description && (
          <p id={`${id}-d`} className="mt-0.5 text-[13px] leading-5 text-text-secondary [overflow-wrap:anywhere]">
            {description}
          </p>
        )}
        {children}
      </div>
      {control && (
        <div role="group" aria-labelledby={`${id}-t`} aria-describedby={description ? `${id}-d` : undefined} className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
          {control}
        </div>
      )}
    </div>
  );
}
