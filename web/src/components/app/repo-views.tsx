// Repository pages. Every block is a MioUI component (Card, Badge, Button / LinkButton /
// IconButton / ButtonGroup, DropdownMenu, Segmented, Breadcrumb, CopyButton / CopyField,
// Collapsible, EmptyState, Select, SearchInput, Tag) composed into the old page layouts.
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowLeft,
  BookOpen,
  CaretLeft,
  CaretRight,
  ChartBar,
  Check,
  Code,
  Database,
  DownloadSimple,
  File,
  FileText,
  Folder,
  GitBranch,
  GitCommit,
  GitDiff,
  ClockCounterClockwise,
  Image as ImageIcon,
  Link as LinkIcon,
  PencilSimple,
  Tag as TagIcon,
  Warning,
  X,
  CaretDown,
} from '@phosphor-icons/react';
import { Button, ButtonGroup, IconButton, LinkButton } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { CopyButton } from '@/components/ui/copy-button';
import { CopyField, SearchInput } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import type { Brief, Deco, Entry, Hunk, Meta, View } from '@/app/types';
import { useI18n } from '@/app/i18n';
import { age, day, encPath, fmtBytes, isoUtc } from '@/app/format';
import { AppLink } from '@/app/link';
import { cn } from '@/lib/cn';
import { StaggerItem } from './stagger';

export interface RepoCtx {
  /** "/<repo>" or "/~mio/r/<repo>" */
  base: string;
  repo: string;
  meta: Meta;
  /** where the console editor lives, when the visitor may use it */
  editBase: string | null;
}

const rowCls = 'shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)] first:shadow-none';
const cardHead = 'flex min-h-11 flex-wrap items-center gap-2 bg-surface-1 px-4 py-2 text-body shadow-[inset_0_calc(-1*var(--cds-ring-hairline))_0_var(--cds-border)]';

function q(h?: string | null) {
  return h ? `?h=${encodeURIComponent(h)}` : '';
}

export function Age({ t: secs }: { t: number }) {
  const { lang } = useI18n();
  return (
    <time dateTime={new Date(secs * 1000).toISOString()} title={isoUtc(secs)} className="whitespace-nowrap tabular-nums">
      {age(secs, lang)}
    </time>
  );
}

