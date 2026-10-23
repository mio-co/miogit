'use client';
import { CaretRight, DotsThree } from '@phosphor-icons/react';
import { useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* ==========================================================================
   Breadcrumb —— 面包屑（WAI-ARIA Breadcrumb 模式）。
   - <nav aria-label> > <ol>；最后一项是当前页：纯文本 + aria-current="page"，不是链接。
   - 折叠省略：层级超过 maxItems 时，保留前 itemsBeforeCollapse 项与后 itemsAfterCollapse 项，
     中间折成「…」按钮（aria-expanded + aria-controls 指向被折叠的那组），点击就地展开并把焦点移到第一个展开项。
   - 长标题单行截断（maxItemWidth），title 属性保留全文；整体可换行，375px 下不撑破页面。
   - 分隔符 aria-hidden，RTL 自动镜像；触屏（pointer: coarse）链接与按钮命中高 ≥44px。
   - 链接默认渲染 <a href>；Next.js 客户端路由用 renderLink 换成 <Link>。
   ========================================================================== */

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  /** 可选图标（如首页） */
  icon?: ReactNode;
  /** 截断时的完整标题（label 不是字符串时提供） */
  title?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** 超过多少项开始折叠，默认 4；设为 0 不折叠 */
  maxItems?: number;
  itemsBeforeCollapse?: number;
  itemsAfterCollapse?: number;
  separator?: ReactNode;
  /** nav 的读屏名称 */
  'aria-label'?: string;
  /** 「…」按钮的读屏名称，参数为被折叠的层数 */
  expandLabel?: (hidden: number) => string;
  /** 单项最大宽度（CSS 长度），默认 12em */
  maxItemWidth?: string;
  /** 点击链接时回调（可 preventDefault 改为客户端路由） */
  onNavigate?: (item: BreadcrumbItem, index: number, e: MouseEvent<HTMLAnchorElement>) => void;
  /** 自定义链接渲染（如 next/link）；必须把 props 展开到可聚焦元素上 */
  renderLink?: (item: BreadcrumbItem, props: { className: string; title?: string; children: ReactNode }) => ReactNode;
  className?: string;
}

const linkCls =
  'cds-focus inline-flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-text-secondary outline-none transition-colors duration-(--cds-dur-snap) ease-swift hover:text-text-primary hover:underline underline-offset-4 decoration-hairline-strong [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-center';

export function Breadcrumb({
  items,
  maxItems = 4,
  itemsBeforeCollapse = 1,
  itemsAfterCollapse = 2,
  separator,
  'aria-label': ariaLabel = 'Breadcrumb',
  expandLabel = (n) => `Show ${n} hidden levels`,
  maxItemWidth = '12em',
  onNavigate,
  renderLink,
  className,
}: BreadcrumbProps) {
  const [expanded, setExpanded] = useState(false);
  const groupId = useId();
  const firstHidden = useRef<HTMLElement | null>(null);
  const n = items.length;
  const before = Math.max(1, itemsBeforeCollapse);
  const after = Math.max(1, itemsAfterCollapse);
  const canCollapse = maxItems > 0 && n > maxItems && n > before + after + 1;
  const collapsed = canCollapse && !expanded;

  const sep = (
    <li role="presentation" aria-hidden className="flex shrink-0 items-center text-text-secondary [&_svg]:size-3.5 rtl:[&_svg]:-scale-x-100">
      {separator ?? <CaretRight weight="bold" />}
    </li>
  );

  const crumb = (it: BreadcrumbItem, i: number, refFirst?: boolean) => {
    const last = i === n - 1;
    const title = it.title ?? (typeof it.label === 'string' ? it.label : undefined);
    const inner = (
      <>
        {it.icon && <span className="flex shrink-0 [&_svg]:size-4">{it.icon}</span>}
        <span className="truncate" style={{ maxWidth: maxItemWidth }}>
          {it.label}
        </span>
      </>
    );
    let node: ReactNode;
    if (last || !it.href) {
      node = (
        <span
          aria-current={last ? 'page' : undefined}
          title={title}
          className={cn(
            'inline-flex min-w-0 items-center gap-1 px-1 py-0.5 [@media(pointer:coarse)]:min-h-11',
            last ? 'font-medium text-text-primary' : 'text-text-secondary',
          )}
        >
          {inner}
        </span>
      );
    } else if (renderLink) {
      node = renderLink(it, { className: linkCls, title, children: inner });
    } else {
      node = (
        <a
          href={it.href}
          title={title}
          ref={refFirst ? (el) => void (firstHidden.current = el) : undefined}
          onClick={(e) => onNavigate?.(it, i, e)}
          className={linkCls}
        >
          {inner}
        </a>
      );
    }
    return (
      <li key={i} className="flex min-w-0 items-center">
        {node}
      </li>
    );
  };

  const withSep = (nodes: ReactNode[]) => nodes.flatMap((node, k) => (k === 0 ? [node] : [<SepKey key={`s${k}`}>{sep}</SepKey>, node]));

  let body: ReactNode;
  if (!canCollapse) {
    body = withSep(items.map((it, i) => crumb(it, i)));
  } else {
    const head = items.slice(0, before).map((it, i) => crumb(it, i));
    const midStart = before;
    const midEnd = n - after;
    const mid = items.slice(midStart, midEnd);
    const tail = items.slice(midEnd).map((it, k) => crumb(it, midEnd + k));
    const ellipsis = (
      <li key="ellipsis" className="flex items-center" hidden={!collapsed}>
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={groupId}
          aria-label={expandLabel(mid.length)}
          onClick={() => {
            setExpanded(true);
            // 展开后焦点移到第一个展开项，读屏能顺着读下去
            requestAnimationFrame(() => firstHidden.current?.focus());
          }}
          className="cds-focus cds-hit relative inline-flex h-6 min-w-7 items-center justify-center rounded-sm text-text-secondary outline-none transition-colors duration-(--cds-dur-snap) ease-swift hover:bg-ghost-hover hover:text-text-primary [&_svg]:size-4"
        >
          <DotsThree weight="bold" />
        </button>
      </li>
    );
    const group = (
      <li key="group" id={groupId} hidden={collapsed} className={collapsed ? undefined : 'contents'}>
        <ol className="contents">{withSep(mid.map((it, k) => crumb(it, midStart + k, k === 0)))}</ol>
      </li>
    );
    body = [...withSep(head), <SepKey key="s-mid">{sep}</SepKey>, ellipsis, group, <SepKey key="s-tail">{sep}</SepKey>, ...withSep(tail)];
  }

  return (
    <nav aria-label={ariaLabel} data-cds="Breadcrumb" className={cn('min-w-0 max-w-full', className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-0 text-[13.5px] leading-5">{body}</ol>
    </nav>
  );
}

function SepKey({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
