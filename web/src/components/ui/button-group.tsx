import type { HTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   ButtonGroup —— 组合按钮容器（spec/02 §B1 Joined 组）。
   attached（默认）：子按钮相邻处的圆角由 styles/cds.css 自动去掉（首项 rounded-e-none、中间直角、末项 rounded-s-none；
   竖排对应上 / 下），按钮之间留 1px 缝露出画布作为分隔——不画任何闭合边框（单闭合边框原则）。
   也能处理被包了一层的按钮（如 DropdownMenu / Tooltip 的触发器外壳）。
   attached={false}：只是等间距排列（工具条）。
   聚焦的按钮自动抬到上层，焦点环不被相邻按钮遮住。
   纯 CSS、无 hooks，可在 Server Component 中渲染。
   ========================================================================== */
export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  /** 相邻按钮拼接成一体（默认 true） */
  attached?: boolean;
  /** 读屏名称：描述这组按钮的用途 */
  'aria-label'?: string;
  ref?: Ref<HTMLDivElement>;
}

export function ButtonGroup({ className, orientation = 'horizontal', attached = true, role, ...p }: ButtonGroupProps) {
  const vertical = orientation === 'vertical';
  return (
    <div
      role={role ?? 'group'}
      data-cds="ButtonGroup"
      data-orientation={orientation}
      data-attached={attached ? '' : undefined}
      aria-orientation={role === 'toolbar' ? orientation : undefined}
      className={cn(
        'inline-flex',
        vertical ? 'flex-col items-stretch' : 'items-center',
        attached ? 'gap-px' : 'gap-1',
        className,
      )}
      {...p}
    />
  );
}
