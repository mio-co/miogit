import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* EmptyState —— 空状态：图标 + 标题 + 说明 + 操作。 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div data-cds="EmptyState" className={cn('flex flex-col items-center gap-2 rounded-card bg-surface-2 px-6 py-10 text-center shadow-panel', className)}>
      {icon && <div aria-hidden="true" className="mb-1 text-3xl text-text-secondary">{icon}</div>}
      <h3 className="text-base font-medium text-text-primary">{title}</h3>
      {description && <p className="max-w-sm text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
