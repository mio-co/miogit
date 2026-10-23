import { X } from '@phosphor-icons/react/dist/ssr';
import { IconButton, type IconButtonProps } from './button';

/* ==========================================================================
   CloseButton —— 关闭弹窗 / 抽屉 / 提示条 / 标签的 × 按钮。
   = IconButton(ghost) + X 图标；aria-label 默认 "Close"（中文界面请传 "关闭"）。
   放在媒体之上用 variant="onContent"；放在带边框容器里保持 ghost（单闭合边框原则）。
   无 hooks，可在 Server Component 中渲染。
   ========================================================================== */
export type CloseButtonProps = Omit<IconButtonProps, 'aria-label' | 'children' | 'variant'> & {
  'aria-label'?: string;
  variant?: 'ghost' | 'onContent' | 'secondary';
};

export function CloseButton({ 'aria-label': label = 'Close', size = 'sm', variant = 'ghost', ...props }: CloseButtonProps) {
  return (
    <IconButton variant={variant} size={size} aria-label={label} data-cds-close="" {...props}>
      <X weight="bold" />
    </IconButton>
  );
}
