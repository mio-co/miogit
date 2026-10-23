'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Warning } from '@phosphor-icons/react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/cn';
import { DUR, EASE, INSTANT, SPRING_CONTENT } from '@/lib/motion';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { useImeSafeEnter } from '@/lib/use-ime-safe-enter';
import { Portal, useFocusTrap, useLayer, useScrollLock } from './overlay';
import { Button } from './button';
import { CloseButton } from './close-button';
import { Input } from './input';
import { ErrorText, Label } from './field';

/* ==========================================================================
   Dialog（spec/02 §B4）
   - 6 档宽度：sm 400 · md 520（默认）· lg 720 · xl 880 · 2xl 1024 · 3xl 1152
   - 16px 圆角，--cds-shadow-popover 双层弥散阴影（暗色内侧高光），不再额外加 1px 实线
   - 高度上限 --environment-dialog-cap，内容区内部滚动 + 28px 滚动渐隐
   - 模糊遮罩；焦点陷阱、初始焦点、关闭后焦点归还；Esc 只关最上层（输入法合成中的 Esc 不处理）
   - 嵌套：子弹窗打开时父面板 blur(2px) + 半透明遮罩
   - ring={false}：去掉外圈 1px 描边（浅色外环 / 暗色内侧高光），只保留弥散阴影（shadow-popover-diffuse）。
     默认 true，符合 spec；也可直接用 className 覆盖 shadow-*（tailwind-merge 已登记 popover / popover-diffuse）
   - × 用 CloseButton（ghost IconButton，sm 28px）
   ========================================================================== */
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
const sizes: Record<DialogSize, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[520px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[880px]',
  '2xl': 'max-w-[1024px]',
  '3xl': 'max-w-[1152px]',
};

/** 嵌套计数：子弹窗打开时通知父弹窗 */
const NestCtx = createContext<((delta: 1 | -1) => void) | null>(null);

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** 底部操作区（右对齐，窄屏纵向堆叠） */
  footer?: ReactNode;
  size?: DialogSize;
  /** center（默认）或 top：靠上（命令面板用） */
  align?: 'center' | 'top';
  /** false 时 Esc / 遮罩 / × 都不能关闭（用于异步提交中） */
  dismissible?: boolean;
  /** 点遮罩是否关闭，默认 true */
  closeOnOverlay?: boolean;
  /** 隐藏右上角 × */
  hideClose?: boolean;
  closeLabel?: string;
  /** 无标题时请提供 */
  'aria-label'?: string;
  role?: 'dialog' | 'alertdialog';
  /** 打开时优先聚焦的元素；否则找 [data-autofocus]，再找首个可聚焦元素 */
  initialFocus?: RefObject<HTMLElement | null>;
  /**
   * Esc（分层栈最上层、且不在输入法合成中）时先调用；调用 event.preventDefault() 可阻止关闭，
   * 例如命令面板“有输入时先清空”。
   */
  onEscapeKeyDown?: (event: { preventDefault: () => void }) => void;
  /** 外圈 1px 描边（浅色外环 / 暗色内侧高光）。默认 true（spec）；false 时只保留弥散阴影 */
  ring?: boolean;
  /** 面板类名 */
  className?: string;
  /** 内容区类名（默认带内边距与内部滚动） */
  bodyClassName?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  align = 'center',
  dismissible = true,
  closeOnOverlay = true,
  hideClose,
  closeLabel = 'Close',
  'aria-label': ariaLabel,
  role = 'dialog',
  initialFocus,
  ring = true,
  onEscapeKeyDown,
  className,
  bodyClassName,
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const reduce = useReducedMotionPref();
  const close = () => dismissible && onOpenChange(false);
  const isTop = useLayer(open, () => {
    let prevented = false;
    onEscapeKeyDown?.({ preventDefault: () => (prevented = true) });
    if (!prevented) close();
  });
  useScrollLock(open);
  useFocusTrap(panel, open, { initialFocus, isTop });

  // 嵌套：向父弹窗登记自己，并记录自己的子弹窗数量
  const notifyParent = useContext(NestCtx);
  const [nested, setNested] = useState(0);
  useEffect(() => {
    if (!open || !notifyParent) return;
    notifyParent(1);
    return () => notifyParent(-1);
  }, [open, notifyParent]);
  const onChild = useRef((d: 1 | -1) => setNested((n) => Math.max(0, n + d))).current;

  const panelMotion = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: INSTANT }
    : {
        initial: { opacity: 0, scale: 0.96, y: align === 'top' ? -8 : 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: align === 'top' ? -4 : 4, transition: { duration: 0.15, ease: EASE.out } },
        transition: SPRING_CONTENT,
      };

  const hasHeader = title != null || description != null;

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div
            className={cn(
              'fixed inset-0 z-50 flex justify-center p-4',
              align === 'top' ? 'items-start pt-[min(12vh,7rem)]' : 'items-center',
            )}
          >
            <motion.div
              aria-hidden
              className="fixed inset-0 bg-backdrop backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduce ? INSTANT : { duration: DUR.base, ease: EASE.out }}
              onClick={() => closeOnOverlay && close()}
            />
            <motion.div
              ref={panel}
              role={role}
              aria-modal="true"
              aria-labelledby={title != null ? titleId : undefined}
              aria-describedby={description != null ? descId : undefined}
              aria-label={title != null ? undefined : ariaLabel}
              tabIndex={-1}
              data-cds="Dialog"
              data-nested-dialog-open={nested > 0 || undefined}
              data-ring={ring ? undefined : 'none'}
              className={cn(
                'relative flex max-h-(--environment-dialog-cap) w-full flex-col overflow-hidden rounded-dialog',
                'bg-surface-2 text-text-primary outline-none dark:bg-popover-surface',
                ring ? 'shadow-popover' : 'shadow-popover-diffuse',
                'transition-[filter] duration-(--cds-dur-base) ease-swift data-[nested-dialog-open]:blur-[2px]',
                'after:pointer-events-none after:absolute after:inset-0 after:z-50 after:rounded-[inherit] after:bg-backdrop after:opacity-0 after:transition-opacity after:duration-(--cds-dur-base) data-[nested-dialog-open]:after:opacity-100',
                sizes[size],
                className,
              )}
              {...panelMotion}
            >
              <NestCtx.Provider value={onChild}>
                {hasHeader && (
                  <div className={cn('flex shrink-0 flex-col gap-1.5 px-6 pt-5 pb-1', !hideClose && 'pe-12')}>
                    {title != null && (
                      <h2 id={titleId} className="text-[17px] leading-6 font-semibold text-text-primary">
                        {title}
                      </h2>
                    )}
                    {description != null && (
                      <div id={descId} className="text-[13.5px] leading-5 text-text-secondary">
                        {description}
                      </div>
                    )}
                  </div>
                )}
                <div
                  data-cds-scroll-fade="vertical"
                  className={cn('min-h-0 flex-1 overflow-y-auto px-6', hasHeader ? 'pt-3 pb-5' : 'py-5', footer && 'pb-2', bodyClassName)}
                >
                  {children}
                </div>
                {footer && <DialogFooter>{footer}</DialogFooter>}
                {!hideClose && (
                  <CloseButton
                    aria-label={closeLabel}
                    disabled={!dismissible}
                    onClick={close}
                    data-focus-skip=""
                    className="absolute end-3 top-3"
                  />
                )}
              </NestCtx.Provider>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

