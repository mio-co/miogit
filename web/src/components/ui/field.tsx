'use client';
import { WarningCircle } from '@phosphor-icons/react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Field / Label / HelperText / ErrorText —— 表单字段的统一写法。

   Field 生成一组 id 并放进 context：
     控件      id = `${id}`          ← Label htmlFor 指向它（原生控件）
     标签      id = `${id}-label`    ← 非原生控件（RadioGroup、Slider）用 aria-labelledby
     说明      id = `${id}-helper`
     错误      id = `${id}-error`
   HelperText / ErrorText 挂载时登记自己，控件只把「真的存在」的 id 拼进 aria-describedby，
   不会指向空 id。invalid 时控件带 aria-invalid，焦点环换成 danger 三层环。
   ========================================================================== */

export interface FieldState {
  id: string;
  labelId: string;
  helperId: string;
  errorId: string;
  invalid: boolean;
  disabled: boolean;
  required: boolean;
  hasHelper: boolean;
  hasError: boolean;
  setHasHelper: (v: boolean) => void;
  setHasError: (v: boolean) => void;
}

const FieldContext = createContext<FieldState | null>(null);

/** 读取所在 Field 的状态；不在 Field 内时为 null */
export function useField() {
  return useContext(FieldContext);
}

export interface FieldControlProps {
  id?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
}

/**
 * 控件接入 Field：合并 id、disabled、required、invalid 与 aria-describedby。
 * 控件自己的 props 优先（显式传入的 id / invalid 不会被 Field 覆盖），describedby 两边合并。
 */
export function useFieldControl(props: FieldControlProps) {
  const field = useField();
  const auto = useId();
  const id = props.id ?? field?.id ?? auto;
  const invalid = props.invalid ?? field?.invalid ?? false;
  const disabled = props.disabled ?? field?.disabled ?? false;
  const required = props.required ?? field?.required ?? false;
  const describedBy =
    [props['aria-describedby'], field?.hasHelper && field.helperId, field?.hasError && field.errorId].filter(Boolean).join(' ') ||
    undefined;
  const labelledBy = props['aria-labelledby'] ?? field?.labelId;
  return { id, invalid, disabled, required, describedBy, labelledBy, inField: field != null };
}

/* ---------- 字段外观（Textarea / Select 共用）：surface-3 底 + 1px 内嵌发丝边，box-shadow 不进盒模型。
   边框 / 焦点环切换是瞬时的：动效只允许 transform / opacity，所以这里不给 box-shadow 加过渡。 ---------- */
export const fieldSurface =
  'bg-surface-3 text-text-primary shadow-field outline-none ' +
  'hover:shadow-field-strong focus-visible:shadow-focus ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
/** 校验失败：红色内框 + danger 焦点环 */
export const fieldSurfaceInvalid =
  'shadow-[inset_0_0_0_1px_var(--cds-fill-danger)] hover:shadow-[inset_0_0_0_1px_var(--cds-fill-danger)] focus-visible:shadow-focus-danger';

export type FieldProps = HTMLAttributes<HTMLDivElement> & {
  /** 控件 id；不传时自动生成 */
  id?: string;
  /** 校验失败：控件 aria-invalid + 红色边框与焦点环 */
  invalid?: boolean;
  disabled?: boolean;
  /** 必填：Label 显示 *，控件带 aria-required / required */
  required?: boolean;
};

/** 纵向字段容器：Label + 控件 + HelperText / ErrorText，间距 6px */
export function Field({ id: idProp, invalid = false, disabled = false, required = false, className, children, ...props }: FieldProps) {
  const auto = useId();
  const id = idProp ?? `field-${auto.replace(/:/g, '')}`;
  const [hasHelper, setHasHelper] = useState(false);
  const [hasError, setHasError] = useState(false);
  const value = useMemo<FieldState>(
    () => ({
      id,
      labelId: `${id}-label`,
      helperId: `${id}-helper`,
      errorId: `${id}-error`,
      invalid,
      disabled,
      required,
      hasHelper,
      hasError,
      setHasHelper,
      setHasError,
    }),
    [id, invalid, disabled, required, hasHelper, hasError],
  );
  return (
    <FieldContext.Provider value={value}>
      <div
        data-cds="Field"
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        className={cn('flex min-w-0 flex-col gap-1.5', className)}
        {...props}
      >
        {children}
      </div>
    </FieldContext.Provider>
  );
}

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  /** 显示必填星号；在 Field 内默认跟随 Field 的 required */
  required?: boolean;
  /** 「可选」等补充文字，次要色 */
  hint?: ReactNode;
};

/** 字段标签：13px / 500；星号 aria-hidden，必填语义由控件的 required / aria-required 表达 */
export function Label({ className, required, hint, htmlFor, id, children, onClick, ...props }: LabelProps) {
  const field = useField();
  const req = required ?? field?.required ?? false;
  const disabled = field?.disabled ?? false;
  const target = htmlFor ?? field?.id;
  return (
    <label
      id={id ?? field?.labelId}
      htmlFor={target}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !target) return;
        // RadioGroup / Slider 不是原生可标注元素，<label for> 不会转交焦点：手动聚焦它的 Tab 停靠点
        const el = document.getElementById(target);
        if (!el || 'labels' in el) return;
        const stop = el.matches('[tabindex="0"]') ? el : el.querySelector<HTMLElement>('[tabindex="0"]');
        stop?.focus();
      }}
      data-cds="Label"
      className={cn(
        'inline-flex items-baseline gap-1 text-[13px] leading-5 font-medium select-none',
        disabled ? 'text-text-secondary' : 'text-text-primary',
        className,
      )}
      {...props}
    >
      {children}
      {req && (
        <span aria-hidden className="text-danger">
          *
        </span>
      )}
      {hint != null && <span className="font-normal text-text-secondary">{hint}</span>}
    </label>
  );
}

/** 说明文字：12.5px，secondary（AA）。在 Field 内自动被控件的 aria-describedby 引用 */
export function HelperText({ className, id, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const field = useField();
  const set = field?.setHasHelper;
  useEffect(() => {
    if (!set) return;
    set(true);
    return () => set(false);
  }, [set]);
  return (
    <p
      id={id ?? field?.helperId}
      data-cds="HelperText"
      className={cn('text-[12.5px] leading-[1.125rem] text-text-secondary', className)}
      {...props}
    />
  );
}

/**
 * 错误信息：无内容时不渲染；出现时 role="alert" 即时播报，并被控件 aria-describedby 引用。
 * 文字用 text-danger（浅 #c81e1e / 深 #f87171，均 ≥4.5:1）。
 */
export function ErrorText({ className, id, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const field = useField();
  const set = field?.setHasError;
  const empty = children == null || children === false || children === '';
  useEffect(() => {
    if (!set || empty) return;
    set(true);
    return () => set(false);
  }, [set, empty]);
  if (empty) return null;
  return (
    <p
      id={id ?? field?.errorId}
      role="alert"
      data-cds="ErrorText"
      className={cn(
        'flex items-start gap-1 text-[12.5px] leading-[1.125rem] text-danger [&_svg]:mt-[0.1875rem] [&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      <WarningCircle weight="fill" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
