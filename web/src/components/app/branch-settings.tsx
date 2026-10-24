// Settings → Branches (/~mio/repos/<repo>?s=branches): change the default branch
// (HEAD), create a branch, delete branches other than the default and main.
// Deletes are optimistic (the row leaves at once, comes back on failure) and the
// toast offers "Restore" (re-creates the branch at the commit it pointed to).
// MioUI: SettingRow-style rows, Field / Label / HelperText / ErrorText, Input, Select,
// Button / IconButton, Badge, ConfirmDialog, Skeleton, Alert, toast.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GitBranch, LockSimple, Plus, Trash } from '@phosphor-icons/react';
import { Button, IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Field, HelperText, Label, ErrorText } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toast';
import { useImeSafeEnter } from '@/lib/use-ime-safe-enter';
import { useReducedMotionPref } from '@/lib/use-reduced-motion';
import { EASE, INSTANT, SPRING_CONTENT } from '@/lib/motion';
import { load } from '@/app/api';
import { useI18n } from '@/app/i18n';
import { useSession } from '@/app/session';
import { repoPath } from '@/app/format';
import { AppLink } from '@/app/link';
import type { Brief, View } from '@/app/types';
import { branchProblem, refsAction, writeError } from '@/app/write';
import { Age } from './repo-views';

type Branch = { name: string; isDefault: boolean; commit: Brief | null };

