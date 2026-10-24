// "t" file finder (GitHub's "Go to file"): every path at the current ref, fuzzy
// matched as you type. Built on the MioUI CommandDialog pattern (top-aligned Dialog,
// plain search row + one hairline, combobox + listbox + aria-activedescendant,
// two-layer IME guard on Enter, polite result-count announcements, ↑↓ / Ctrl+Home·End,
// 44px rows on touch screens) with its matchCommand scoring tuned for paths.
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { File, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import { Dialog } from '@/components/ui/dialog';
import { Input, Kbd } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/feedback';
import { useImeSafeEnter } from '@/lib/use-ime-safe-enter';
import { cn } from '@/lib/cn';
import { load } from '@/app/api';
import { useI18n } from '@/app/i18n';
import { filesApi } from '@/app/paths';

const LIMIT = 50;

/** matchCommand from MioUI command-dialog: substring first, else a subsequence (runs and word starts score) */
function match(text: string, query: string): { score: number; indices: number[] } | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const s = text.toLowerCase();
  const at = s.lastIndexOf(q);
  if (at >= 0) return { score: 100 - at * 0.1 + (at === 0 || s[at - 1] === '/' ? 50 : 0), indices: Array.from({ length: q.length }, (_, i) => at + i) };
  const indices: number[] = [];
  const chars = q.replace(/\s+/g, '');
  let score = 0;
  let prev = -2;
  let j = 0;
  for (let i = 0; i < s.length && j < chars.length; i++) {
    if (s[i] !== chars[j]) continue;
    indices.push(i);
    score += i === prev + 1 ? 6 : 1;
    if (i === 0 || /[\s\-_/.]/.test(s[i - 1])) score += 4;
    prev = i;
    j++;
  }
  return j < chars.length ? null : { score: score - s.length * 0.05, indices };
}

function Hl({ text, from, indices, active }: { text: string; from: number; indices: Set<number>; active: boolean }) {
  const parts: { s: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const hit = indices.has(from + i);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.s += text[i];
    else parts.push({ s: text[i], hit });
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className={cn('bg-transparent font-semibold', active ? 'text-text-primary' : 'text-accent-text')}>
            {p.s}
          </mark>
        ) : (
          <Fragment key={i}>{p.s}</Fragment>
        ),
      )}
    </>
  );
}