export function DialogFooter({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex shrink-0 flex-col-reverse gap-2 px-6 pt-3 pb-5 sm:flex-row sm:justify-end', className)} {...p} />;
}

/* ==========================================================================
   ConfirmDialog：危险确认。异步 onConfirm 期间按钮转圈、锁定并禁止关闭；
   可选“输入名称以确认”（Enter 提交带输入法守卫）。
   ========================================================================== */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** 可返回 Promise；resolve 后自动关闭，reject 时保持打开并显示错误信息 */
  onConfirm: () => void | Promise<void>;
  variant?: 'danger' | 'default';
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** 设置后需要输入完全一致的文本才能确认 */
  confirmText?: string;
  /** 输入框上方提示，例如“输入 xxx 以确认” */
  confirmTextLabel?: ReactNode;
  /** 自定义图标；danger 默认 Warning */
  icon?: ReactNode;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  variant = 'danger',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmText,
  confirmTextLabel,
  icon,
  children,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const guardOk = !confirmText || typed === confirmText;

  const change = (o: boolean) => {
    if (pending) return;
    if (!o) {
      setTyped('');
      setError(null);
    }
    onOpenChange(o);
  };

  const run = async () => {
    if (!guardOk || pending) return;
    setError(null);
    try {
      const r = onConfirm();
      if (r && typeof (r as Promise<void>).then === 'function') {
        setPending(true);
        await r;
      }
      setPending(false);
      setTyped('');
      onOpenChange(false);
    } catch (e) {
      setPending(false);
      setError(e instanceof Error ? e.message : String(e ?? 'Error'));
    }
  };
  const ime = useImeSafeEnter<HTMLInputElement>(() => run());

  const danger = variant === 'danger';
  const ic = icon ?? (danger ? <Warning weight="fill" /> : null);

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      role="alertdialog"
      size="sm"
      dismissible={!pending}
      hideClose
      initialFocus={confirmText ? inputRef : undefined}
      aria-label={typeof title === 'string' ? title : undefined}
      bodyClassName="pt-5 pb-2"
      footer={
        <>
          <Button data-autofocus={confirmText ? undefined : ''} variant="secondary" disabled={pending} onClick={() => change(false)}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!guardOk} loading={pending} onClick={run}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5">
        {ic && (
          <span
            aria-hidden
            className={cn(
              'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-[18px]',
              danger ? 'bg-danger-fill/12 text-danger' : 'bg-accent-soft text-accent-text',
            )}
          >
            {ic}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[16px] leading-6 font-semibold text-text-primary">
            {title}
          </h2>
          {description && <div className="mt-1 text-[13.5px] leading-5 text-text-secondary">{description}</div>}
          {children}
          {confirmText && (
            <div className="mt-4 flex flex-col gap-1.5">
              {confirmTextLabel && (
                <Label htmlFor={inputId} className="font-normal text-text-secondary">
                  {confirmTextLabel}
                </Label>
              )}
              <Input
                id={inputId}
                ref={inputRef}
                value={typed}
                disabled={pending}
                autoComplete="off"
                spellCheck={false}
                placeholder={confirmText}
                className="font-mono text-[13px]"
                onChange={(e) => setTyped(e.target.value)}
                {...ime}
              />
            </div>
          )}
          <ErrorText className="mt-3">{error}</ErrorText>
        </div>
      </div>
    </Dialog>
  );
}
