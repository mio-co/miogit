// Repository settings (/~mio/repos/<repo>?s=general|visibility|danger).
// Layout from the MioUI SettingsPageSidenav block (220px section nav + one panel card,
// nav becomes a horizontal pill row on narrow screens); sections are links (?s=) instead of
// local state so every section has its own URL, as before. Fields: MioUI Field / Label /
// Input / Textarea / Checkbox / Button / Badge / Alert; result via toast. The "sync with GitHub"
// switch (MioUI SettingRow + Switch) sits under the general form and saves on its own.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useRevalidator, useSearchParams } from 'react-router';
import { GitBranch, Globe, SlidersHorizontal, Warning } from '@phosphor-icons/react';
import { BranchSettings } from './branch-settings';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { SettingRow } from '@/components/ui/setting-row';
import { Switch } from '@/components/ui/switch';
import { Field, HelperText, Label } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { ShakeError } from '@/components/blocks/auth-parts';
import { invalidate, post } from '@/app/api';
import { useI18n } from '@/app/i18n';
import { useSession } from '@/app/session';
import type { RepoSettings } from '@/app/types';
import { repoPath } from '@/app/format';
import { AppLink } from '@/app/link';
import { cn } from '@/lib/cn';

type Section = 'general' | 'visibility' | 'branches' | 'danger';

