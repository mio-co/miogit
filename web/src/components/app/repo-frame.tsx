// Repository chrome (title + tabs) around every repository page, public and console.
// The frame stays mounted while you move between Code / Commits / Branches, so the
// tab indicator slides (MioUI Tabs, motion layoutId) and only the content below swaps.
import { BookBookmark, Code, ClockCounterClockwise, GearSix, GitBranch } from '@phosphor-icons/react';
import { useLoaderData, useLocation, useParams, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Res } from '@/app/api';
import type { Meta, View, RepoSettings } from '@/app/types';
import { boot } from '@/app/boot';
import { useI18n } from '@/app/i18n';
import { AppLink } from '@/app/link';
import { repoPath } from '@/app/format';
import { BlobView, CommitView, EmptyRepoView, ErrorView, LogView, RefsView, SummaryView, TagView, TreeView, type RepoCtx } from './repo-views';
import { SettingsView } from './settings-view';

function tabOf(splat: string): 'code' | 'log' | 'branches' {
  const first = splat.split('/')[0];
  if (first === 'log' || first === 'commit') return 'log';
  if (first === 'branches' || first === 'tags' || first === 'tag') return 'branches';
  return 'code';
}

const TabLink = (p: { href: string; className?: string; children?: React.ReactNode; 'aria-current'?: 'page'; 'data-state'?: string; id?: string }) => <AppLink {...p} />;

export function RepoChrome({ repo, meta, consoleMode, active, priv }: { repo: string; meta: Meta | null; consoleMode: boolean; active: string; priv?: boolean }) {
  const { t } = useI18n();
  const base = consoleMode ? `/~mio/r/${repoPath(repo)}` : `/${repoPath(repo)}`;
  const ref = meta?.ref;
  const onDefault = !ref || !meta?.head || ref === meta.head;
  const qs = ref && !onDefault ? `?h=${encodeURIComponent(ref)}` : '';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <BookBookmark className="size-5 shrink-0 text-text-secondary" aria-hidden />
        <h1 className="min-w-0 truncate text-title font-semibold">
          <AppLink href={`${base}/`} className="cds-focus rounded-sm hover:text-accent-text">
            {repo}
          </AppLink>
        </h1>
        {consoleMode && priv && <Badge variant="accent">{t('Private', '私有')}</Badge>}
      </div>
      <Tabs value={active} variant="line" layoutId={`repo-tabs:${consoleMode ? 'c' : 'p'}`} linkComponent={TabLink}>
        <nav aria-label={t('Repository', '仓库')}>
          <TabsList aria-label={t('Repository', '仓库')} role="none" className="-mx-1">
            <TabsTrigger value="code" href={onDefault ? `${base}/` : `${base}/tree/${qs}`} icon={<Code />}>
              {t('Code', '代码')}
            </TabsTrigger>
            <TabsTrigger value="log" href={`${base}/log/${qs}`} icon={<ClockCounterClockwise />}>
              {t('Commits', '提交')}
            </TabsTrigger>
            <TabsTrigger value="branches" href={`${base}/branches/`} icon={<GitBranch />}>
              {t('Branches', '分支')}
            </TabsTrigger>
            {consoleMode && (
              <TabsTrigger value="settings" href={`/~mio/repos/${repoPath(repo)}`} icon={<GearSix />}>
                {t('Settings', '设置')}
              </TabsTrigger>
            )}
          </TabsList>
        </nav>
      </Tabs>
    </div>
  );
}

export function RepoFrame({ consoleMode }: { consoleMode: boolean }) {
  const { t } = useI18n();
  const params = useParams();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const res = useLoaderData() as Res<View> | null;
  const repo = params.repo ?? '';
  const splat = params['*'] ?? '';
  const v = (res?.body ?? { kind: 'error', error: 'no data' }) as View;
  const meta = v.meta ?? null;
  const base = consoleMode ? `/~mio/r/${repoPath(repo)}` : `/${repoPath(repo)}`;
  const h = sp.get('h');
  const c: RepoCtx | null = meta
    ? { base, repo, meta, editBase: consoleMode || boot.signed ? `/~mio/edit/${repoPath(repo)}` : null }
    : null;
  let body: React.ReactNode;
  if (v.kind === 'error' || !c) {
    // no meta = the repository itself is missing (or unreachable): back to the list, not into the missing repo
    const err = v.kind === 'error' ? v.error : ((res?.body as { error?: string } | undefined)?.error ?? 'error');
    const back = meta ? { href: `${base}/`, label: t('Back to repository', '返回仓库') } : { href: consoleMode ? '/~mio/' : '/', label: t('All repositories', '全部仓库') };
    body = <ErrorView status={res?.status ?? 404} error={err} back={back} />;
  } else if (v.kind === 'summary') body = <SummaryView v={v} c={c} />;
  else if (v.kind === 'empty') body = <EmptyRepoView v={v} />;
  else if (v.kind === 'tree') body = <TreeView v={v} c={c} h={h} />;
  else if (v.kind === 'blob') body = <BlobView v={v} c={c} h={h} />;
  else if (v.kind === 'log') body = <LogView key={loc.search} v={v} c={c} h={h} />;
  else if (v.kind === 'branches' || v.kind === 'tags') body = <RefsView v={v} c={c} />;
  else if (v.kind === 'commit') body = <CommitView v={v} c={c} />;
  else body = <TagView v={v} c={c} />;
  const title = `${repo} · ${boot.site}`;
  if (document.title !== title) document.title = title;
  return (
    <div className="flex flex-col gap-5">
      {meta && <RepoChrome repo={repo} meta={meta} consoleMode={consoleMode} active={tabOf(splat)} priv={meta?.priv} />}
      <div key={loc.pathname + loc.search} className="mio-page-in min-w-0">
        {body}
      </div>
    </div>
  );
}

export function SettingsFrame() {
  const params = useParams();
  const loc = useLocation();
  const res = useLoaderData() as Res<RepoSettings & { error?: string }> | null;
  const repo = params.repo ?? '';
  const info = res?.status === 200 ? res.body : null;
  const title = `${repo} · settings`;
  if (document.title !== title) document.title = title;
  return (
    <div className="flex flex-col gap-5">
      <RepoChrome repo={repo} meta={null} consoleMode active="settings" priv={info?.private} />
      <div key={loc.pathname} className="mio-page-in min-w-0">
        {info ? <SettingsView info={info} /> : <ErrorView status={res?.status ?? 404} error={res?.body?.error ?? 'not found'} back={{ href: '/~mio/', label: 'MioGit' }} />}
      </div>
    </div>
  );
}
