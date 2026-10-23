'use client';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { useImeSafeEnter } from '@/lib/use-ime-safe-enter';
import { fieldSurface, fieldSurfaceInvalid, useFieldControl } from '@/components/ui/field';

/* ==========================================================================
   Textarea —— 多行输入。
   - 自适应高度：`field-sizing: content`（Chromium 123+ / Safari 26+）；不支持时退回
     「height:auto → scrollHeight」测量（只在 !CSS.supports 时启用，零额外开销）。
     上限 min(40svh, 24rem)（spec/02 §B9），超出后内部滚动；下限 minRows 行。
   - 字数计数：showCount 显示「n / maxLength」（tabular-nums）；limit="hard" 用原生 maxLength
     截断，"soft" 允许超出但标红并 aria-invalid。读屏只在剩余 ≤10% 时播报，避免每个字都念。
   - Enter：传 onSubmit 后 Enter 提交、Shift+Enter 换行，复用 lib/use-ime-safe-enter 两层守卫，
     中文输入法选词的 Enter 不会误提交。
   - 字号 16px（≥16px 防 iOS 聚焦缩放），行高 1.5。
   ========================================================================== */

const supportsFieldSizing = () => typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

/** 默认的剩余字数播报文案（可用 formatRemaining 本地化） */
const defaultRemaining = (n: number) => (n >= 0 ? `${n} characters remaining` : `${-n} characters over the limit`);

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onSubmit' | 'value' | 'defaultValue'> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 随内容自动增高（默认 true）；false 时可手动纵向拖拽 */
  autoResize?: boolean;
  /** 最少显示几行（默认 3） */
  minRows?: number;
  /** 最多增高到几行；不传时上限 min(40svh, 24rem) */
  maxRows?: number;
  /** 显示字数计数（需要 maxLength 才显示「/ 上限」） */
  showCount?: boolean;
  /** hard：原生截断；soft：允许超出，标红 + aria-invalid（默认 hard） */
  limit?: 'hard' | 'soft';
  /** 剩余字数播报文案，n < 0 表示超出 */
  formatRemaining?: (remaining: number) => string;
  /** Enter 提交（Shift+Enter 换行；输入法选词的 Enter 不触发） */
  onSubmit?: (value: string) => void;
  invalid?: boolean;
  /** 作用于外层容器（className 作用于 textarea 本身） */
  wrapperClassName?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onChange,
  autoResize = true,
  minRows = 3,
  maxRows,
  showCount = false,
  limit = 'hard',
  maxLength,
  formatRemaining = defaultRemaining,
  onSubmit,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  invalid: invalidProp,
  className,
  wrapperClassName,
  style,
  ref: refProp,
  id: idProp,
  disabled: disabledProp,
  required: requiredProp,
  'aria-describedby': describedByProp,
  ...props
}: TextareaProps) {
  const [inner, setInner] = useState(defaultValue);
  const value = valueProp ?? inner;
  const count = value.length; // UTF-16 码元，与原生 maxLength 的计数方式一致
  const over = maxLength != null && count > maxLength;
  const ctl = useFieldControl({
    id: idProp,
    invalid: invalidProp,
    disabled: disabledProp,
    required: requiredProp,
    'aria-describedby': describedByProp,
  });
  const invalid = ctl.invalid || (limit === 'soft' && over);
  const countId = `${ctl.id}-count`;
  const describedBy = [ctl.describedBy, showCount && countId].filter(Boolean).join(' ') || undefined;

  const el = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (node: HTMLTextAreaElement | null) => {
    el.current = node;
    if (typeof refProp === 'function') refProp(node);
    else if (refProp) (refProp as { current: HTMLTextAreaElement | null }).current = node;
  };

  // field-sizing 回退：仅在不支持时按 scrollHeight 设高度（CSS 的 max-height 仍然生效）
  const [fallback, setFallback] = useState(false);
  useEffect(() => setFallback(autoResize && !supportsFieldSizing()), [autoResize]);
  useLayoutEffect(() => {
    const node = el.current;
    if (!fallback || !node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [fallback, value]);

  const ime = useImeSafeEnter<HTMLTextAreaElement>((e) => onSubmit?.(e.currentTarget.value));

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    if (valueProp === undefined) setInner(e.target.value);
    onValueChange?.(e.target.value);
    onChange?.(e);
  };

  // 行高 1.5em + 上下内边距 8px×2；1px 内嵌边是 box-shadow，不占高度
  const sizeStyle: CSSProperties = {
    // 触屏下至少 44px（--cds-touch-min），行数更多时仍取更大者
    minHeight: `max(calc(${minRows} * 1.5em + 1rem), var(--cds-touch-min, 0px))`,
    ...(autoResize && { maxHeight: maxRows ? `calc(${maxRows} * 1.5em + 1rem)` : 'min(40svh, 24rem)' }),
    ...style,
  };

  const remaining = maxLength != null ? maxLength - count : null;
  const announce = remaining != null && remaining <= Math.max(1, Math.floor(maxLength! * 0.1));

  return (
    <div data-cds="Textarea" className={cn('flex min-w-0 flex-col gap-1', wrapperClassName)}>
      <textarea
        ref={setRef}
        id={ctl.id}
        value={value}
        onChange={handleChange}
        disabled={ctl.disabled}
        required={ctl.required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        maxLength={limit === 'hard' ? maxLength : undefined}
        rows={minRows}
        onCompositionStart={(e) => {
          ime.onCompositionStart();
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          ime.onCompositionEnd(e);
          onCompositionEnd?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (!e.defaultPrevented && onSubmit) ime.onKeyDown(e);
        }}
        style={sizeStyle}
        className={cn(
          'block w-full min-w-0 rounded-lg px-3 py-2 text-[16px] leading-[1.5] font-normal pointer-coarse:[--cds-touch-min:2.75rem]',
          'placeholder:text-text-placeholder read-only:cursor-default',
          fieldSurface,
          invalid && fieldSurfaceInvalid,
          autoResize ? 'resize-none [field-sizing:content]' : 'resize-y',
          className,
        )}
        {...props}
      />
      {showCount && (
        <div className="flex justify-end">
          <span
            id={countId}
            data-over={over || undefined}
            className="text-[12px] leading-4 text-text-secondary tabular-nums data-over:text-danger"
          >
            {maxLength != null ? `${count} / ${maxLength}` : count}
          </span>
          <span aria-live="polite" className="sr-only">
            {announce && remaining != null ? formatRemaining(remaining) : ''}
          </span>
        </div>
      )}
    </div>
  );
}
