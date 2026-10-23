'use client';
import { Check, Minus } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/cn';
import { useFieldControl } from '@/components/ui/field';

/* ==========================================================================
   Checkbox —— 原生 <input type="checkbox">（表单提交、Space 切换、读屏语义都由浏览器提供），
   视觉层是一个 16px、4px 圆角（spec §3.3 复选框）的方块。
   - 半选：checked="indeterminate" → 设置原生 indeterminate 属性，读屏读作「混合 / mixed」；
     点击半选项变为选中（与原生一致）。
   - 未选边框：浅色 text-muted、深色 text-secondary 1px 内嵌（深色下 text-muted 在 surface-3 上只有 2.84:1），
     非文本对比度 ≥3:1（WCAG 1.4.11）。选中/半选：强调色填充层 + 1px accent-hover 内描边（陶土在 surface-0
     上只有 2.96:1，描边把边界拉到 4.06:1），只做 opacity 渐入；对勾只做 scale + opacity（60/120ms，overshoot）。
   - 悬停：未选边框加深一级（浅 text-secondary / 深 text-primary），选中填充换 accent-hover；只改颜色、瞬时切换，
     禁用与 invalid 时不变。悬停关联 <label> 同样生效。
   - 焦点环：三层强调色（invalid 时 danger）；触屏（pointer: coarse）时透明的原生 input 向外扩 14px，
     命中区 44×44，视觉尺寸不变。
   ========================================================================== */

export type CheckedState = boolean | 'indeterminate';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'defaultChecked' | 'onChange' | 'size'> & {
  checked?: CheckedState;
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: InputHTMLAttributes<HTMLInputElement>['onChange'];
  /** 右侧可点击标签；不传时请提供 aria-label 或放在 Field 里配 Label */
  label?: ReactNode;
  /** 标签下方说明（aria-describedby） */
  description?: ReactNode;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function Checkbox({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  onChange,
  label,
  description,
  invalid: invalidProp,
  className,
  id: idProp,
  disabled: disabledProp,
  required: requiredProp,
  'aria-describedby': describedByProp,
  ref: refProp,
  ...props
}: CheckboxProps) {
  const [inner, setInner] = useState<CheckedState>(defaultChecked);
  const state = checkedProp ?? inner;
  const ctl = useFieldControl({
    id: idProp,
    invalid: invalidProp,
    disabled: disabledProp,
    required: requiredProp,
    'aria-describedby': describedByProp,
  });
  const descId = `${ctl.id}-desc`;
  const describedBy = [description != null && descId, ctl.describedBy].filter(Boolean).join(' ') || undefined;

  const el = useRef<HTMLInputElement | null>(null);
  const setRef = (node: HTMLInputElement | null) => {
    el.current = node;
    if (typeof refProp === 'function') refProp(node);
    else if (refProp) (refProp as { current: HTMLInputElement | null }).current = node;
  };
  // indeterminate 只能通过 DOM 属性设置
  useEffect(() => {
    if (el.current) el.current.indeterminate = state === 'indeterminate';
  }, [state]);

  const on = state === true;
  const mixed = state === 'indeterminate';

  const box = (
    <span data-cds="Checkbox" className="relative inline-flex size-4 shrink-0">
      <input
        ref={setRef}
        id={ctl.id}
        type="checkbox"
        checked={on}
        disabled={ctl.disabled}
        required={ctl.required}
        aria-invalid={ctl.invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          if (checkedProp === undefined) setInner(e.target.checked);
          onCheckedChange?.(e.target.checked);
          onChange?.(e);
        }}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-sm opacity-0 disabled:cursor-not-allowed pointer-coarse:-inset-3.5"
        {...props}
      />
      {/* 底 + 边框：未选中时 surface-3 + text-muted 1px 内嵌 */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-sm bg-surface-3 shadow-[inset_0_0_0_1px_var(--cds-text-muted)] dark:shadow-[inset_0_0_0_1px_var(--cds-text-secondary)]',
          ctl.invalid
            ? 'shadow-[inset_0_0_0_1px_var(--cds-fill-danger)] dark:shadow-[inset_0_0_0_1px_var(--cds-fill-danger)]'
            : // 悬停（含悬停关联的 <label>，浏览器会把 :hover 转给控件）：边框加深一级，瞬时切换
              'peer-enabled:peer-hover:shadow-[inset_0_0_0_1px_var(--cds-text-secondary)] dark:peer-enabled:peer-hover:shadow-[inset_0_0_0_1px_var(--cds-text-primary)]',
          ctl.invalid ? 'peer-focus-visible:shadow-focus-danger' : 'peer-focus-visible:shadow-focus',
          'peer-disabled:opacity-50',
        )}
      />
      {/* 选中填充：只动 opacity */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-sm bg-accent-brand opacity-0 shadow-[inset_0_0_0_1px_var(--cds-accent-hover)] transition-opacity duration-(--cds-dur-fast) ease-swift',
          // 选中 / 半选时悬停：填充换成 accent-hover（只改颜色）
          'peer-enabled:peer-hover:bg-accent-hover',
          (on || mixed) && 'opacity-100',
          'peer-disabled:opacity-0',
          (on || mixed) && 'peer-disabled:opacity-50',
        )}
      />
      {/* 对勾 / 横杠：scale + opacity */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 flex scale-50 items-center justify-center text-accent-fg opacity-0',
          'transition-[transform,opacity] duration-(--cds-dur-snap) ease-overshoot [&_svg]:size-3',
          (on || mixed) && 'scale-100 opacity-100',
          'peer-disabled:opacity-0',
          (on || mixed) && 'peer-disabled:opacity-60',
        )}
      >
        {mixed ? <Minus weight="bold" /> : <Check weight="bold" />}
      </span>
    </span>
  );

  if (label == null) return <span className={cn('inline-flex', className)}>{box}</span>;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <div className="flex h-5 items-center">{box}</div>
      <div className="min-w-0 leading-5">
        <label
          htmlFor={ctl.id}
          className={cn('text-[14px]', ctl.disabled ? 'cursor-not-allowed text-text-secondary' : 'cursor-pointer text-text-primary')}
        >
          {label}
        </label>
        {description != null && (
          <p id={descId} className="text-[12.5px] leading-[1.125rem] text-text-secondary">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