export function BranchSettings({ repo }: { repo: string }) {
  const { t } = useI18n();
  const { session } = useSession();
  const reduce = useReducedMotionPref();
  const [items, setItems] = useState<Branch[] | null>(null);
  const [err, setErr] = useState('');
  const api = `/~mio/api/r/${repoPath(repo)}/view/branches/`;
  const refresh = useCallback(async () => {
    const r = await load<View>(api, 0);
    if (r.status === 200 && r.body.kind === 'branches') {
      setItems([...r.body.items].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.commit?.time ?? 0) - (a.commit?.time ?? 0)));
      setErr('');
    } else setErr((r.body as { error?: string }).error || t('Could not load the branches.', '分支列表加载失败。'));
  }, [api, t]);
  useEffect(() => void refresh(), [refresh]);

  const def = items?.find((b) => b.isDefault)?.name ?? '';
  const [pickDefault, setPickDefault] = useState('');
  useEffect(() => setPickDefault(def), [def]);
  const [confirmDefault, setConfirmDefault] = useState(false);
  const [del, setDel] = useState<Branch | null>(null);

  // ---- create ----
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [touched, setTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const ime = useImeSafeEnter<HTMLInputElement>(() => formRef.current?.requestSubmit());
  useEffect(() => setFrom((f) => f || def), [def]);
  const exists = !!items?.some((b) => b.name === name.trim());
  const problem = name.trim() ? branchProblem(name.trim(), t) ?? (exists ? t('A branch with this name already exists.', '已经有同名分支了。') : null) : null;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!session || creating || !name.trim() || problem) return;
    setCreating(true);
    const r = await refsAction(repo, { action: 'create', name: name.trim(), from: from || def }, session.csrf);
    setCreating(false);
    if (r.status === 200) {
      toast.success(t(`Branch ${name.trim()} created`, `已创建分支 ${name.trim()}`));
      setName('');
      setTouched(false);
      void refresh();
    } else toast.error(writeError(r, t));
  };

  const setDefault = async () => {
    if (!session) return;
    const r = await refsAction(repo, { action: 'default', name: pickDefault }, session.csrf);
    if (r.status !== 200) throw new Error(writeError(r, t));
    toast.success(t(`Default branch is now ${pickDefault}`, `默认分支已改为 ${pickDefault}`));
    setItems((cur) => cur && cur.map((b) => ({ ...b, isDefault: b.name === pickDefault })));
    void refresh();
  };

  const remove = async (b: Branch) => {
    if (!session) return;
    // optimistic: the row leaves now, and comes back if the server says no
    const before = items;
    setItems((cur) => cur && cur.filter((x) => x.name !== b.name));
    const r = await refsAction(repo, { action: 'delete', name: b.name, expect: b.commit?.oid }, session.csrf);
    if (r.status !== 200) {
      setItems(before);
      toast.error(writeError(r, t));
      return;
    }
    const oid = r.body.commit ?? b.commit?.oid;
    toast.success(t(`Branch ${b.name} deleted`, `已删除分支 ${b.name}`), {
      description: oid ? t(`It pointed to ${oid.slice(0, 7)}.`, `它指向 ${oid.slice(0, 7)}。`) : undefined,
      action: oid
        ? {
            label: t('Restore', '恢复'),
            onClick: async () => {
              const rr = await refsAction(repo, { action: 'create', name: b.name, from: oid }, session.csrf);
              if (rr.status === 200) toast.success(t(`Branch ${b.name} restored`, `已恢复分支 ${b.name}`));
              else toast.error(writeError(rr, t));
              void refresh();
            },
          }
        : undefined,
    });
  };

  const branchOptions = (items ?? []).map((b) => ({ value: b.name, label: b.name }));
  const protectedName = (b: Branch) => b.isDefault || b.name === 'main';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline font-semibold">{t('Branches', '分支')}</h2>
        <p className="text-body text-text-secondary">
          {t('main and the default branch are protected: writer tokens cannot push to them, and they cannot be deleted here.', 'main 和默认分支受保护：写入令牌不能推送，这里也不能删除。')}
        </p>
      </div>
      {err && <Alert variant="danger" live="polite">{err}</Alert>}

      {/* default branch */}
      <section className="flex flex-col gap-3" aria-labelledby="bs-default">
        <h3 id="bs-default" className="text-heading font-semibold">
          {t('Default branch', '默认分支')}
        </h3>
        <p className="text-footnote text-text-secondary">{t('What a clone checks out and the Code tab shows. It is mirrored to GitHub on the next sync.', 'clone 默认检出、代码页默认显示的分支。下次同步时也会同步到 GitHub。')}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {items ? (
            <Select aria-label={t('Default branch', '默认分支')} value={pickDefault} onValueChange={setPickDefault} options={branchOptions} wrapperClassName="sm:w-64" className="font-mono" />
          ) : (
            <Skeleton className="h-8 sm:w-64" />
          )}
          <Button variant="secondary" disabled={!items || !pickDefault || pickDefault === def} onClick={() => setConfirmDefault(true)}>
            {t('Update', '更新')}
          </Button>
        </div>
      </section>

      {/* new branch */}
      <form ref={formRef} onSubmit={create} className="flex flex-col gap-3" aria-labelledby="bs-new" noValidate>
        <h3 id="bs-new" className="text-heading font-semibold">
          {t('New branch', '新建分支')}
        </h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field className="min-w-0 flex-1" invalid={touched && !!problem}>
            <Label>{t('Name', '名称')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name && setTouched(true)}
              onCompositionStart={ime.onCompositionStart}
              onCompositionEnd={ime.onCompositionEnd}
              onKeyDown={ime.onKeyDown}
              placeholder="feature/my-change"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="font-mono"
            />
            {touched && problem ? <ErrorText>{problem}</ErrorText> : <HelperText>{t('Letters, digits, “-”, “_”, “.” and “/” for groups.', '可用字母、数字、“-”“_”“.”，用“/”分组。')}</HelperText>}
          </Field>
          <Field className="sm:w-56">
            <Label>{t('From', '起点')}</Label>
            {items ? <Select value={from} onValueChange={setFrom} options={branchOptions} className="font-mono" /> : <Skeleton className="h-8" />}
          </Field>
          <Button type="submit" variant="primary" startIcon={<Plus />} loading={creating} disabled={!items} className="sm:mt-[26px]">
            {t('Create branch', '创建分支')}
          </Button>
        </div>
      </form>

      {/* list */}
      <section className="flex flex-col gap-2" aria-labelledby="bs-list">
        <h3 id="bs-list" className="text-heading font-semibold">
          {t('All branches', '全部分支')} {items && <Badge variant="neutral" mono>{items.length}</Badge>}
        </h3>
        {!items ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <ul className="overflow-hidden rounded-card bg-surface-1 shadow-hairline">
            <AnimatePresence initial={false}>
              {items.map((b) => (
                <motion.li
                  key={b.name}
                  layout={reduce ? false : 'position'}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0, transition: INSTANT } : { opacity: 0, x: 8, transition: { duration: 0.15, ease: EASE.out } }}
                  transition={reduce ? INSTANT : SPRING_CONTENT}
                  className="flex min-w-0 items-center gap-3 px-4 py-2.5 shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)] first:shadow-none"
                >
                  <GitBranch aria-hidden className="size-4 shrink-0 text-text-secondary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <AppLink href={`/~mio/r/${repoPath(repo)}/tree/?h=${encodeURIComponent(b.name)}`} className="cds-focus min-w-0 truncate rounded-sm font-mono text-[13px] font-medium text-accent-text hover:underline">
                        {b.name}
                      </AppLink>
                      {b.isDefault && <Badge variant="accent">{t('Default', '默认')}</Badge>}
                      {protectedName(b) && (
                        <Badge variant="neutral">
                          <LockSimple /> {t('Protected', '受保护')}
                        </Badge>
                      )}
                    </div>
                    {b.commit && (
                      <div className="mt-0.5 truncate text-footnote text-text-secondary">
                        {b.commit.subject} · <Age t={b.commit.time} />
                      </div>
                    )}
                  </div>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    disabled={protectedName(b)}
                    aria-label={protectedName(b) ? t(`${b.name} is protected`, `${b.name} 受保护`) : t(`Delete ${b.name}`, `删除 ${b.name}`)}
                    title={b.isDefault ? t('The default branch cannot be deleted', '默认分支不能删除') : b.name === 'main' ? t('main is protected', 'main 受保护') : t('Delete branch', '删除分支')}
                    onClick={() => setDel(b)}
                  >
                    <Trash />
                  </IconButton>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmDefault}
        onOpenChange={setConfirmDefault}
        variant="default"
        icon={<GitBranch weight="fill" />}
        title={t(`Make ${pickDefault} the default branch?`, `把 ${pickDefault} 设为默认分支？`)}
        description={t(`New clones check out ${pickDefault}, and it becomes protected for writer tokens. ${def} stays protected only if it is main.`, `新的 clone 会检出 ${pickDefault}，它对写入令牌受保护；${def} 只有在是 main 时才继续受保护。`)}
        confirmLabel={t('Change default', '修改默认分支')}
        cancelLabel={t('Cancel', '取消')}
        onConfirm={setDefault}
      />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? t(`Delete branch ${del.name}?`, `删除分支 ${del.name}？`) : ''}
        description={t('Commits only on this branch are no longer reachable. You can restore it right after from the notification.', '只在这个分支上的提交会变得不可达。删除后可以在通知里立即恢复。')}
        confirmLabel={t('Delete branch', '删除分支')}
        cancelLabel={t('Cancel', '取消')}
        onConfirm={() => {
          const b = del;
          setDel(null);
          if (b) void remove(b);
        }}
      />
    </div>
  );
}