// ---------------------------------------------------------------------------
// branch picker (DropdownMenu of links) + counts row
// ---------------------------------------------------------------------------
export function BranchMenu({ c, target }: { c: RepoCtx; target: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  if (!c.meta.branches.length) return null;
  return (
    <DropdownMenu
      aria-label={t('Switch branch', '切换分支')}
      className="max-h-80 w-64 overflow-y-auto"
      trigger={
        <Button variant="secondary" size="sm" startIcon={<GitBranch />} endIcon={<CaretDown className="opacity-60" />} title={t('Switch branch', '切换分支')}>
          <span className="max-w-40 truncate font-mono text-[12.5px]">{c.meta.ref}</span>
        </Button>
      }
    >
      <DropdownMenuLabel>{t('Switch branch', '切换分支')}</DropdownMenuLabel>
      {c.meta.branches.map((b) => (
        <DropdownMenuItem key={b} checked={b === c.meta.ref} onSelect={() => nav(`${target}?h=${encodeURIComponent(b)}`)}>
          <span className="font-mono text-[12.5px]">{b}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}

function CountLink({ href, icon, n, label }: { href: string; icon: ReactNode; n: ReactNode; label: string }) {
  return (
    <AppLink
      href={href}
      className="cds-focus inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-text-secondary transition-colors duration-(--cds-dur-snap) hover:bg-ghost-hover hover:text-text-primary [&_svg]:size-3.5"
    >
      {icon}
      <b className="font-semibold text-text-primary tabular-nums">{n}</b>
      {label}
    </AppLink>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>;
}

function DecoBadges({ deco, c }: { deco: Deco[]; c: RepoCtx }) {
  if (!deco.length) return null;
  return (
    <>
      {deco.map((d) => (
        <AppLink key={d.type + d.name} href={d.type === 'branch' ? `${c.base}/log/${q(d.name)}` : `${c.base}/tag/${q(d.name)}`} className="cds-focus rounded-full">
          <Badge variant={d.type === 'branch' ? 'accent' : 'neutral'} mono>
            {d.type === 'branch' ? <GitBranch /> : <TagIcon />}
            {d.name}
          </Badge>
        </AppLink>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// file list (code page + tree page)
// ---------------------------------------------------------------------------
function FileRows({ c, prefix, entries, h, up }: { c: RepoCtx; prefix: string[]; entries: Entry[]; h?: string | null; up?: string }) {
  const { t } = useI18n();
  return (
    <ul>
      {up !== undefined && (
        <li className={cn('mio-row relative flex items-center gap-2 px-4 py-2 text-body', rowCls)}>
          <Folder weight="fill" className="size-4 shrink-0 text-accent-text" aria-hidden />
          <AppLink href={up} className="cds-focus rounded-sm after:absolute after:inset-0" title={t('Parent directory', '上级目录')} aria-label={t('Parent directory', '上级目录')}>
            ..
          </AppLink>
        </li>
      )}
      {entries.map((e, i) => {
        const href = `${c.base}/tree/${encPath([...prefix, e.name])}${q(h)}`;
        const icon =
          e.type === 'tree' ? (
            <Folder weight="fill" className="size-4 shrink-0 text-accent-text" aria-hidden />
          ) : e.type === 'commit' ? (
            <LinkIcon className="size-4 shrink-0 text-text-secondary" aria-hidden />
          ) : /\.(png|jpe?g|gif|webp|avif|ico|svg)$/i.test(e.name) ? (
            <ImageIcon className="size-4 shrink-0 text-text-secondary" aria-hidden />
          ) : (
            <File className="size-4 shrink-0 text-text-secondary" aria-hidden />
          );
        return (
          <StaggerItem key={e.name} i={i} className={cn('mio-row relative flex min-w-0 items-center gap-2 px-4 py-2 text-body', rowCls)}>
            {icon}
            {e.type === 'commit' ? (
              <span className="min-w-0 truncate">
                {e.name} @ <span className="font-mono text-[12px]">{e.oid?.slice(0, 7)}</span>
              </span>
            ) : (
              <AppLink href={href} className="cds-focus min-w-0 truncate rounded-sm text-text-primary hover:text-accent-text hover:underline after:absolute after:inset-0">
                {e.name}
              </AppLink>
            )}
            <span className="ms-auto shrink-0 font-mono text-[11.5px] text-text-secondary tabular-nums">{e.size !== undefined ? fmtBytes(e.size) : ''}</span>
          </StaggerItem>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Code page (summary)
// ---------------------------------------------------------------------------
export function SummaryView({ v, c }: { v: Extract<View, { kind: 'summary' }>; c: RepoCtx }) {
  const { t } = useI18n();
  const m = v.meta;
  const stem = `${c.base}/snapshot/${encodeURIComponent(c.repo.split('/').pop() ?? c.repo)}-${encodeURIComponent(v.snapRef)}`;
  const nCommits = typeof v.commits === 'number' ? v.commits : 1001;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Bar>
          <BranchMenu c={c} target={`${c.base}/tree/`} />
          <CountLink href={`${c.base}/branches/`} icon={<GitBranch />} n={m.nBranches} label={t(m.nBranches === 1 ? 'branch' : 'branches', '个分支')} />
          <CountLink href={`${c.base}/tags/`} icon={<TagIcon />} n={m.nTags} label={t(m.nTags === 1 ? 'tag' : 'tags', '个标签')} />
          <CountLink href={`${c.base}/log/`} icon={<ClockCounterClockwise />} n={v.commits} label={t(nCommits === 1 ? 'commit' : 'commits', '次提交')} />
        </Bar>
        <Card className="overflow-hidden">
          {v.last && (
            <div className={cardHead}>
              <span className="font-medium text-text-primary">{v.last.author}</span>
              <AppLink href={`${c.base}/commit/?id=${v.last.oid}`} className="cds-focus min-w-0 flex-1 truncate rounded-sm text-text-secondary hover:text-accent-text hover:underline">
                {v.last.subject}
              </AppLink>
              <span className="flex shrink-0 items-center gap-1.5 text-footnote text-text-secondary">
                <AppLink href={`${c.base}/commit/?id=${v.last.oid}`} className="cds-focus rounded-sm font-mono text-[12px] hover:text-accent-text">
                  {v.last.oid.slice(0, 7)}
                </AppLink>
                <span aria-hidden>·</span>
                <Age t={v.last.time} />
              </span>
            </div>
          )}
          <FileRows c={c} prefix={[]} entries={v.files} />
        </Card>
        {v.readme && <ReadmeCard r={v.readme} />}
      </div>
      <aside className="flex min-w-0 flex-col gap-6 text-body">
        <section className="flex flex-col gap-2">
          <h2 className="text-heading font-semibold">{t('About', '简介')}</h2>
          <p className={cn('text-text-secondary', !m.desc && 'italic')}>{m.desc || t('No description provided.', '暂无描述。')}</p>
          <ul className="flex flex-col gap-1.5 text-text-secondary [&_svg]:size-4">
            {v.readme && (
              <li>
                <a href="#readme" className="cds-focus inline-flex items-center gap-2 rounded-sm hover:text-accent-text">
                  <BookOpen /> README
                </a>
              </li>
            )}
            <li>
              <a href={`${c.base}/stats/`} className="cds-focus inline-flex items-center gap-2 rounded-sm hover:text-accent-text">
                <ChartBar /> {t('Activity', '活跃度')}
              </a>
            </li>
            {v.bytes > 0 && (
              <li className="inline-flex items-center gap-2 tabular-nums">
                <Database /> {fmtBytes(v.bytes)}
              </li>
            )}
          </ul>
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-heading font-semibold">{t('Clone', '克隆')}</h2>
          <CopyField value={v.cloneUrl} aria-label="clone url" copyLabel={t('Copy', '复制')} copiedLabel={t('Copied', '已复制')} />
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`${stem}.zip`} size="xs" startIcon={<DownloadSimple />}>
              {t('Download ZIP', '下载 ZIP')}
            </LinkButton>
            <LinkButton href={`${stem}.tar.gz`} size="xs" startIcon={<DownloadSimple />}>
              tar.gz
            </LinkButton>
          </div>
        </section>
        {v.langs.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-heading font-semibold">{t('Languages', '语言')}</h2>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-ghost-hover" role="img" aria-label={v.langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(', ')}>
              {v.langs.map((l) => (
                <span key={l.name} className="block min-w-0.5" style={{ width: `${l.pct}%`, background: l.color }} title={`${l.name} ${l.pct.toFixed(1)}%`} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-footnote text-text-secondary">
              {v.langs.map((l) => (
                <li key={l.name} className="inline-flex items-center gap-1.5 tabular-nums">
                  <i aria-hidden className="inline-block size-2 rounded-full" style={{ background: l.color }} />
                  <b className="font-semibold text-text-primary">{l.name}</b>
                  {l.pct.toFixed(1)}%
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function ReadmeCard({ r }: { r: { name: string; html?: string; text?: string } }) {
  return (
    <Card id="readme" className="scroll-mt-20 overflow-hidden">
      <div className={cardHead}>
        <BookOpen className="size-4 text-text-secondary" aria-hidden />
        <span className="font-medium">README</span>
      </div>
      {r.html != null ? (
        // server-rendered + sanitized (src/ui/markdown.ts); the page CSP is the backstop
        <div className="md" dangerouslySetInnerHTML={{ __html: r.html }} />
      ) : (
        <pre className="m-0 p-4 font-mono text-[12.5px] whitespace-pre-wrap wrap-anywhere-cjk">{r.text}</pre>
      )}
    </Card>
  );
}

export function EmptyRepoView({ v }: { v: Extract<View, { kind: 'empty' }> }) {
  const { t } = useI18n();
  const cmd = `git remote add origin ${v.cloneUrl}\ngit push -u origin main`;
  return (
    <EmptyState
      icon={<GitBranch />}
      title={t('This repository is empty', '仓库还是空的')}
      description={t('Push an existing repository from the command line:', '在命令行推送已有仓库即可开始：')}
      action={
        <div className="relative w-[min(36rem,80vw)] rounded-panel bg-fill-secondary p-3 pe-12 text-start">
          <pre className="m-0 overflow-x-auto font-mono text-[12.5px]">{cmd}</pre>
          <CopyButton value={cmd} size="sm" className="absolute end-2 top-2" />
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// tree / blob
// ---------------------------------------------------------------------------
function PathBar({ c, path, h }: { c: RepoCtx; path: string[]; h?: string | null }) {
  const { t } = useI18n();
  const items = [{ label: c.repo.split('/').pop() ?? c.repo, href: `${c.base}/tree/${q(h)}` }];
  path.forEach((seg, i) => items.push({ label: seg, href: `${c.base}/tree/${encPath(path.slice(0, i + 1))}${q(h)}` }));
  return (
    <Breadcrumb
      items={items}
      maxItems={6}
      aria-label={t('Breadcrumb', '路径')}
      className="min-w-0 font-mono text-[12.5px]"
      renderLink={(it, p) => <AppLink href={it.href!} {...p} />}
    />
  );
}

export function TreeView({ v, c, h }: { v: Extract<View, { kind: 'tree' }>; c: RepoCtx; h?: string | null }) {
  const { t } = useI18n();
  const historyHref = `${c.base}/log/?${new URLSearchParams({ ...(h ? { h } : {}), ...(v.path.length ? { path: v.path.join('/') } : {}) }).toString()}`.replace(/\?$/, '');
  return (
    <div className="flex flex-col gap-4">
      <Bar>
        <BranchMenu c={c} target={`${c.base}/tree/${encPath(v.path)}`} />
        <PathBar c={c} path={v.path} h={h} />
      </Bar>
      <Card className="overflow-hidden">
        <div className={cardHead}>
          <span className="text-text-secondary tabular-nums">{t(`${v.entries.length} item${v.entries.length === 1 ? '' : 's'}`, `${v.entries.length} 项`)}</span>
          <Button asChild variant="ghost" size="xs" startIcon={<ClockCounterClockwise />} className="ms-auto">
            <AppLink href={historyHref}>{t('History', '历史')}</AppLink>
          </Button>
        </div>
        <FileRows c={c} prefix={v.path} entries={v.entries} h={h} up={v.path.length ? `${c.base}/tree/${encPath(v.path.slice(0, -1))}${q(h)}` : undefined} />
      </Card>
    </div>
  );
}

export function BlobView({ v, c, h }: { v: Extract<View, { kind: 'blob' }>; c: RepoCtx; h?: string | null }) {
  const { t } = useI18n();
  const href = encPath(v.path);
  const name = v.path[v.path.length - 1] ?? '';
  const plain = `${c.base}/plain/${href}${q(h)}`;
  const historyHref = `${c.base}/log/?${h ? `h=${encodeURIComponent(h)}&` : ''}path=${href}`;
  let inner: ReactNode;
  if (v.image) {
    inner = (
      <div className="grid place-items-center bg-surface-1 p-6">
        <img src={plain} alt={name} className="max-h-[70vh] max-w-full rounded-lg shadow-hairline" />
      </div>
    );
  } else if (v.binary) {
    inner = (
      <EmptyState
        className="rounded-none shadow-none"
        icon={<File />}
        title={t('Binary file not shown', '二进制文件，无法预览')}
        description={fmtBytes(v.size)}
        action={
          <LinkButton href={plain} download={name} startIcon={<DownloadSimple />}>
            {t('Download', '下载')}
          </LinkButton>
        }
      />
    );
  } else if (v.html != null) {
    inner = <div className="md" dangerouslySetInnerHTML={{ __html: v.html }} />;
  } else {
    const lines = v.lines ?? [];
    inner = (
      <div className="overflow-x-auto" data-cds-scroll-fade="horizontal">
        <table className="blob">
          <tbody>
            <tr>
              <td className="linenumbers">
                <pre>
                  {lines.map((_, i) => (
                    <a key={i} id={`n${i + 1}`} href={`#n${i + 1}`}>
                      {i + 1}
                    </a>
                  ))}
                </pre>
              </td>
              <td className="lines">
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
  return (
    <div className="flex flex-col gap-4">
      <Bar>
        <BranchMenu c={c} target={`${c.base}/tree/${href}`} />
        <PathBar c={c} path={v.path} h={h} />
      </Bar>
      <Card className="overflow-hidden">
        <div className={cardHead}>
          <span className="inline-flex items-center gap-1.5 text-footnote text-text-secondary tabular-nums">
            {!v.binary && (
              <>
                {t(`${v.lineCount} lines`, `${v.lineCount} 行`)}
                <span aria-hidden>·</span>
              </>
            )}
            {fmtBytes(v.size)}
          </span>
          <div className="ms-auto flex items-center gap-1">
            <ButtonGroup attached>
              <LinkButton href={plain} size="xs">
                {t('Raw', '原始')}
              </LinkButton>
              {!v.binary && (
                <LinkButton href={`${c.base}/blame/${href}${q(h)}`} size="xs">
                  {t('Blame', '追溯')}
                </LinkButton>
              )}
              <Button asChild size="xs">
                <AppLink href={historyHref}>{t('History', '历史')}</AppLink>
              </Button>
            </ButtonGroup>
            <LinkButton href={plain} download={name} variant="ghost" size="xs" icon aria-label={t('Download', '下载')} title={t('Download', '下载')}>
              <DownloadSimple />
            </LinkButton>
            {!v.binary && c.editBase && (
              <LinkButton href={`${c.editBase}/${href}${q(h)}`} variant="ghost" size="xs" icon rel="nofollow" aria-label={t('Edit', '编辑')} title={t('Edit', '编辑')}>
                <PencilSimple />
              </LinkButton>
            )}
          </div>
        </div>
        {inner}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// commits
// ---------------------------------------------------------------------------
export function LogView({ v, c, h }: { v: Extract<View, { kind: 'log' }>; c: RepoCtx; h?: string | null }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [qt, setQt] = useState(v.filter.qt || 'grep');
  const [qq, setQq] = useState(v.filter.q);
  const groups: { day: string; rows: Extract<View, { kind: 'log' }>['commits'] }[] = [];
  for (const e of v.commits) {
    const d = day(e.time);
    if (!groups.length || groups[groups.length - 1].day !== d) groups.push({ day: d, rows: [] });
    groups[groups.length - 1].rows.push(e);
  }
  const params = (ofs: number) => {
    const p = new URLSearchParams();
    if (h) p.set('h', h);
    if (v.filter.q) p.set('q', v.filter.q);
    if (v.filter.q || v.filter.qt !== 'grep') p.set('qt', v.filter.qt);
    if (v.filter.path) p.set('path', v.filter.path);
    if (ofs > 0) p.set('ofs', String(ofs));
    const s = p.toString();
    return `${c.base}/log/${s ? `?${s}` : ''}`;
  };
  const search = (e?: FormEvent) => {
    e?.preventDefault();
    const p = new URLSearchParams();
    if (h) p.set('h', h);
    p.set('qt', qt);
    if (qq) p.set('q', qq);
    if (v.filter.path) p.set('path', v.filter.path);
    nav(`${c.base}/log/?${p.toString()}`);
  };
  const page = Math.floor(v.ofs / v.pageSize) + 1;
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={search} role="search" className="flex flex-wrap items-center gap-2">
        <BranchMenu c={c} target={`${c.base}/log/`} />
        <Select
          aria-label={t('Search in', '搜索范围')}
          value={qt}
          onValueChange={setQt}
          wrapperClassName="w-32"
          options={[
            { value: 'grep', label: t('Message', '提交信息') },
            { value: 'author', label: t('Author', '作者') },
            { value: 'committer', label: t('Committer', '提交者') },
            { value: 'range', label: t('Range', '范围') },
          ]}
        />
        <SearchInput value={qq} onValueChange={setQq} onSearch={() => search()} hotkey={false} placeholder={t('Search commits', '搜索提交')} aria-label={t('Search commits', '搜索提交')} className="min-w-40 flex-1" />
        <Button type="submit">{t('Search', '搜索')}</Button>
      </form>
      {v.filter.path && (
        <div>
          <Badge variant="neutral" className="h-7 gap-1.5 ps-2.5 pe-1 text-[12px]">
            <File /> <span className="font-mono">{v.filter.path}</span>
            <AppLink href={`${c.base}/log/${q(h)}`} className="cds-focus inline-flex size-5 items-center justify-center rounded-full hover:bg-ghost-hover" title={t('Clear', '清除')} aria-label={t('Clear', '清除')}>
              <X />
            </AppLink>
          </Badge>
        </div>
      )}
      {groups.length === 0 ? (
        <EmptyState icon={<GitCommit />} title={t('No matching commits', '没有匹配的提交')} description={v.filter.q ? t('Try another search.', '换个关键词试试。') : undefined} />
      ) : (
        groups.map((g, gi) => (
          <section key={g.day} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-footnote font-medium text-text-secondary [&_svg]:size-4">
              <GitCommit /> {t(`Commits on ${g.day}`, `${g.day} 的提交`)}
            </h2>
            <ul className="overflow-hidden rounded-card bg-surface-2 shadow-panel">
              {g.rows.map((e, i) => (
                <StaggerItem key={e.oid} i={gi * 4 + i} className={cn('mio-row flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', rowCls)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <AppLink href={`${c.base}/commit/?id=${e.oid}`} className="cds-focus min-w-0 rounded-sm font-medium text-text-primary hover:text-accent-text hover:underline wrap-anywhere-cjk">
                        {e.subject}
                      </AppLink>
                      <DecoBadges deco={e.deco} c={c} />
                    </div>
                    <div className="mt-0.5 text-footnote text-text-secondary">
                      <b className="font-semibold text-text-primary">{e.author}</b> {t('committed', '提交于')} <Age t={e.time} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <ButtonGroup attached>
                      <LinkButton href={`${c.base}/commit/?id=${e.oid}`} size="xs" className="font-mono">
                        {e.oid.slice(0, 7)}
                      </LinkButton>
                      <CopyButton value={e.oid} size="xs" variant="secondary" labels={{ copy: t('Copy full SHA', '复制完整 SHA'), copied: t('Copied', '已复制') }} />
                    </ButtonGroup>
                    <BrowseButton href={`${c.base}/tree/?h=${e.oid}`} />
                  </div>
                </StaggerItem>
              ))}
            </ul>
          </section>
        ))
      )}
      {(v.ofs > 0 || v.more) && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
          <PagerButton href={v.ofs > 0 ? params(Math.max(0, v.ofs - v.pageSize)) : null} start>
            {t('Newer', '较新')}
          </PagerButton>
          <span className="text-footnote text-text-secondary tabular-nums">{t(`Page ${page}`, `第 ${page} 页`)}</span>
          <PagerButton href={v.more ? params(v.ofs + v.pageSize) : null}>{t('Older', '较早')}</PagerButton>
        </nav>
      )}
    </div>
  );
}

function BrowseButton({ href }: { href: string }) {
  const { t } = useI18n();
  return (
    <Button asChild variant="ghost" size="xs" icon aria-label={t('Browse the repository at this commit', '浏览此版本的文件')} title={t('Browse the repository at this commit', '浏览此版本的文件')}>
      <AppLink href={href}>
        <Code />
      </AppLink>
    </Button>
  );
}

function PagerButton({ href, start, children }: { href: string | null; start?: boolean; children: ReactNode }) {
  const icon = start ? <CaretLeft /> : <CaretRight />;
  if (!href)
    return (
      <Button disabled startIcon={start ? icon : undefined} endIcon={start ? undefined : icon}>
        {children}
      </Button>
    );
  return (
    <Button asChild startIcon={start ? icon : undefined} endIcon={start ? undefined : icon}>
      <AppLink href={href} rel={start ? 'prev' : 'next'}>
        {children}
      </AppLink>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// branches | tags
// ---------------------------------------------------------------------------
export function RefsView({ v, c }: { v: Extract<View, { kind: 'branches' | 'tags' }>; c: RepoCtx }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const kind = v.kind;
  const stemOf = (name: string) => `${c.base}/snapshot/${encodeURIComponent(c.repo.split('/').pop() ?? c.repo)}-${encodeURIComponent(name)}`;
  const snap = (name: string) => (
    <>
      <LinkButton href={`${stemOf(name)}.zip`} variant="ghost" size="xs" startIcon={<DownloadSimple />}>
        zip
      </LinkButton>
      <LinkButton href={`${stemOf(name)}.tar.gz`} variant="ghost" size="xs" startIcon={<DownloadSimple />}>
        tar.gz
      </LinkButton>
    </>
  );
  const commitLine = (cm: Brief | null, when?: number) =>
    cm ? (
      <>
        <AppLink href={`${c.base}/commit/?id=${cm.oid}`} className="hover:text-accent-text hover:underline">
          {cm.subject}
        </AppLink>
        {' · '}
        {when === undefined ? (
          <>
            <b className="font-semibold text-text-primary">{cm.author}</b> <Age t={cm.time} />
          </>
        ) : (
          <>
            <Age t={when} />
            {' · '}
            <AppLink href={`${c.base}/commit/?id=${cm.oid}`} className="font-mono text-[12px] hover:text-accent-text">
              {cm.oid.slice(0, 7)}
            </AppLink>
          </>
        )}
      </>
    ) : null;
  const count = v.items.length;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Segmented
          ariaLabel={t('Refs', '引用')}
          value={kind}
          layoutId={`refs-switch-${c.base}`}
          onChange={(k) => nav(`${c.base}/${k}/`)}
          options={[
            { value: 'branches', label: t('Branches', '分支'), badge: v.meta.nBranches },
            { value: 'tags', label: t('Tags', '标签'), badge: v.meta.nTags },
          ]}
        />
      </div>
      {count === 0 ? (
        <EmptyState
          icon={kind === 'branches' ? <GitBranch /> : <TagIcon />}
          title={kind === 'branches' ? t('No branches yet', '还没有分支') : t('No tags yet', '还没有标签')}
          description={kind === 'tags' ? <code className="font-mono text-[12.5px]">git tag v1.0 &amp;&amp; git push origin v1.0</code> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className={cardHead}>
            <span className="font-medium">{kind === 'branches' ? t('Branches', '分支') : t('Tags', '标签')}</span>
            <Badge variant="neutral" mono>
              {count}
            </Badge>
          </div>
          <ul>
            {kind === 'branches'
              ? v.items.map((b, i) => (
                  <StaggerItem key={b.name} i={i} className={cn('mio-row flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', rowCls)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <AppLink href={`${c.base}/tree/?h=${encodeURIComponent(b.name)}`} className="cds-focus inline-flex min-w-0 items-center gap-1.5 rounded-sm font-mono text-[13px] font-medium text-accent-text hover:underline [&_svg]:size-4">
                          <GitBranch /> <span className="truncate">{b.name}</span>
                        </AppLink>
                        {'isDefault' in b && b.isDefault && <Badge variant="accent">{t('Default', '默认')}</Badge>}
                      </div>
                      <div className="mt-0.5 text-footnote text-text-secondary">{commitLine(b.commit)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button asChild variant="ghost" size="xs" startIcon={<ClockCounterClockwise />}>
                        <AppLink href={`${c.base}/log/?h=${encodeURIComponent(b.name)}`}>{t('Commits', '提交')}</AppLink>
                      </Button>
                      {snap(b.name)}
                    </div>
                  </StaggerItem>
                ))
              : v.items.map((tg, i) => (
                  <StaggerItem key={tg.name} i={i} className={cn('mio-row flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', rowCls)}>
                    <div className="min-w-0 flex-1">
                      <AppLink href={`${c.base}/tag/?h=${encodeURIComponent(tg.name)}`} className="cds-focus inline-flex min-w-0 items-center gap-1.5 rounded-sm font-mono text-[13px] font-medium text-accent-text hover:underline [&_svg]:size-4">
                        <TagIcon /> <span className="truncate">{tg.name}</span>
                      </AppLink>
                      <div className="mt-0.5 text-footnote text-text-secondary">{commitLine(tg.commit, 'when' in tg ? tg.when : 0)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">{snap(tg.name)}</div>
                  </StaggerItem>
                ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// commit detail + diff
// ---------------------------------------------------------------------------
function HunkRows({ hk }: { hk: Hunk }) {
  let a = hk.aStart;
  let b = hk.bStart;
  return (
    <>
      <tr className="df-hunk">
        <td className="df-n" colSpan={2} />
        <td className="df-c">{`@@ -${hk.aStart},${hk.aLen} +${hk.bStart},${hk.bLen} @@`}</td>
      </tr>
      {hk.ops.map((op, i) => {
        const na = op.tag === 'add' ? '' : String(a++);
        const nb = op.tag === 'del' ? '' : String(b++);
        return (
          <tr key={i} className={`df-${op.tag}`}>
            <td className="df-n">{na}</td>
            <td className="df-n">{nb}</td>
            <td className="df-c">
              <span className="df-sign">{op.tag === 'add' ? '+' : op.tag === 'del' ? '-' : ' '}</span>
              {op.line || ' '}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function CommitView({ v, c }: { v: Extract<View, { kind: 'commit' }>; c: RepoCtx }) {
  const { t } = useI18n();
  const same = v.author.name === v.committer.name && v.author.email === v.committer.email;
  const stem = `${c.base}/snapshot/${encodeURIComponent(c.repo.split('/').pop() ?? c.repo)}-${v.oid.slice(0, 10)}`;
  const totalAdd = v.files.reduce((s, f) => s + f.add, 0);
  const totalDel = v.files.reduce((s, f) => s + f.del, 0);
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[{ label: t('Commits', '提交'), href: `${c.base}/log/` }, { label: <span className="font-mono">{v.oid.slice(0, 7)}</span>, title: v.oid }]}
        aria-label={t('Breadcrumb', '路径')}
        renderLink={(it, p) => <AppLink href={it.href!} {...p} />}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <h2 className="min-w-0 flex-[1_1_16rem] text-headline font-semibold wrap-anywhere-cjk">{v.subject}</h2>
          <DecoBadges deco={v.deco} c={c} />
          <Button asChild size="xs" startIcon={<Code />} className="ms-auto">
            <AppLink href={`${c.base}/tree/?h=${v.oid}`}>{t('Browse files', '浏览文件')}</AppLink>
          </Button>
        </div>
        {v.body && <pre className="mx-4 mt-2 font-sans text-body whitespace-pre-wrap text-text-secondary wrap-anywhere-cjk">{v.body}</pre>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-surface-1 px-4 py-2.5 text-footnote text-text-secondary shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)]">
          <span>
            <b className="font-semibold text-text-primary" title={v.author.email}>
              {v.author.name}
            </b>{' '}
            {t('committed', '提交于')} <Age t={v.author.time} />
            {!same && (
              <>
                {' · '}
                {t('committed by', '提交者')}{' '}
                <b className="font-semibold text-text-primary" title={v.committer.email}>
                  {v.committer.name}
                </b>
              </>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
            {v.parents.length > 0 && (
              <span>
                {t(v.parents.length > 1 ? 'parents' : 'parent', '父提交')}{' '}
                {v.parents.map((p, i) => (
                  <span key={p}>
                    {i > 0 && ' + '}
                    <AppLink href={`${c.base}/commit/?id=${p}`} className="font-mono text-[12px] text-accent-text hover:underline">
                      {p.slice(0, 7)}
                    </AppLink>
                  </span>
                ))}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {t('commit', '提交')} <code className="font-mono text-[12px] text-text-primary">{v.oid.slice(0, 7)}</code>
              <CopyButton value={v.oid} size="xs" variant="ghost" labels={{ copy: t('Copy full SHA', '复制完整 SHA'), copied: t('Copied', '已复制') }} />
            </span>
          </span>
        </div>
      </Card>
      <div className="flex flex-wrap items-center gap-2 text-body text-text-secondary tabular-nums">
        <span>
          {t(`${v.files.length} file${v.files.length === 1 ? '' : 's'} changed`, `${v.files.length} 个文件变更`)} <b className="font-semibold text-success">+{totalAdd}</b>{' '}
          <b className="font-semibold text-danger">−{totalDel}</b>
          {v.truncated && ` · ${t('diff truncated', '差异已截断')}`}
        </span>
        <span className="ms-auto flex flex-wrap gap-1">
          <LinkButton href={`${c.base}/patch/?id=${v.oid}`} variant="ghost" size="xs" startIcon={<FileText />}>
            {t('Patch', '补丁')}
          </LinkButton>
          <LinkButton href={`${stem}.zip`} variant="ghost" size="xs" startIcon={<DownloadSimple />}>
            zip
          </LinkButton>
          <LinkButton href={`${stem}.tar.gz`} variant="ghost" size="xs" startIcon={<DownloadSimple />}>
            tar.gz
          </LinkButton>
        </span>
      </div>
      {v.files.length === 0 ? (
        <EmptyState icon={<GitDiff />} title={t('No changes', '没有变更')} />
      ) : (
        v.files.map((f, i) => (
          <Collapsible key={f.path} defaultOpen={v.files.length <= 20 && f.add + f.del <= 400} className="overflow-hidden rounded-card bg-surface-2 shadow-panel" id={`diff-${i + 1}`}>
            <CollapsibleTrigger showChevron={false} className="group/df flex min-h-10 w-full justify-start gap-2.5 rounded-none bg-surface-1 px-4 py-1.5 font-normal data-[state=open]:shadow-[inset_0_calc(-1*var(--cds-ring-hairline))_0_var(--cds-border)]">
              <CaretRight aria-hidden weight="bold" className="size-3.5 shrink-0 text-text-secondary transition-transform duration-(--cds-dur-snap) ease-snap group-data-[state=open]/df:rotate-90" />
              <span className="inline-flex shrink-0 gap-1.5 font-mono text-[12px] tabular-nums">
                <span className="font-semibold text-success">+{f.add}</span>
                <span className="font-semibold text-danger">−{f.del}</span>
              </span>
              <span className="min-w-0 font-mono text-[12.5px] wrap-anywhere-cjk">{f.path}</span>
              {f.status === 'added' && <Badge variant="success">{t('Added', '新增')}</Badge>}
              {f.status === 'deleted' && <Badge variant="danger">{t('Deleted', '删除')}</Badge>}
              {f.status === 'mode' && (
                <Badge variant="warning" mono>
                  {f.oldMode} → {f.newMode}
                </Badge>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              {f.kind === 'binary' ? (
                <p className="p-4 text-body text-text-secondary">{t('Binary file not shown', '二进制文件，不显示差异')}</p>
              ) : f.kind === 'toolarge' ? (
                <p className="p-4 text-body text-text-secondary">{t('Diff skipped: file too large', '文件太大，已跳过差异')}</p>
              ) : !f.hunks.length ? (
                <p className="p-4 text-body text-text-secondary">{t('No content changes', '内容没有变化')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="df">
                    <tbody>
                      {f.hunks.map((hk, k) => (
                        <HunkRows key={k} hk={hk} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// tag
// ---------------------------------------------------------------------------
export function TagView({ v, c }: { v: Extract<View, { kind: 'tag' }>; c: RepoCtx }) {
  const { t } = useI18n();
  const stem = `${c.base}/snapshot/${encodeURIComponent(c.repo.split('/').pop() ?? c.repo)}-${encodeURIComponent(v.snapName)}`;
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[{ label: t('Tags', '标签'), href: `${c.base}/tags/` }, { label: <span className="font-mono">{v.name}</span>, title: v.name }]}
        aria-label={t('Breadcrumb', '路径')}
        renderLink={(it, p) => <AppLink href={it.href!} {...p} />}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
          <h2 className="flex min-w-0 items-center gap-2 font-mono text-headline font-semibold [&_svg]:size-[18px] [&_svg]:text-text-secondary">
            <TagIcon /> {v.name}
          </h2>
          <Badge variant="neutral">{v.annotated ? t('Annotated', '附注标签') : t('Lightweight', '轻量标签')}</Badge>
        </div>
        {v.message && <pre className="mx-4 mt-2 font-sans text-body whitespace-pre-wrap text-text-secondary">{v.message}</pre>}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface-1 px-4 py-2.5 text-footnote text-text-secondary shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)]">
          {v.tagger && (
            <span>
              <b className="font-semibold text-text-primary" title={v.tagger.email}>
                {v.tagger.name}
              </b>{' '}
              {t('tagged', '标记于')} <Age t={v.tagger.time} />
            </span>
          )}
          <span>
            {t('commit', '提交')}{' '}
            <AppLink href={`${c.base}/commit/?id=${v.commit.oid}`} className="font-mono text-[12px] text-accent-text hover:underline">
              {v.commit.oid.slice(0, 7)}
            </AppLink>{' '}
            {v.commit.subject}
          </span>
        </div>
        <div className="flex gap-1 px-3 py-2 shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)]">
          <LinkButton href={`${stem}.zip`} variant="ghost" size="xs" startIcon={<DownloadSimple />}>
            zip
          </LinkButton>
          <LinkButton href={`${stem}.tar.gz`} variant="ghost" size="xs" startIcon={<DownloadSimple />}>
            tar.gz
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

export function ErrorView({ error, back, status }: { error: string; back: { href: string; label: string }; status: number }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<Warning />}
      title={status === 404 ? t('Not found', '没有找到') : status === 403 ? t('Access denied', '没有权限') : t('Something went wrong', '出错了')}
      description={<span className="text-danger">{error}</span>}
      action={
        <Button asChild startIcon={<ArrowLeft />}>
          <AppLink href={back.href}>{back.label}</AppLink>
        </Button>
      }
    />
  );
}

export { Check, IconButton };
