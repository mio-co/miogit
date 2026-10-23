// Repository list (index + console). MioUI Card / Badge / Segmented / EmptyState.
import { useMemo, useState } from 'react';
import { Books } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { EmptyState } from '@/components/ui/empty-state';
import type { RepoItem } from '@/app/types';
import { useI18n } from '@/app/i18n';
import { age, fmtBytes, repoPath } from '@/app/format';
import { AppLink } from '@/app/link';
import { boot } from '@/app/boot';
import { StaggerItem } from './stagger';

export function RepoList({ repos, linkBase = '', signedIn = false }: { repos: RepoItem[]; linkBase?: string; signedIn?: boolean }) {
  const { t, lang } = useI18n();
  const [sort, setSort] = useState<'time' | 'name'>('time');
  const list = useMemo(
    () => (sort === 'name' ? [...repos].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())) : repos),
    [repos, sort],
  );
  if (!repos.length) {
    return (
      <EmptyState
        icon={<Books />}
        title={t('No repositories yet', '还没有仓库')}
        description={
          <>
            {t('Create one by pushing to a new name:', '推送到一个新名字即可创建：')}
            <code className="mt-2 block rounded-md bg-fill-secondary px-2 py-1 font-mono text-[12.5px]">git push https://&lt;this-host&gt;/myrepo.git main</code>
          </>
        }
      />
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-footnote text-text-secondary tabular-nums">{t(`${repos.length} ${repos.length === 1 ? "repository" : "repositories"}`, `${repos.length} 个仓库`)}</span>
        {repos.length > 1 && (
          <Segmented
            ariaLabel={t('Sort', '排序')}
            value={sort}
            onChange={setSort}
            layoutId="repo-sort"
            options={[
              { value: 'time', label: t('Recently updated', '最近更新') },
              { value: 'name', label: t('Name', '名称') },
            ]}
          />
        )}
      </div>
      <ul className="overflow-hidden rounded-card bg-surface-2 shadow-panel">
        {list.map((r, i) => (
          <StaggerItem key={r.name} i={i} className="mio-row relative px-4 py-3.5 shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)] first:shadow-none sm:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AppLink
                href={`${linkBase}/${repoPath(r.name)}/`}
                className="cds-focus min-w-0 truncate rounded-sm text-[15px] font-semibold text-accent-text after:absolute after:inset-0 after:content-['']"
              >
                {r.name}
              </AppLink>
              {r.private && <Badge variant="accent">{t('Private', '私有')}</Badge>}
            </div>
            <p className="mt-1 text-body text-text-secondary">{r.description || t('No description', '暂无描述')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-footnote text-text-secondary">
              {r.lang && (
                <span className="inline-flex items-center gap-1.5 text-text-primary">
                  <i aria-hidden className="inline-block size-2.5 rounded-full shadow-[inset_0_0_0_1px_var(--cds-border)]" style={{ background: r.langColor || 'var(--cds-text-muted)' }} />
                  {r.lang}
                </span>
              )}
              {(r.owner || boot.owner) && <span>{r.owner || boot.owner}</span>}
              {signedIn && (r.bytes ?? 0) > 0 && <span className="tabular-nums">{fmtBytes(r.bytes!)}</span>}
              <time dateTime={new Date(r.idle).toISOString()} title={new Date(r.idle).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'} className="tabular-nums">
                {age(Math.floor(r.idle / 1000), lang)}
              </time>
            </div>
          </StaggerItem>
        ))}
      </ul>
    </section>
  );
}