export function FileFinder({ open, onOpenChange, base, h, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; base: string; h?: string | null; onPick: (path: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [data, setData] = useState<{ paths: string[]; truncated: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [announce, setAnnounce] = useState('');
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const api = filesApi(base, h);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    let live = true;
    setErr('');
    void load<{ paths?: string[]; truncated?: boolean; error?: string }>(api, 5 * 60_000).then((r) => {
      if (!live) return;
      if (r.status === 200 && r.body.paths) setData({ paths: r.body.paths, truncated: !!r.body.truncated });
      else setErr(r.body.error || t('Could not load the file list.', '文件列表加载失败。'));
    });
    return () => {
      live = false;
    };
  }, [open, api, t]);

  const results = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data.paths.slice(0, LIMIT).map((p) => ({ p, idx: new Set<number>() }));
    const out: { p: string; score: number; idx: Set<number> }[] = [];
    for (const p of data.paths) {
      const m = match(p, query);
      if (!m) continue;
      // a hit inside the file name beats one in the folders
      const nameAt = p.lastIndexOf('/') + 1;
      const bonus = m.indices.length && m.indices[0] >= nameAt ? 20 : 0;
      out.push({ p, score: m.score + bonus, idx: new Set(m.indices) });
    }
    out.sort((a, b) => b.score - a.score || a.p.length - b.p.length);
    return out.slice(0, LIMIT);
  }, [data, query]);

  // announce the count, debounced (not on every keystroke)
  useEffect(() => {
    if (!data) return;
    const id = setTimeout(() => setAnnounce(t(`${results.length}${results.length === LIMIT ? '+' : ''} files`, `${results.length}${results.length === LIMIT ? '+' : ''} 个文件`)), 300);
    return () => clearTimeout(id);
  }, [results.length, data, t]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (p: string | undefined) => {
    if (!p) return;
    onOpenChange(false);
    onPick(p);
  };
  const ime = useImeSafeEnter<HTMLInputElement>(() => pick(results[active]?.p));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return ime.onKeyDown(e);
    const n = results.length;
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      if (n) setActive((a) => (a + 1) % n);
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      if (n) setActive((a) => (a - 1 + n) % n);
    } else if (e.ctrlKey && e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.ctrlKey && e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, n - 1));
    } else ime.onKeyDown(e);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      align="top"
      hideClose
      aria-label={t('Go to file', '查找文件')}
      bodyClassName="p-0"
      onEscapeKeyDown={(e) => {
        // two-step Esc: clear the query first, close on the second press
        if (query) {
          e.preventDefault();
          setQuery('');
        }
      }}
    >
      <div className="@container/finder flex max-h-[min(70dvh,32rem)] flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2.5 px-4 shadow-[inset_0_calc(-1*var(--cds-ring-hairline))_0_var(--cds-border)]">
          <MagnifyingGlass aria-hidden className="size-4 shrink-0 text-text-secondary" />
          <Input
            variant="plain"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            aria-label={t('Search files', '搜索文件')}
            placeholder={t('Go to file…', '输入文件名查找…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onCompositionStart={ime.onCompositionStart}
            onCompositionEnd={ime.onCompositionEnd}
            onKeyDown={onKey}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-autofocus
            className="h-12 min-w-0 flex-1 text-[15px]"
          />
          <Kbd aria-hidden className="shrink-0 @max-[384px]/finder:hidden">
            esc
          </Kbd>
        </div>
        <div ref={listRef} id={listId} role="listbox" aria-label={t('Files', '文件')} className="min-h-0 flex-1 overflow-y-auto p-1.5" data-cds-scroll-fade="vertical">
          {err ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-body text-danger">
              <WarningCircle aria-hidden className="size-4" /> {err}
            </div>
          ) : !data ? (
            <div className="flex flex-col gap-2 p-2" aria-busy="true" aria-label={t('Loading', '加载中')}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-7" style={{ width: `${70 - i * 9}%` }} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-body font-medium">{t('No matching files', '没有匹配的文件')}</p>
              <p className="mt-1 text-footnote text-text-secondary [overflow-wrap:anywhere]">{t(`Nothing matches “${query}”.`, `没有文件匹配“${query}”。`)}</p>
            </div>
          ) : (
            results.map((r, i) => {
              const cut = r.p.lastIndexOf('/') + 1;
              const on = i === active;
              return (
                <div
                  key={r.p}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={on}
                  onPointerMove={() => setActive(i)}
                  onClick={() => pick(r.p)}
                  className={cn('flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1 text-body pointer-coarse:min-h-11', on && 'bg-ghost-selected')}
                >
                  <File aria-hidden className="size-4 shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                    {cut > 0 && (
                      <span className={on ? 'text-text-primary' : 'text-text-secondary'}>
                        <Hl text={r.p.slice(0, cut)} from={0} indices={r.idx} active={on} />
                      </span>
                    )}
                    <span className="font-medium text-text-primary">
                      <Hl text={r.p.slice(cut)} from={cut} indices={r.idx} active={on} />
                    </span>
                  </span>
                  {on && (
                    <Kbd aria-hidden className="shrink-0 text-text-primary @max-[480px]/finder:hidden">
                      ↵
                    </Kbd>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 px-4 py-2 text-[12px] text-text-hint shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)] @max-[480px]/finder:hidden">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t('navigate', '选择')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>↵</Kbd> {t('open', '打开')}
          </span>
          {data?.truncated && <span className="ms-auto">{t('Showing the first 20,000 files', '只列出前 20000 个文件')}</span>}
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {announce}
        </span>
      </div>
    </Dialog>
  );
}
