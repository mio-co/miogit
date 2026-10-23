'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Eye, EyeSlash, MagnifyingGlass, X } from '@phosphor-icons/react';
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { INSTANT, SPRING_PLAYFUL } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { useImeSafeEnter } from '@/lib/use-ime-safe-enter';
import { useField, useFieldControl } from '@/components/ui/field';

/*
  表单字段的 Label / HelperText / ErrorText / Field 与 Textarea 只有一份：
  `@/components/ui/field` 与 `@/components/ui/textarea`。Input / InputGroup（含 SearchInput、
  PasswordInput、CopyField）放进 <Field> 时会自动接上 id、aria-describedby、invalid、disabled、required。
*/

/** 读取 Field 状态；不在 Field 内时 id 只用显式传入的，不生成多余 id */
function useInputField(props: { id?: string; invalid?: boolean; disabled?: boolean; required?: boolean; 'aria-describedby'?: string }) {
  const inField = useField() != null;
  const ctl = useFieldControl(props);
  return { ...ctl, id: inField || props.id ? ctl.id : undefined };
}

/* ==========================================================================
   字段外观：surface-3 底 + 内嵌 1px 发丝边（box-shadow，不进盒模型，切换零抖动）
   悬停 → border-strong；聚焦 → 三层强调色焦点环；校验失败 → 红色内框。
   字号 14px；移动端由全局规则提到 16px 防 iOS 缩放。
   ========================================================================== */
const fieldShell =
  'bg-surface-3 text-text-primary shadow-field ' +
  'transition-[box-shadow,background-color] duration-(--cds-dur-snap) ease-swift ' +
  'hover:shadow-field-strong';
const fieldInvalid =
  'shadow-[inset_0_0_0_1px_var(--cds-fill-danger)] hover:shadow-[inset_0_0_0_1px_var(--cds-fill-danger)] focus-visible:shadow-focus-danger';

