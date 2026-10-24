// Code view with GitHub-style line anchors (#L12, #L10-L20, Shift-click to extend,
// highlight + scroll into view; legacy #n12 links are rewritten to #L12), and a
// Markdown body whose code blocks get MioUI copy buttons.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { CopyButton } from '@/components/ui/copy-button';
import { useI18n } from '@/app/i18n';

export interface LineSel { a: number; b: number }

/** "#L12" | "#L10-L20" | "#L10-20" | legacy "#n12" -> selection, clamped to the file */
export function parseLineHash(hash: string, max: number): LineSel | null {
  const m = /^#L(\d+)(?:-L?(\d+))?$/.exec(hash) ?? /^#n(\d+)()$/.exec(hash);
  if (!m) return null;
  let a = parseInt(m[1], 10);
  let b = m[2] ? parseInt(m[2], 10) : a;
  if (!a || !b) return null;
  if (a > b) [a, b] = [b, a];
  a = Math.min(Math.max(1, a), max);
  b = Math.min(Math.max(1, b), max);
  return { a, b };
}

export const lineHash = (s: LineSel | null) => (!s ? '' : s.a === s.b ? `#L${s.a}` : `#L${s.a}-L${s.b}`);

/** set the hash without a navigation (React Router keeps its own state in history.state) */
function writeHash(hash: string) {
  const u = new URL(location.href);
  u.hash = hash;
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}

/** the file's line selection, kept in the URL hash */
export function useLineSelection(lineCount: number) {
  const [sel, setSel] = useState<LineSel | null>(() => (typeof location === 'undefined' ? null : parseLineHash(location.hash, lineCount)));
  const scrollPending = useRef(!!sel);
  useEffect(() => {
    // legacy #n12 -> #L12, once
    if (/^#n\d+$/.test(location.hash)) {
      const s = parseLineHash(location.hash, lineCount);
      if (s) writeHash(lineHash(s));
    }
    const onHash = () => {
      const s = parseLineHash(location.hash, lineCount);
      if (s && /^#n\d+$/.test(location.hash)) writeHash(lineHash(s));
      setSel(s);
      if (s) scrollPending.current = true;
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, [lineCount]);
  const select = useCallback((next: LineSel | null) => {
    setSel(next);
    writeHash(lineHash(next));
  }, []);
  return { sel, select, scrollPending };
}

export function CodeLines({ lines }: { lines: string[] }) {
  const { t } = useI18n();
  const { sel, select, scrollPending } = useLineSelection(lines.length);
  const anchor = useRef<number | null>(sel?.a ?? null);
  const numsRef = useRef<HTMLPreElement>(null);

  // scroll the first selected line into view (on load and on hash changes), below the sticky top bar
  useLayoutEffect(() => {
    if (!sel || !scrollPending.current) return;
    scrollPending.current = false;
    const el = numsRef.current?.querySelector<HTMLElement>(`#L${sel.a}`);
    // an instant jump: the reader asked for this line (smooth scrolling here only delays it)
    el?.scrollIntoView({ block: sel.b - sel.a > 8 ? 'start' : 'center', behavior: 'auto' });
  }, [sel, scrollPending]);

  const onNum = (e: MouseEvent<HTMLAnchorElement>, n: number) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.button !== 0) return; // new tab etc.: leave the link alone
    e.preventDefault();
    if (e.shiftKey && anchor.current) {
      select({ a: Math.min(anchor.current, n), b: Math.max(anchor.current, n) });
    } else if (sel && sel.a === n && sel.b === n) {
      // clicking the only selected line again clears the selection
      anchor.current = null;
      select(null);
    } else {
      anchor.current = n;
      select({ a: n, b: n });
    }
  };

  return (
    <div className="overflow-x-auto" data-cds-scroll-fade="horizontal">
      <table className="blob">
        <tbody>
          <tr>
            <td className="linenumbers">
              <pre ref={numsRef} aria-label={t('Line numbers. Click to select a line, Shift-click to select a range.', '行号。点击选中一行，按住 Shift 点击选中一段。')}>
                {lines.map((_, i) => {
                  const n = i + 1;
                  const on = !!sel && n >= sel.a && n <= sel.b;
                  return (
                    <a key={i} id={`L${n}`} href={`#L${n}`} onClick={(e) => onNum(e, n)} className={on ? 'is-sel' : undefined} aria-current={on && n === sel!.a ? 'location' : undefined}>
                      {n}
                    </a>
                  );
                })}
              </pre>
            </td>
            <td className="lines">
              {sel && <div aria-hidden className="line-sel" style={{ top: `calc(12px + ${(sel.a - 1) * 1.25}rem)`, height: `${(sel.b - sel.a + 1) * 1.25}rem` }} />}
              {/* highlighted server-side (src/ui/highlight.ts escapes every token) */}
              <pre>
                <code dangerouslySetInnerHTML={{ __html: lines.map((l) => l || ' ').join('\n') }} />
              </pre>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** the plain text of server-highlighted lines (for "copy file") */
export function linesText(lines: string[]): string {
  const el = document.createElement('div');
  el.innerHTML = lines.join('\n');
  return (el.textContent ?? '') + (lines.length ? '\n' : '');
}

/**
 * Sanitized server-rendered Markdown (README / .md files) with a copy button on
 * every code block: each <pre> is wrapped once, and a MioUI CopyButton is portaled
 * into the wrapper (React never touches the injected markup otherwise).
 */
export function MarkdownBody({ html, className = 'md' }: { html: string; className?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<{ host: HTMLElement; pre: HTMLPreElement }[]>([]);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const out: { host: HTMLElement; pre: HTMLPreElement }[] = [];
    root.querySelectorAll('pre').forEach((pre) => {
      let wrap = pre.parentElement;
      if (!wrap?.classList.contains('md-pre')) {
        wrap = document.createElement('div');
        wrap.className = 'md-pre';
        pre.replaceWith(wrap);
        wrap.appendChild(pre);
      }
      let host = wrap.querySelector<HTMLElement>(':scope > .md-copy');
      if (!host) {
        host = document.createElement('div');
        host.className = 'md-copy';
        wrap.appendChild(host);
      }
      out.push({ host, pre });
    });
    setHosts(out);
  }, [html]);
  return (
    <>
      {/* server-rendered + sanitized (src/ui/markdown.ts); the page CSP is the backstop */}
      <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />
      {hosts.map(({ host, pre }, i) =>
        createPortal(
          <CopyButton value={() => (pre.textContent ?? '').replace(/\n$/, '')} size="xs" variant="ghost" labels={{ copy: t('Copy code', '复制代码'), copied: t('Copied', '已复制'), failed: t('Copy failed', '复制失败') }} />,
          host,
          `md-copy-${i}`,
        ),
      )}
    </>
  );
}
