'use client';
import { CaretUpDown } from '@phosphor-icons/react';
import { useState, type ChangeEvent, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { fieldSurface, fieldSurfaceInvalid, useFieldControl } from '@/components/ui/field';

/* ==========================================================================
   Select —— 单选，基于原生 <select>（appearance: none + 自绘外观）。
   为什么用原生：移动端直接调起系统选择器、键盘与首字母跳转、表单提交、读屏语义全部由浏览器提供，
   不引入任何依赖（package.json 不在本次可改范围内）。代价是展开后的列表由系统绘制，无法套 CDS 弹层样式。
   - 外观与 Input 一致：surface-3 + 1px 内嵌发丝边，8px 圆角；聚焦三层强调色焦点环，invalid 用 danger 环。
   - 字号 16px（防 iOS 缩放）；md 32px / lg 40px；触屏（pointer: coarse）时高度提到 44px。
   - placeholder：值为空时显示，用 --cds-text-placeholder（AA）；作为禁用的空 option，不能被重新选回。
   ========================================================================== */

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}
export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'multiple' | 'value' | 'defaultValue'> & {
  /** 选项；也可以直接传 <option> / <optgroup> 作为 children */
  options?: (SelectOption | SelectOptionGroup)[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 值为空时显示的提示 */
  placeholder?: string;
  size?: 'md' | 'lg';
  invalid?: boolean;
  /** 作用于外层容器（className 作用于 select 本身） */
  wrapperClassName?: string;
  ref?: Ref<HTMLSelectElement>;
};

const sizes = {
  md: 'h-8 ps-3 pe-8 pointer-coarse:h-11',
  lg: 'h-10 ps-3.5 pe-9 pointer-coarse:h-11',
};

const isGroup = (o: SelectOption | SelectOptionGroup): o is SelectOptionGroup => 'options' in o;

export function Select({
  options,
  children,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onChange,
  placeholder,
  size = 'md',
  invalid: invalidProp,
  className,
  wrapperClassName,
  id: idProp,
  disabled: disabledProp,
  required: requiredProp,
  'aria-describedby': describedByProp,
  ...props
}: SelectProps) {
  const [inner, setInner] = useState(defaultValue);
  const value = valueProp ?? inner;
  const ctl = useFieldControl({
    id: idProp,
    invalid: invalidProp,
    disabled: disabledProp,
    required: requiredProp,
    'aria-describedby': describedByProp,
  });
  const empty = value === '';

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    if (valueProp === undefined) setInner(e.target.value);
    onValueChange?.(e.target.value);
    onChange?.(e);
  };

  const opt = (o: SelectOption) => (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  );

  return (
    <div data-cds="Select" className={cn('relative w-full min-w-0', wrapperClassName)}>
      <select
        id={ctl.id}
        value={value}
        onChange={handleChange}
        disabled={ctl.disabled}
        required={ctl.required}
        aria-invalid={ctl.invalid || undefined}
        aria-describedby={ctl.describedBy}
        data-placeholder={empty && placeholder ? '' : undefined}
        className={cn(
          'block w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg text-[16px] leading-6 font-normal',
          'data-placeholder:text-text-placeholder',
          '[&_option]:bg-popover-surface [&_option]:text-text-primary [&_optgroup]:bg-popover-surface [&_optgroup]:text-text-secondary',
          fieldSurface,
          ctl.invalid && fieldSurfaceInvalid,
          sizes[size],
          className,
        )}
        {...props}
      >
        {placeholder != null && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options?.map((o) =>
          isGroup(o) ? (
            <optgroup key={o.label} label={o.label}>
              {o.options.map(opt)}
            </optgroup>
          ) : (
            opt(o)
          ),
        )}
        {children}
      </select>
      <CaretUpDown
        aria-hidden
        className={cn(
          'pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-text-secondary',
          ctl.disabled && 'opacity-50',
        )}
      />
    </div>
  );
}