export const inputVariants = cva(
  'w-full min-w-0 rounded-lg px-2.5 font-normal outline-none placeholder:text-text-placeholder ' +
    'focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 read-only:cursor-default ' +
    // 触屏命中区 ≥44px（<input> 不能挂 ::after，只能撑高）
    '[@media(pointer:coarse)]:min-h-11 ' +
    fieldShell,
  {
    variants: {
      size: {
        sm: 'h-7 text-[13px]',
        md: 'h-8 text-[14px]',
        lg: 'h-10 px-3 text-[15px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

type FieldSize = 'sm' | 'md' | 'lg';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: FieldSize;
  /** 校验失败：红色内框 + aria-invalid */
  invalid?: boolean;
  /**
   * field（默认）：surface-3 底 + 发丝边 + 焦点环。
   * plain：无底无边无焦点环，交给外层容器画边框与焦点（命令面板搜索行、Composer 等单闭合边框场景）。
   */
  variant?: 'field' | 'plain';
  ref?: Ref<HTMLInputElement>;
};

/** plain 变体：去掉字段外观，外层容器负责边框与焦点环 */
const plainInput = 'rounded-none bg-transparent px-0 shadow-none hover:shadow-none focus-visible:shadow-none';

/** 基础输入框：28 / 32 / 40px，8px 圆角 */
export function Input({ className, size, variant = 'field', invalid: invalidProp, id: idProp, disabled: disabledProp, required: requiredProp, 'aria-describedby': describedByProp, ...props }: InputProps) {
  const ctl = useInputField({ id: idProp, invalid: invalidProp, disabled: disabledProp, required: requiredProp, 'aria-describedby': describedByProp });
  return (
    <input
      data-cds="Input"
      id={ctl.id}
      disabled={ctl.disabled || undefined}
      required={ctl.required || undefined}
      aria-invalid={ctl.invalid || undefined}
      aria-describedby={ctl.describedBy}
      data-variant={variant === 'plain' ? 'plain' : undefined}
      className={cn(inputVariants({ size }), variant === 'plain' ? plainInput : ctl.invalid && fieldInvalid, className)}
      {...props}
    />
  );
}

/* ==========================================================================
   InputGroup：外壳承担唯一边框与焦点环，内部 input 与按钮一律无边框（单闭合边框）
   ========================================================================== */
const groupSize: Record<FieldSize, string> = {
  sm: 'h-7 text-[13px] [&_svg]:size-3.5',
  md: 'h-8 text-[14px] [&_svg]:size-4',
  lg: 'h-10 px-3 text-[15px] [&_svg]:size-[18px]',
};

export type InputGroupProps = Omit<InputProps, 'prefix' | 'variant'> & {
  /** 左侧槽位：图标 / 文本（如 https://） */
  prefix?: ReactNode;
  /** 右侧槽位：按钮 / Kbd / 单位 */
  suffix?: ReactNode;
  /** 作用于内部 <input> 的类名（className 作用于外壳） */
  inputClassName?: string;
};

export function InputGroup({
  prefix,
  suffix,
  className,
  inputClassName,
  size = 'md',
  invalid: invalidProp,
  disabled: disabledProp,
  required: requiredProp,
  id: idProp,
  'aria-describedby': describedByProp,
  ...props
}: InputGroupProps) {
  const ctl = useInputField({ id: idProp, invalid: invalidProp, disabled: disabledProp, required: requiredProp, 'aria-describedby': describedByProp });
  const invalid = ctl.invalid;
  const disabled = ctl.disabled;
  return (
    <div
      data-cds="InputGroup"
      data-disabled={disabled || undefined}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2.5',
        fieldShell,
        groupSize[size],
        '[@media(pointer:coarse)]:min-h-11',
        invalid && fieldInvalid,
        invalid ? 'has-[input:focus-visible]:shadow-focus-danger' : 'has-[input:focus-visible]:shadow-focus',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
    >
      {prefix != null && <span className="flex shrink-0 items-center text-text-secondary">{prefix}</span>}
      <input
        id={ctl.id}
        aria-invalid={invalid || undefined}
        aria-describedby={ctl.describedBy}
        disabled={disabled || undefined}
        required={ctl.required || undefined}
        className={cn(
          'h-full w-full min-w-0 flex-1 bg-transparent font-normal text-text-primary outline-none placeholder:text-text-placeholder disabled:cursor-not-allowed',
          inputClassName,
        )}
        {...props}
      />
      {suffix != null && <span className="-me-1 flex shrink-0 items-center gap-0.5 text-text-secondary">{suffix}</span>}
    </div>
  );
}

/** 字段内的小图标按钮：无边框 ghost（单闭合边框） */
export function FieldIconButton({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'cds-focus cds-hit relative inline-flex size-6 items-center justify-center rounded-md text-text-secondary',
        'transition-[background-color,color] duration-(--cds-dur-snap) ease-swift hover:bg-ghost-hover hover:text-text-primary active:bg-ghost-selected',
        'disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
        className,
      )}
      {...p}
    />
  );
}

/* ==========================================================================
   Kbd：Mono、4px 圆角、柔和填充。颜色走 --cds-kbd-bg / --cds-kbd-fg（bg-kbd / text-kbd-fg）：
   alpha-1 底 + secondary 字，暗色 popover 上 4.76:1、浅色 ≥6.3:1（旧的 alpha-2 底在暗色弹层只有 4.18:1）。
   放在选中行（ghost-selected 底）上时请改 text-text-primary。
   ========================================================================== */
export function Kbd({ className, ...p }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-kbd px-1 font-mono text-[11px] leading-none text-kbd-fg tabular-nums',
        className,
      )}
      {...p}
    />
  );
}

/* ==========================================================================
   SearchInput：放大镜前缀；有值显示 ×；为空显示快捷键提示；按快捷键聚焦；Enter 提交带 IME 两层守卫
   ========================================================================== */
function isEditable(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

export type SearchInputProps = Omit<InputGroupProps, 'prefix' | 'value' | 'defaultValue' | 'onChange' | 'type'> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  /** Enter 提交（中文输入法选词的 Enter 不会触发） */
  onSearch?: (v: string) => void;
  /** 全局聚焦快捷键，默认 "/"；传 false 关闭 */
  hotkey?: string | false;
  clearLabel?: string;
};