export function SettingsView({ info }: { info: RepoSettings }) {
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const raw = sp.get('s');
  const s: Section = raw === 'visibility' || raw === 'danger' || raw === 'branches' ? raw : 'general';
  const href = `/~mio/repos/${repoPath(info.name)}`;
  const items: [Section, React.ReactNode, string][] = [
    ['general', <SlidersHorizontal key="g" />, t('General', '常规')],
    ['visibility', <Globe key="v" />, t('Visibility', '可见性')],
    ['branches', <GitBranch key="b" />, t('Branches', '分支')],
    ['danger', <Warning key="d" />, t('Danger zone', '危险区')],
  ];
  return (
    <section data-cds="SettingsPageSidenav" className="@container/page flex w-full flex-col">
      <div className="flex w-full flex-1 flex-col gap-6 @min-[720px]/page:flex-row @min-[720px]/page:gap-10">
        <div className="shrink-0 @min-[720px]/page:w-[220px]">
          <nav aria-label={t('Settings', '设置')} className="-mx-4 overflow-x-auto px-4 @min-[720px]/page:mx-0 @min-[720px]/page:overflow-visible @min-[720px]/page:px-0">
            <ul className="flex gap-1 @min-[720px]/page:flex-col">
              {items.map(([k, icon, label]) => (
                <li key={k} className="shrink-0">
                  <AppLink
                    href={`${href}?s=${k}`}
                    aria-current={s === k ? 'page' : undefined}
                    className={cn(
                      'cds-focus flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-start text-body whitespace-nowrap text-text-secondary transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text-primary [@media(pointer:coarse)]:min-h-11 [&_svg]:size-4',
                      s === k && 'bg-surface-2 font-medium text-text-primary',
                      k === 'danger' && 'text-danger hover:text-danger',
                    )}
                  >
                    {icon}
                    {label}
                  </AppLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="rounded-2xl bg-surface-2 p-6 shadow-cds-sm @max-[480px]/page:p-4">
            {s === 'general' ? <General info={info} /> : s === 'visibility' ? <Visibility info={info} /> : s === 'branches' ? <BranchSettings repo={info.name} /> : <Danger info={info} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelHead({ title, note }: { title: string; note: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-1">
      <h2 className="text-headline font-semibold">{title}</h2>
      <p className="text-body text-text-secondary">{note}</p>
    </div>
  );
}

function useSave(info: RepoSettings) {
  const { t } = useI18n();
  const { session } = useSession();
  const rv = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(0);
  const save = async (body: Record<string, unknown>) => {
    if (!session) return;
    setBusy(true);
    const r = await post<{ error?: string }>(`/~mio/api/repos/${repoPath(info.name)}`, body, session.csrf);
    setBusy(false);
    if (r.status === 200) {
      setErr('');
      invalidate();
      toast.success(t('Settings saved.', '设置已保存。'));
      rv.revalidate();
    } else {
      setErr(r.body.error || t('Something went wrong.', '出错了，请稍后再试。'));
      setShake((n) => n + 1);
    }
  };
  return { busy, err, shake, save };
}

function General({ info }: { info: RepoSettings }) {
  const { t } = useI18n();
  const [desc, setDesc] = useState(info.description);
  const [owner, setOwner] = useState(info.owner);
  const [section, setSection] = useState(info.section);
  useEffect(() => {
    setDesc(info.description);
    setOwner(info.owner);
    setSection(info.section);
  }, [info]);
  const { busy, err, shake, save } = useSave(info);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save({ s: 'general', description: desc, owner, section });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PanelHead title={t('General', '常规')} note={t('Shown on the repository list and the repository page.', '显示在仓库列表和仓库页上。')} />
      <ShakeError message={err} shakeKey={shake} />
      <Field>
        <Label>{t('Description', '描述')}</Label>
        <Textarea maxLength={500} rows={3} value={desc} onValueChange={setDesc} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label>{t('Owner', '所有者')}</Label>
          <Input maxLength={64} autoComplete="off" value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <Field>
          <Label>{t('Section', '分组')}</Label>
          <Input maxLength={64} autoComplete="off" value={section} onChange={(e) => setSection(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>
          {t('Save', '保存')}
        </Button>
      </div>
      <SyncRow info={info} />
    </form>
  );
}

/** "Sync with GitHub" (default on): saved immediately, independent of the form above. */
function SyncRow({ info }: { info: RepoSettings }) {
  const { t } = useI18n();
  const { session } = useSession();
  const rv = useRevalidator();
  const [on, setOn] = useState(info.sync !== false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(info.sync !== false), [info]);
  const change = async (next: boolean) => {
    if (!session || busy) return;
    setOn(next);
    setBusy(true);
    const r = await post<{ error?: string; sync?: boolean }>(`/~mio/api/repos/${repoPath(info.name)}`, { s: 'sync', sync: next }, session.csrf);
    setBusy(false);
    if (r.status === 200) {
      invalidate();
      toast.success(next ? t('GitHub sync is on.', '已开启 GitHub 同步。') : t('GitHub sync is off.', '已关闭 GitHub 同步。'));
      rv.revalidate();
    } else {
      setOn(!next);
      toast.error(r.body.error || t('Something went wrong.', '出错了，请稍后再试。'));
    }
  };
  return (
    <div className="mt-2 border-t border-hairline pt-2">
      <SettingRow
        title={t('Sync with GitHub', '同步到 GitHub')}
        description={t(
          'Pushes here are mirrored to the repository of the same name in the mio-co organisation on GitHub (created if missing), and pushes there come back here. Fast-forwards only; off stops both directions.',
          '推送到这里会同步到 GitHub 组织 mio-co 的同名仓库（没有就自动创建），在 GitHub 上的推送也会同步回来。只做快进；关掉后两个方向都停止。',
        )}
        control={<Switch checked={on} disabled={busy} onCheckedChange={(v) => void change(v)} aria-label={t('Sync with GitHub', '同步到 GitHub')} />}
      >
        {info.syncAt && (
          <p className="mt-1 text-[12.5px] leading-[1.125rem] text-text-muted">
            {t('Last sync run', '上次同步')}: <time dateTime={info.syncAt}>{info.syncAt.replace('T', ' ').replace('Z', ' UTC')}</time>
            {!info.syncLinked && ` · ${t('not linked', '未关联')}`}
          </p>
        )}
      </SettingRow>
      {on && info.syncConflicts && info.syncConflicts.length > 0 && (
        <Alert variant="warning" title={t('Skipped in the last sync run', '上次同步跳过的内容')} className="mt-2">
          <ul className="list-disc ps-4 [overflow-wrap:anywhere]">
            {info.syncConflicts.map((c) => (
              <li key={c} className="font-mono text-[12px]">
                {c}
              </li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

function Visibility({ info }: { info: RepoSettings }) {
  const { t } = useI18n();
  const [priv, setPriv] = useState(info.private);
  useEffect(() => setPriv(info.private), [info]);
  const { busy, err, shake, save } = useSave(info);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save({ s: 'visibility', private: priv });
      }}
      className="flex flex-col gap-4"
    >
      <PanelHead
        title={t('Visibility', '可见性')}
        note={
          <>
            {t('Currently', '当前')} <Badge variant={info.private ? 'accent' : 'neutral'}>{info.private ? t('Private', '私有') : t('Public', '公开')}</Badge>
          </>
        }
      />
      <ShakeError message={err} shakeKey={shake} />
      <Checkbox checked={priv} onCheckedChange={setPriv} label={t('Private (requires a token to read)', '私有（需要令牌才能读取）')} />
      <HelperText>
        {t(
          'Public repositories can be browsed and cloned by anyone. Private ones only open in this console or with an access token.',
          '公开仓库任何人都能浏览和 clone；私有仓库只能在管理台里打开，或用访问令牌读取。',
        )}
      </HelperText>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>
          {t('Save', '保存')}
        </Button>
      </div>
    </form>
  );
}

function Danger({ info }: { info: RepoSettings }) {
  const { t } = useI18n();
  const { session } = useSession();
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(0);
  const ok = typed === info.name;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok || !session || busy) return;
    setBusy(true);
    const r = await post<{ error?: string }>(`/~mio/api/repos/${repoPath(info.name)}/delete`, { confirm: typed }, session.csrf);
    setBusy(false);
    if (r.status === 200) {
      invalidate();
      nav(`/~mio/?done=deleted&name=${encodeURIComponent(info.name)}`);
    } else {
      setErr(r.body.error || t('Something went wrong.', '出错了，请稍后再试。'));
      setShake((n) => n + 1);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PanelHead
        title={t('Delete this repository', '删除仓库')}
        note={t(
          'All branches, tags, history and settings of this repository are removed, and clones stop working. This cannot be undone.',
          '这个仓库的全部分支、标签、历史和设置都会被清除，clone 会失效。不能恢复。',
        )}
      />
      <ShakeError message={err} shakeKey={shake} />
      <Field invalid={!!err}>
        <Label>
          {t('Type the repository name to confirm', '输入完整仓库名以确认')}: <b className="font-mono">{info.name}</b>
        </Label>
        <Input autoComplete="off" autoCapitalize="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="danger" disabled={!ok} loading={busy}>
          {t('Delete repository', '删除仓库')}
        </Button>
      </div>
    </form>
  );
}
