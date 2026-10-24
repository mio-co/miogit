// Compare two refs (/<repo>/compare/<base>...<head>, GitHub's three-dot compare):
// ahead / behind counts, the commits head has that base lacks, and the diff from
// the merge base (the commit page's hunk rendering, DiffFileList).
// MioUI: DropdownMenu (ref pickers), Button / IconButton, Badge, Card, Segmented,
// Alert, EmptyState, CopyButton, ButtonGroup, LinkButton.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowsLeftRight, CaretDown, GitBranch, GitCommit, GitDiff, GitPullRequest, Equals } from '@phosphor-icons/react';
import { Button, ButtonGroup, IconButton, LinkButton } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { CopyButton } from '@/components/ui/copy-button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { useI18n } from '@/app/i18n';
import { AppLink } from '@/app/link';
import { day, encPath } from '@/app/format';
import type { CompareView as CV } from '@/app/types';
import { Age, BrowseButton, DecoBadges, DiffFileList, rowCls, type RepoCtx } from './repo-views';
import { StaggerItem } from './stagger';

export const compareHref = (base: string, from: string, to: string) => `${base}/compare/${encPath(from.split('/'))}...${encPath(to.split('/'))}`;

function RefPicker({ label, value, branches, onPick, invalid }: { label: string; value: string; branches: string[]; onPick: (b: string) => void; invalid?: boolean }) {
  const { t } = useI18n();
  return (
    <DropdownMenu
      aria-label={label}
      className="max-h-80 w-64 overflow-y-auto"
      trigger={
        <Button variant="secondary" size="sm" startIcon={<GitBranch />} endIcon={<CaretDown className="opacity-60" />} className={cn('max-w-full', invalid && 'shadow-[inset_0_0_0_1px_var(--cds-fill-danger)]')} aria-label={`${label}: ${value || t('choose', '请选择')}`}>
          <span className="text-text-secondary">{label}:</span>
          <span className="max-w-36 truncate font-mono text-[12.5px] sm:max-w-48">{value || t('choose…', '请选择…')}</span>
        </Button>
      }
    >
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {branches.map((b) => (
        <DropdownMenuItem key={b} checked={b === value} onSelect={() => onPick(b)}>
          <span className="font-mono text-[12.5px]">{b}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}

function Stat({ icon, n, label, capped }: { icon: ReactNode; n: number; label: string; capped?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-body text-text-secondary [&_svg]:size-4">
      {icon}
      <b className="font-semibold text-text-primary tabular-nums">
        {n}
        {capped ? '+' : ''}
      </b>
      {label}
    </span>
  );
}

export function CompareView({ v, c }: { v: CV; c: RepoCtx }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [tab, setTab] = useState<'commits' | 'files'>('commits');
  const branches = v.meta.branches;
  const head = v.head ?? '';
  const go = (from: string, to: string) => to && nav(compareHref(c.base, from, to));
  const commits = v.commits ?? [];
  const files = v.files ?? [];
  const add = files.reduce((s, f) => s + f.add, 0);
  const del = files.reduce((s, f) => s + f.del, 0);
  const identical = v.ready && v.baseOid === v.headOid;

  const groups: { day: string; rows: typeof commits }[] = [];
  for (const e of commits) {
    const d = day(e.time);
    if (!groups.length || groups[groups.length - 1].day !== d) groups.push({ day: d, rows: [] });
    groups[groups.length - 1].rows.push(e);
  }

  let body: ReactNode;
  if (!v.ready) {
    body = v.error ? (
      <EmptyState icon={<GitBranch />} title={t('Nothing to compare', '无法比较')} description={<span className="text-danger [overflow-wrap:anywhere]">{v.missing === 'base' ? t(`No branch, tag or commit named “${v.base}”.`, `没有名为“${v.base}”的分支、标签或提交。`) : t(`No branch, tag or commit named “${head}”.`, `没有名为“${head}”的分支、标签或提交。`)}</span>} />
    ) : (
      <EmptyState
        icon={<GitPullRequest />}
        title={t('Compare changes across branches', '比较分支之间的变化')}
        description={t('Choose the branch to compare. You see the commits it has that the base lacks, and the changes since they split.', '选择要比较的分支：会列出它比基准分支多出的提交，以及分叉以来的全部改动。')}
        action={
          branches.filter((b) => b !== v.base).length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {branches
                .filter((b) => b !== v.base)
                .slice(0, 6)
                .map((b) => (
                  <Button key={b} size="sm" variant="secondary" startIcon={<GitBranch />} onClick={() => go(v.base, b)}>
                    <span className="font-mono text-[12.5px]">{b}</span>
                  </Button>
                ))}
            </div>
          ) : undefined
        }
      />
    );
  } else if (identical) {
    body = <EmptyState icon={<Equals />} title={t('These are identical', '两边完全相同')} description={t(`${v.base} and ${head} point at the same commit.`, `${v.base} 和 ${head} 指向同一个提交。`)} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {!v.related && (
          <Alert variant="warning" title={t('No common history', '没有共同历史')}>
            {t('These refs share no commit, so the diff below compares their trees directly.', '这两个引用没有共同的提交，下面的差异是两边文件树的直接对比。')}
          </Alert>
        )}
        <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <Stat icon={<GitCommit />} n={v.ahead ?? 0} capped={v.capped} label={t(`commit${v.ahead === 1 ? '' : 's'} ahead`, '个提交领先')} />
          <Stat icon={<ArrowLeft />} n={v.behind ?? 0} capped={v.capped} label={t(`commit${v.behind === 1 ? '' : 's'} behind`, '个提交落后')} />
          <Stat icon={<GitDiff />} n={files.length} label={t(`file${files.length === 1 ? '' : 's'} changed`, '个文件变更')} />
          <span className="inline-flex gap-1.5 font-mono text-[12.5px] tabular-nums">
            <b className="font-semibold text-success">+{add}</b>
            <b className="font-semibold text-danger">−{del}</b>
          </span>
          {v.mergeBase && (
            <span className="ms-auto inline-flex items-center gap-1 text-footnote text-text-secondary">
              {t('merge base', '合并基点')}{' '}
              <AppLink href={`${c.base}/commit/?id=${v.mergeBase}`} className="cds-focus rounded-sm font-mono text-[12px] text-accent-text hover:underline">
                {v.mergeBase.slice(0, 7)}
              </AppLink>
            </span>
          )}
        </Card>
        <div>
          <Segmented
            ariaLabel={t('Show', '显示')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'commits', label: t('Commits', '提交'), icon: <GitCommit />, badge: commits.length + (v.moreCommits ? '+' : '') },
              { value: 'files', label: t('Files changed', '文件变更'), icon: <GitDiff />, badge: files.length },
            ]}
          />
        </div>
        {tab === 'commits' ? (
          commits.length === 0 ? (
            <EmptyState icon={<GitCommit />} title={t(`${head} has no commits that ${v.base} lacks`, `${head} 没有 ${v.base} 之外的提交`)} description={t(`It is ${v.behind} behind. Swap the sides to see what it is missing.`, `它落后 ${v.behind} 个提交，交换两边可以看到它缺少的提交。`)} />
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g, gi) => (
                <section key={g.day} className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-2 text-footnote font-medium text-text-secondary [&_svg]:size-4">
                    <GitCommit /> {t(`Commits on ${g.day}`, `${g.day} 的提交`)}
                  </h3>
                  <ul className="overflow-hidden rounded-card bg-surface-2 shadow-panel">
                    {g.rows.map((e, i) => (
                      <StaggerItem key={e.oid} i={gi * 4 + i} className={cn('mio-row flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', rowCls)}>
                        <div className="min-w-[min(100%,14rem)] flex-1">
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
              ))}
              {v.moreCommits && <p className="text-center text-footnote text-text-secondary">{t('Showing the newest 250 commits.', '只显示最新的 250 个提交。')}</p>}
            </div>
          )
        ) : (
          <>
            {v.truncated && <Alert variant="info">{t('The diff is truncated (at most 100 files).', '差异已截断（最多 100 个文件）。')}</Alert>}
            <DiffFileList files={files} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline font-semibold text-balance">{t('Compare changes', '比较变化')}</h2>
        <p className="text-body text-pretty text-text-secondary">{t('Pick a base and a branch to compare. Counts and the diff are measured from where they split.', '选择基准分支和要比较的分支。领先 / 落后和差异都从两者分叉处算起。')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-card bg-surface-1 p-2 shadow-hairline">
        <RefPicker label={t('base', '基准')} value={v.base} branches={branches} onPick={(b) => go(b, head)} invalid={v.missing === 'base'} />
        <ArrowLeft aria-hidden className="size-4 text-text-secondary" />
        <RefPicker label={t('compare', '比较')} value={head} branches={branches} onPick={(b) => go(v.base, b)} invalid={v.missing === 'head'} />
        <IconButton size="sm" variant="ghost" aria-label={t('Swap base and compare', '交换两边')} title={t('Swap base and compare', '交换两边')} disabled={!head} onClick={() => go(head, v.base)} className="ms-auto">
          <ArrowsLeftRight />
        </IconButton>
      </div>
      {body}
    </div>
  );
}
