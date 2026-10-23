'use client';
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Switch —— role="switch" + aria-checked。
   md：轨道 32×18、滑块 14（spec/02 §B13 的开关几何）；sm：28×16、滑块 12。
   滑块只动 transform：--cds-dur-base + overshoot 曲线（≈ +3% 过冲，利落不弹跳）。
   受控（checked + onCheckedChange）或非受控（defaultChecked）。
   触屏：.cds-hit 的 ::after 把命中区撑到 44×44，视觉尺寸不变。
   ========================================================================== */

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
  /** 右侧可点击标签；不传时请提供 aria-label */
  label?: ReactNode;
  /** 标签下方说明 */
  description?: ReactNode;
};

const track = { md: 'h-[18px] w-8', sm: 'h-4 w-7' };
const thumb = {
  md: 'size-3.5 group-aria-checked/sw:translate-x-3.5 rtl:group-aria-checked/sw:-translate-x-3.5',
  sm: 'size-3 group-aria-checked/sw:translate-x-3 rtl:group-aria-checked/sw:-translate-x-3',
};

export function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  size = 'md',
  label,
  description,
  disabled,
  className,
  id: idProp,
  ...props
}: SwitchProps) {
  const [inner, setInner] = useState(defaultChecked);
  const checked = checkedProp ?? inner;
  const auto = useId();
  const id = idProp ?? auto;
  const toggle = () => {
    if (disabled) return;
    if (checkedProp === undefined) setInner(!checked);
    onCheckedChange?.(!checked);
  };

  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      onClick={toggle}
      data-cds="Switch"
      className={cn(
        'group/sw cds-focus cds-hit relative inline-flex shrink-0 items-center rounded-full p-0.5',
        'bg-hairline-strong transition-[background-color] duration-(--cds-dur-snap) ease-swift aria-checked:bg-accent-brand',
        'disabled:cursor-default disabled:opacity-40',
        track[size],
        !label && className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.22),0_0_0_0.5px_rgba(0,0,0,0.06)]',
          'transition-transform duration-(--cds-dur-base) ease-overshoot',
          thumb[size],
        )}
      />
    </button>
  );

  if (!label) return control;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <div className="flex h-5 items-center">{control}</div>
      <div className="min-w-0 leading-5">
        <label htmlFor={id} className={cn('text-[13.5px]', disabled ? 'text-text-muted' : 'cursor-pointer text-text-primary')}>
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-[12.5px] leading-[1.125rem] text-text-secondary">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