export function SearchInput({
  value: valueProp,
  defaultValue = '',
  onValueChange,
  onSearch,
  hotkey = '/',
  clearLabel = 'Clear',
  suffix,
  onKeyDown,
  ref: refProp,
  ...props
}: SearchInputProps) {
  const [inner, setInner] = useState(defaultValue);
  const value = valueProp ?? inner;
  const innerRef = useRef<HTMLInputElement | null>(null);
  const set = (v: string) => {
    if (valueProp === undefined) setInner(v);
    onValueChange?.(v);
  };
  const ime = useImeSafeEnter<HTMLInputElement>(() => onSearch?.(value));

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== hotkey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      innerRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hotkey]);

  const setRef = (el: HTMLInputElement | null) => {
    innerRef.current = el;
    if (typeof refProp === 'function') refProp(el);
    else if (refProp) (refProp as { current: HTMLInputElement | null }).current = el;
  };

  return (
    <InputGroup
      {...props}
      ref={setRef}
      type="search"
      enterKeyHint="search"
      value={value}
      onChange={(e) => set(e.target.value)}
      onCompositionStart={ime.onCompositionStart}
      onCompositionEnd={ime.onCompositionEnd}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
          if (value) {
            e.preventDefault();
            e.stopPropagation();
            set('');
          } else e.currentTarget.blur();
          return;
        }
        ime.onKeyDown(e);
      }}
      inputClassName={cn('[&::-webkit-search-cancel-button]:hidden', props.inputClassName)}
      prefix={<MagnifyingGlass />}
      suffix={
        <>
          {suffix}
          {value ? (
            <FieldIconButton
              aria-label={clearLabel}
              onClick={() => {
                set('');
                innerRef.current?.focus();
              }}
            >
              <X />
            </FieldIconButton>
          ) : hotkey ? (
            <Kbd aria-hidden className="me-1">
              {hotkey}
            </Kbd>
          ) : null}
        </>
      }
    />
  );
}

/* ==========================================================================
   PasswordInput：眼睛切换显隐
   ========================================================================== */
export type PasswordInputProps = Omit<InputGroupProps, 'type'> & {
  showLabel?: string;
  hideLabel?: string;
};

export function PasswordInput({ showLabel = 'Show password', hideLabel = 'Hide password', suffix, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const fieldDisabled = useField()?.disabled;
  return (
    <InputGroup
      autoComplete="current-password"
      {...props}
      type={visible ? 'text' : 'password'}
      suffix={
        <>
          {suffix}
          <FieldIconButton
            aria-label={visible ? hideLabel : showLabel}
            aria-pressed={visible}
            disabled={props.disabled ?? fieldDisabled}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeSlash /> : <Eye />}
          </FieldIconButton>
        </>
      }
    />
  );
}

/* ==========================================================================
   CopyField：只读等宽值（API Key / 链接），可遮罩；复制成功 2.5s 状态机（连点会重新计时）
   ========================================================================== */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const defaultMask = (v: string) => {
  const keep = Math.min(8, Math.floor(v.length / 3));
  return v.slice(0, keep) + '•'.repeat(Math.max(8, Math.min(24, v.length - keep)));
};

export interface CopyFieldProps {
  value: string;
  /** true 使用默认遮罩（保留前缀 + •），或传自定义遮罩函数；带显隐切换 */
  mask?: boolean | ((v: string) => string);
  size?: FieldSize;
  className?: string;
  id?: string;
  'aria-label'?: string;
  copyLabel?: string;
  copiedLabel?: string;
  revealLabel?: string;
  concealLabel?: string;
  onCopy?: (v: string) => void;
}

export function CopyField({
  value,
  mask,
  size = 'md',
  className,
  id,
  'aria-label': ariaLabel,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  revealLabel = 'Reveal',
  concealLabel = 'Hide',
  onCopy,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reduce = useReducedMotionPref();
  useEffect(() => () => clearTimeout(timer.current), []);

  const masked = mask && !revealed;
  const display = masked ? (typeof mask === 'function' ? mask(value) : defaultMask(value)) : value;

  const doCopy = async () => {
    if (!(await copyText(value))) return;
    onCopy?.(value);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  };

  const iconMotion = reduce
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: INSTANT }
    : { initial: { scale: 0.4, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.4, opacity: 0 }, transition: SPRING_PLAYFUL };

  return (
    <InputGroup
      id={id}
      aria-label={ariaLabel}
      size={size}
      readOnly
      value={display}
      onFocus={(e) => e.currentTarget.select()}
      className={className}
      inputClassName="font-mono text-[0.9em] tracking-tight text-text-secondary"
      suffix={
        <>
          {mask && (
            <FieldIconButton aria-label={revealed ? concealLabel : revealLabel} aria-pressed={revealed} onClick={() => setRevealed((r) => !r)}>
              {revealed ? <EyeSlash /> : <Eye />}
            </FieldIconButton>
          )}
          <FieldIconButton aria-label={copied ? copiedLabel : copyLabel} onClick={doCopy} className={copied ? 'text-success hover:text-success' : undefined}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={copied ? 'ok' : 'copy'} className="inline-flex" {...iconMotion}>
                {copied ? <Check weight="bold" /> : <Copy />}
              </motion.span>
            </AnimatePresence>
          </FieldIconButton>
          <span aria-live="polite" className="sr-only">
            {copied ? copiedLabel : ''}
          </span>
        </>
      }
    />
  );
}
