// Web file operations (console session only): create a file, upload files,
// rename / move, delete. Every one is a single Git commit (src/repo.ts commitChanges).
// MioUI: Card, Button / IconButton / LinkButton, Badge, Field / Label / HelperText /
// ErrorText, Input, Textarea, Alert, Dialog / ConfirmDialog, DropdownMenu, FileUpload
// (ported from MioUI), toast; IME-safe Enter from lib/use-ime-safe-enter.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useBlocker, useNavigate, useRevalidator, useSearchParams } from 'react-router';
import { ArrowsClockwise, CaretDown, Copy, DotsThree, FilePlus, GitBranch, Link as LinkIcon, PencilSimple, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { Button, IconButton } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Field, HelperText, Label, ErrorText } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { copyText } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FileUpload, type PickedFile } from '@/components/ui/file-upload';
import { toast } from '@/components/ui/toast';
import { useImeSafeEnter } from '@/lib/use-ime-safe-enter';
import { cn } from '@/lib/cn';
import { invalidate, load } from '@/app/api';
import { useI18n } from '@/app/i18n';
import { useSession } from '@/app/session';
import { encPath, fmtBytes } from '@/app/format';
import { isClientRoute } from '@/app/link';
import { apiFor } from '@/app/paths';
import type { View } from '@/app/types';
import { MAX_COMMIT_BYTES, MAX_COMMIT_FILES, commitChanges, pathProblem, splitDir, toBase64, writeError, type CommitRequest, type WriteChange, type WriteErr } from '@/app/write';
import type { Res } from '@/app/api';
import type { RepoCtx } from './repo-views';

type Tree = Extract<View, { kind: 'tree' }>;
type Blob = Extract<View, { kind: 'blob' }>;

const q = (h?: string | null) => (h ? `?h=${encodeURIComponent(h)}` : '');
const join = (dir: string[], rest: string) => [...dir, rest].filter(Boolean).join('/');

/** client route when possible (no page reload), a full load when crossing into /~mio/ */
export function useGo() {
  const nav = useNavigate();
  return (href: string, replace = false) => {
    if (isClientRoute(href, location.pathname).ok) nav(href, { replace });
    else location.assign(href);
  };
}

/** after a commit: toast with the short SHA and a link to the commit */
function committed(t: (en: string, zh: string) => string, go: (href: string) => void, c: RepoCtx, commit: string, title: string) {
  toast.success(title, {
    description: t(`Committed ${commit.slice(0, 7)}`, `已提交 ${commit.slice(0, 7)}`),
    action: { label: t('View commit', '查看提交'), onClick: () => go(`${c.base}/commit/?id=${commit}`) },
  });
}

/** warn before leaving a form with unsaved work: in-app navigation (blocker dialog) and tab close */
function useUnsavedGuard(dirty: boolean) {
  const { t } = useI18n();
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search);
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
      title={t('Discard your changes?', '放弃未提交的修改？')}
      description={t('Nothing has been committed yet. Leaving this page throws the changes away.', '还没有提交。离开这个页面会丢掉这些修改。')}
      confirmLabel={t('Discard', '放弃')}
      cancelLabel={t('Keep editing', '继续编辑')}
      onConfirm={() => {
        if (blocker.state === 'blocked') blocker.proceed();
      }}
    />
  );
}

/** the commit box under every form: message, optional description, branch, actions */
function CommitBox({
  branch,
  message,
  setMessage,
  description,
  setDescription,
  busy,
  disabled,
  cancelHref,
  submitLabel,
  progress,
  danger,
}: {
  branch: string;
  message: string;
  setMessage: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  busy: boolean;
  disabled?: boolean;
  cancelHref?: string;
  submitLabel?: ReactNode;
  progress?: ReactNode;
  danger?: boolean;
}) {
  const { t } = useI18n();
  const go = useGo();
  return (
    <div className="flex flex-col gap-3 bg-surface-1 p-4 shadow-[inset_0_var(--cds-ring-hairline)_0_var(--cds-border)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-heading font-semibold">{t('Commit changes', '提交更改')}</h3>
        <Badge variant="neutral" mono title={t('Commits go straight onto this branch', '直接提交到这个分支')}>
          <GitBranch /> {branch}
        </Badge>
      </div>
      <Field required>
        <Label>{t('Commit message', '提交说明')}</Label>
        <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} autoComplete="off" />
      </Field>
      <Field>
        <Label>{t('Extended description', '详细说明')}</Label>
        <Textarea value={description} onValueChange={setDescription} minRows={2} maxLength={4000} placeholder={t('Add an optional extended description…', '可选：补充更详细的说明…')} />
      </Field>
      {progress}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {cancelHref && (
          <Button type="button" variant="secondary" onClick={() => go(cancelHref)} disabled={busy}>
            {t('Cancel', '取消')}
          </Button>
        )}
        <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={disabled || !message.trim()}>
          {submitLabel ?? t('Commit changes', '提交更改')}
        </Button>
      </div>
    </div>
  );
}

const fullMessage = (m: string, d: string) => (d.trim() ? `${m.trim()}\n\n${d.trim()}` : m.trim());

/** a 409 / failure banner with "reload latest" for stale bases */
function WriteAlert({ res, onReload }: { res: Res<WriteErr> | null; onReload: () => void }) {
  const { t } = useI18n();
  if (!res) return null;
  const stale = res.status === 409;
  return (
    <Alert
      variant={stale ? 'warning' : 'danger'}
      live="assertive"
      title={stale ? t('The branch moved', '分支已更新') : t('Not committed', '没有提交')}
      action={
        stale ? (
          <Button size="sm" startIcon={<ArrowsClockwise />} onClick={onReload}>
            {t('Reload latest', '刷新到最新')}
          </Button>
        ) : undefined
      }
    >
      {writeError(res, t)}
    </Alert>
  );
}

function NoBranch({ c }: { c: RepoCtx }) {
  const { t } = useI18n();
  return (
    <Alert variant="info" title={t('Switch to a branch to change files', '切换到分支后才能修改文件')}>
      {t('You are viewing a tag or a commit. Pick a branch from the branch menu first.', '当前看的是标签或某个提交，请先在分支菜单里选一个分支。')} <span className="font-mono text-[12px]">{c.meta.ref}</span>
    </Alert>
  );
}

/** reload the page's data (new base commit) without losing form state */
function useReloadBase() {
  const rv = useRevalidator();
  return () => {
    invalidate(apiFor(location.pathname, location.search) ?? undefined);
    rv.revalidate();
  };
}

// ---------------------------------------------------------------------------
// "Add file" menu (tree + code pages)
// ---------------------------------------------------------------------------
export function AddFileMenu({ c, dir, h, branch }: { c: RepoCtx; dir: string[]; h?: string | null; branch: string | null }) {
  const { t } = useI18n();
  const go = useGo();
  if (!c.consoleBase) return null;
  const at = (kind: 'new' | 'upload') => `${c.consoleBase}/${kind}/${encPath(dir)}${q(h)}`;
  return (
    <DropdownMenu
      align="end"
      aria-label={t('Add file', '添加文件')}
      className="w-60"
      trigger={
        <Button size="xs" startIcon={<Plus />} endIcon={<CaretDown className="opacity-60" />} disabled={!branch} title={branch ? undefined : t('Switch to a branch to change files', '切换到分支后才能修改文件')}>
          {t('Add file', '添加文件')}
        </Button>
      }
    >
      <DropdownMenuLabel>
        {t('On branch', '分支')} <span className="font-mono">{branch}</span>
      </DropdownMenuLabel>
      <DropdownMenuItem icon={<FilePlus />} onSelect={() => go(at('new'))}>
        {t('Create new file', '新建文件')}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<UploadSimple />} onSelect={() => go(at('upload'))}>
        {t('Upload files', '上传文件')}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// new file
// ---------------------------------------------------------------------------
export function NewFileView({ v, c, h }: { v: Tree; c: RepoCtx; h?: string | null }) {
  const { t } = useI18n();
  const { session } = useSession();
  const go = useGo();
  const reload = useReloadBase();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [msgEdited, setMsgEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res<WriteErr> | null>(null);
  const [done, setDone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dir = v.path;
  const path = join(dir, name.trim());
  const firstSeg = name.trim().split('/')[0];
  const clash = v.entries.find((e) => e.name === firstSeg);
  const problem = name.trim() ? pathProblem(path, t) ?? (clash && (clash.type !== 'tree' || !name.includes('/')) ? t(`“${firstSeg}” already exists here.`, `这里已经有“${firstSeg}”了。`) : null) : null;
  const shownProblem = touched || name.includes('/') ? problem : null;
  const autoMsg = name.trim() ? t(`Create ${name.trim()}`, `新建 ${name.trim()}`) : '';
  const msg = msgEdited ? message : autoMsg;
  const dirty = !done && (!!name || !!content);
  const guard = useUnsavedGuard(dirty && !busy);
  const ime = useImeSafeEnter<HTMLInputElement>(() => formRef.current?.requestSubmit());
  useEffect(() => nameRef.current?.focus(), []);

  if (!v.branch) return <NoBranch c={c} />;
  const back = `${c.base}/tree/${encPath(dir)}${q(h)}`;
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!session || busy || !v.branch) return;
    if (!name.trim() || problem) return nameRef.current?.focus();
    setBusy(true);
    setRes(null);
    const req: CommitRequest = { branch: v.branch, base: v.commit, message: fullMessage(msg, description), changes: [{ op: 'put', path, content }] };
    const r = await commitChanges(c.repo, req, session.csrf);
    setBusy(false);
    if (r.status === 200) {
      setDone(true);
      committed(t, go, c, r.body.commit, t(`Created ${path}`, `已新建 ${path}`));
      // after the guard has seen done=true
      setTimeout(() => go(`${c.base}/tree/${encPath(path.split('/'))}${q(h)}`), 0);
    } else setRes(r);
  };
  return (
    <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {guard}
      <WriteAlert res={res} onReload={() => { setRes(null); reload(); }} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-1.5 p-4">
          <Field invalid={!!shownProblem}>
            <Label>{t('File name', '文件名')}</Label>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2 font-mono text-[13px]">
              <span className="text-text-secondary">{c.repo.split('/').pop()}</span>
              {dir.map((d, i) => (
                <span key={i} className="inline-flex min-w-0 items-center gap-1 text-text-secondary">
                  <span aria-hidden>/</span>
                  <span className="truncate">{d}</span>
                </span>
              ))}
              <span aria-hidden className="text-text-secondary">/</span>
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name && setTouched(true)}
                onCompositionStart={ime.onCompositionStart}
                onCompositionEnd={ime.onCompositionEnd}
                onKeyDown={ime.onKeyDown}
                placeholder={t('Name your file…', '给文件起个名字…')}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="min-w-0 flex-[1_1_14rem] font-mono"
              />
            </div>
            {shownProblem ? <ErrorText>{shownProblem}</ErrorText> : <HelperText>{t('Type “/” to put the file in a new folder.', '输入“/”可以放进新文件夹。')}</HelperText>}
          </Field>
        </div>
        <div className="px-4 pb-4">
          <Field>
            <Label className="sr-only">{t('File content', '文件内容')}</Label>
            <Textarea
              value={content}
              onValueChange={setContent}
              autoResize={false}
              minRows={18}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              wrap="off"
              placeholder={t('Enter file contents here', '在这里输入文件内容')}
              className="min-h-[18rem] font-mono text-[13px] leading-5 [tab-size:4]"
              onKeyDown={(e) => {
                // ⌘/Ctrl+Enter commits (never while an IME is composing)
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
            />
          </Field>
        </div>
        <CommitBox
          branch={v.branch}
          message={msg}
          setMessage={(m) => {
            setMsgEdited(true);
            setMessage(m);
          }}
          description={description}
          setDescription={setDescription}
          busy={busy}
          disabled={!name.trim() || !!problem}
          cancelHref={back}
        />
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------
export function UploadView({ v, c, h }: { v: Tree; c: RepoCtx; h?: string | null }) {
  const { t } = useI18n();
  const { session } = useSession();
  const go = useGo();
  const reload = useReloadBase();
  const [items, setItems] = useState<PickedFile[]>([]);
  const [message, setMessage] = useState('');
  const [msgEdited, setMsgEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<null | 'read' | 'send' | 'commit'>(null);
  const [pct, setPct] = useState(0);
  const [res, setRes] = useState<Res<WriteErr> | null>(null);
  const [done, setDone] = useState(false);
  const seq = useRef(0);
  const dir = v.path;
  const busy = phase !== null;
  const guard = useUnsavedGuard(!done && !busy && items.length > 0);
  const total = items.reduce((s, it) => s + it.file.size, 0);
  const over = total > MAX_COMMIT_BYTES || items.length > MAX_COMMIT_FILES;
  const bad = items.some((it) => it.error);
  const existing = useMemo(() => new Set(v.entries.filter((e) => e.type === 'blob').map((e) => e.name)), [v.entries]);
  const autoMsg = items.length === 1 ? t(`Add ${items[0].path}`, `添加 ${items[0].path}`) : items.length ? t(`Add ${items.length} files via upload`, `上传 ${items.length} 个文件`) : '';
  const msg = msgEdited ? message : autoMsg;

  if (!v.branch) return <NoBranch c={c} />;
  const add = (files: { file: File; path: string }[]) => {
    setItems((cur) => {
      const next = [...cur];
      for (const f of files) {
        const full = join(dir, f.path);
        const err = pathProblem(full, t) ?? undefined;
        const note = !f.path.includes('/') && existing.has(f.path) ? t('Replaces the file that is already here', '会覆盖这里已有的同名文件') : undefined;
        const i = next.findIndex((x) => x.path === f.path);
        const item = { id: `u${++seq.current}`, file: f.file, path: f.path, error: err, note };
        if (i >= 0) next[i] = item; // the same name dropped twice: keep the newer one
        else next.push(item);
      }
      return next;
    });
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || busy || !items.length || over || bad || !v.branch) return;
    setRes(null);
    setPhase('read');
    setPct(0);
    const changes: WriteChange[] = [];
    try {
      for (const it of items) changes.push({ op: 'put', path: join(dir, it.path), content: toBase64(await it.file.arrayBuffer()), encoding: 'base64', overwrite: true });
    } catch {
      setPhase(null);
      toast.error(t('A file could not be read.', '有文件读取失败。'));
      return;
    }
    setPhase('send');
    const r = await commitChanges(c.repo, { branch: v.branch, base: v.commit, message: fullMessage(msg, description), changes }, session.csrf, (f) => {
      setPct(f);
      if (f >= 1) setPhase('commit');
    });
    setPhase(null);
    if (r.status === 200) {
      setDone(true);
      committed(t, go, c, r.body.commit, t(`Uploaded ${items.length} file${items.length === 1 ? '' : 's'}`, `已上传 ${items.length} 个文件`));
      setTimeout(() => go(`${c.base}/tree/${encPath(dir)}${q(h)}`), 0);
    } else setRes(r);
  };
  const ratio = Math.min(1, total / MAX_COMMIT_BYTES);
  const progress =
    phase !== null ? (
      <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
        <div className="flex justify-between text-footnote text-text-secondary tabular-nums">
          <span>{phase === 'read' ? t('Reading files…', '正在读取文件…') : phase === 'send' ? t('Uploading…', '正在上传…') : t('Writing the commit…', '正在写入提交…')}</span>
          {phase === 'send' && <span>{Math.round(pct * 100)}%</span>}
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-hairline-strong" aria-hidden>
          <div className={cn('h-full origin-left rounded-full bg-accent-brand transition-transform duration-(--cds-dur-base) ease-swift', phase === 'commit' && 'animate-pulse')} style={{ transform: `scaleX(${phase === 'read' ? 0.04 : phase === 'send' ? Math.max(0.04, pct) : 1})` }} />
        </div>
      </div>
    ) : null;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {guard}
      <WriteAlert res={res} onReload={() => { setRes(null); reload(); }} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-heading font-semibold">{t('Upload files', '上传文件')}</h2>
            <span className="min-w-0 font-mono text-[12.5px] text-text-secondary [overflow-wrap:anywhere]">
              {t('to', '到')} {[c.repo.split('/').pop(), ...dir].join('/')}/
            </span>
          </div>
          <FileUpload
            items={items}
            onAdd={add}
            onRemove={(id) => setItems((cur) => cur.filter((x) => x.id !== id))}
            disabled={busy}
            invalid={over}
            listVariant="rows"
            labels={{
              drop: t('Drag files or a folder here, or click to choose files', '把文件或文件夹拖到这里，或点击选择文件'),
              hint: t('Up to 10 MB and 200 files per commit. Files with the same name are replaced.', '每次提交最多 10 MB、200 个文件。同名文件会被覆盖。'),
              remove: t('Remove', '移除'),
              list: t('Files to commit', '待提交的文件'),
            }}
          />
          {items.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className={cn('flex justify-between text-footnote tabular-nums', over ? 'text-danger' : 'text-text-secondary')}>
                <span>{t(`${items.length} file${items.length === 1 ? '' : 's'}`, `${items.length} 个文件`)}</span>
                <span>
                  {fmtBytes(total)} / 10 MB
                </span>
              </div>
              <div
                role="meter"
                aria-label={t('Upload size', '上传大小')}
                aria-valuemin={0}
                aria-valuemax={MAX_COMMIT_BYTES}
                aria-valuenow={Math.min(total, MAX_COMMIT_BYTES)}
                aria-valuetext={`${fmtBytes(total)} / 10 MB`}
                className="h-1 overflow-hidden rounded-full bg-hairline-strong"
              >
                <div className={cn('h-full origin-left rounded-full transition-transform duration-(--cds-dur-base) ease-swift', over ? 'bg-danger-fill' : 'bg-accent-brand')} style={{ transform: `scaleX(${ratio})` }} />
              </div>
              {over && <ErrorText>{t('Too much for one commit: remove files until it is under 10 MB and 200 files.', '一次提交放不下：请移除部分文件，控制在 10 MB、200 个文件以内。')}</ErrorText>}
            </div>
          )}
        </div>
        <CommitBox
          branch={v.branch}
          message={msg}
          setMessage={(m) => {
            setMsgEdited(true);
            setMessage(m);
          }}
          description={description}
          setDescription={setDescription}
          busy={busy}
          disabled={!items.length || over || bad}
          cancelHref={`${c.base}/tree/${encPath(dir)}${q(h)}`}
          progress={progress}
        />
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------
// blob page: "…" menu, rename / move, delete
// ---------------------------------------------------------------------------
export function FileMenu({ v, c, h, onPermalink }: { v: Blob; c: RepoCtx; h?: string | null; onPermalink: () => void }) {
  const { t } = useI18n();
  const go = useGo();
  const [sp] = useSearchParams();
  const [dlg, setDlg] = useState<null | 'rename' | 'delete'>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // the dialog opened from a menu item that no longer exists: give focus back to the "…" button
  const closeDlg = () => {
    setDlg(null);
    requestAnimationFrame(() => trigger.current?.isConnected && trigger.current.focus());
  };
  const path = v.path.join('/');
  // public pages (signed-in hint) hand the action to the console page: ?do=rename|delete opens it there
  const inPlace = c.canWrite;
  useEffect(() => {
    const d = sp.get('do');
    if (inPlace && v.branch && (d === 'rename' || d === 'delete')) {
      setDlg(d);
      const u = new URL(location.href);
      u.searchParams.delete('do');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
    // only on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const open = (d: 'rename' | 'delete') => {
    if (inPlace) setDlg(d);
    else if (c.consoleBase) go(`${c.consoleBase}/tree/${encPath(v.path)}?${new URLSearchParams({ ...(h ? { h } : {}), do: d })}`);
  };
  const canWrite = !!c.consoleBase && !!v.branch;
  return (
    <>
      <DropdownMenu
        align="end"
        aria-label={t('More file actions', '更多文件操作')}
        className="w-60"
        trigger={
          <IconButton ref={trigger} size="xs" aria-label={t('More file actions', '更多文件操作')} title={t('More file actions', '更多文件操作')}>
            <DotsThree weight="bold" />
          </IconButton>
        }
      >
        <DropdownMenuItem icon={<LinkIcon />} shortcut="y" onSelect={onPermalink}>
          {t('Copy permalink', '复制永久链接')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<Copy />}
          onSelect={() =>
            void copyText(path).then(
              () => toast.success(t('Path copied', '已复制路径')),
              () => toast.error(t('Copy failed', '复制失败')),
            )
          }
        >
          {t('Copy path', '复制路径')}
        </DropdownMenuItem>
        {c.consoleBase && (
          <>
            <DropdownMenuSeparator />
            {!v.branch && <DropdownMenuLabel>{t('Switch to a branch to change files', '切换到分支后才能修改文件')}</DropdownMenuLabel>}
            {!v.binary && c.editBase && (
              <DropdownMenuItem icon={<PencilSimple />} shortcut="." disabled={!canWrite} onSelect={() => location.assign(`${c.editBase}/${encPath(v.path)}${q(h)}`)}>
                {t('Edit file', '编辑文件')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem icon={<PencilSimple />} disabled={!canWrite} onSelect={() => open('rename')}>
              {t('Rename or move', '重命名或移动')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Trash />} danger disabled={!canWrite} onSelect={() => open('delete')}>
              {t('Delete file', '删除文件')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenu>
      {inPlace && v.branch && (
        <>
          <RenameDialog open={dlg === 'rename'} onClose={closeDlg} v={v} c={c} h={h} />
          <DeleteDialog open={dlg === 'delete'} onClose={closeDlg} v={v} c={c} h={h} />
        </>
      )}
    </>
  );
}

function RenameDialog({ open, onClose, v, c, h }: { open: boolean; onClose: () => void; v: Blob; c: RepoCtx; h?: string | null }) {
  const { t } = useI18n();
  const { session } = useSession();
  const go = useGo();
  const reload = useReloadBase();
  const from = v.path.join('/');
  const [to, setTo] = useState(from);
  const [message, setMessage] = useState('');
  const [msgEdited, setMsgEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res<WriteErr> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ime = useImeSafeEnter<HTMLInputElement>(() => formRef.current?.requestSubmit());
  useEffect(() => {
    if (!open) return;
    setTo(from);
    setMsgEdited(false);
    setRes(null);
    // select the base name without its extension, like a file manager rename
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const [dir, base] = splitDir(from);
      const start = dir ? dir.length + 1 : 0;
      const dot = base.lastIndexOf('.');
      el.focus();
      el.setSelectionRange(start, start + (dot > 0 ? dot : base.length));
    });
  }, [open, from]);
  const target = to.trim();
  const problem = target === from ? t('Choose a new name or folder.', '请输入新的名称或位置。') : pathProblem(target, t);
  const autoMsg = target === from || !target ? '' : splitDir(target)[0] === splitDir(from)[0] ? t(`Rename ${splitDir(from)[1]} to ${splitDir(target)[1]}`, `重命名 ${splitDir(from)[1]} 为 ${splitDir(target)[1]}`) : t(`Move ${from} to ${target}`, `移动 ${from} 到 ${target}`);
  const msg = msgEdited ? message : autoMsg;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || busy || problem || !v.branch || !msg.trim()) return;
    setBusy(true);
    setRes(null);
    const r = await commitChanges(c.repo, { branch: v.branch, base: v.commit, message: msg.trim(), changes: [{ op: 'move', from, to: target }] }, session.csrf);
    setBusy(false);
    if (r.status === 200) {
      onClose();
      committed(t, go, c, r.body.commit, t(`Moved to ${target}`, `已移动到 ${target}`));
      go(`${c.base}/tree/${encPath(target.split('/'))}${q(h)}`, true);
    } else setRes(r);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      dismissible={!busy}
      closeLabel={t('Close', '关闭')}
      title={t('Rename or move file', '重命名或移动文件')}
      description={t('Type a new name, or a path with “/” to move it into another folder. One commit.', '输入新名称；输入带“/”的路径可以移到其他文件夹。生成一次提交。')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('Cancel', '取消')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!!problem || !msg.trim()} onClick={() => formRef.current?.requestSubmit()}>
            {t('Commit rename', '提交重命名')}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <WriteAlert res={res} onReload={() => { setRes(null); onClose(); reload(); }} />
        <Field invalid={!!problem && target !== from}>
          <Label>{t('New path', '新路径')}</Label>
          <Input ref={inputRef} value={to} onChange={(e) => setTo(e.target.value)} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} onKeyDown={ime.onKeyDown} className="font-mono" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          {problem && target !== from ? <ErrorText>{problem}</ErrorText> : <HelperText>{t('Folders that end up empty are removed.', '移空的文件夹会被自动删除。')}</HelperText>}
        </Field>
        <Field required>
          <Label>{t('Commit message', '提交说明')}</Label>
          <Input
            value={msg}
            onChange={(e) => {
              setMsgEdited(true);
              setMessage(e.target.value);
            }}
            maxLength={300}
            autoComplete="off"
          />
        </Field>
        <p className="flex items-center gap-1.5 text-footnote text-text-secondary">
          <GitBranch className="size-3.5" aria-hidden /> {t('Commits to', '提交到')} <span className="font-mono">{v.branch}</span>
        </p>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ open, onClose, v, c, h }: { open: boolean; onClose: () => void; v: Blob; c: RepoCtx; h?: string | null }) {
  const { t } = useI18n();
  const { session } = useSession();
  const go = useGo();
  const reload = useReloadBase();
  const path = v.path.join('/');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res<WriteErr> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const ime = useImeSafeEnter<HTMLInputElement>(() => formRef.current?.requestSubmit());
  useEffect(() => {
    if (open) {
      setMessage(t(`Delete ${path}`, `删除 ${path}`));
      setRes(null);
    }
  }, [open, path, t]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || busy || !v.branch || !message.trim()) return;
    setBusy(true);
    setRes(null);
    const r = await commitChanges(c.repo, { branch: v.branch, base: v.commit, message: message.trim(), changes: [{ op: 'delete', path }] }, session.csrf);
    if (r.status !== 200) {
      setBusy(false);
      setRes(r);
      return;
    }
    // land on the nearest folder that still exists (emptied folders are pruned)
    let dir = v.path.slice(0, -1);
    for (; dir.length; dir = dir.slice(0, -1)) {
      const href = `${c.base}/tree/${encPath(dir)}${q(h)}`;
      const api = apiFor(href.split('?')[0], q(h));
      if (api && (await load(api, 0)).status === 200) break;
    }
    setBusy(false);
    onClose();
    committed(t, go, c, r.body.commit, t(`Deleted ${path}`, `已删除 ${path}`));
    go(`${c.base}/tree/${encPath(dir)}${q(h)}`, true);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      dismissible={!busy}
      role="alertdialog"
      size="sm"
      closeLabel={t('Close', '关闭')}
      title={t('Delete this file?', '删除这个文件？')}
      description={
        <>
          <span className="font-mono text-text-primary [overflow-wrap:anywhere]">{path}</span> {t('is removed from', '将从分支')} <span className="font-mono">{v.branch}</span>
          {t(' in a new commit. The history keeps it.', ' 中删除（生成一次提交），历史里仍然保留。')}
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus>
            {t('Cancel', '取消')}
          </Button>
          <Button variant="danger" loading={busy} disabled={!message.trim()} startIcon={<Trash />} onClick={() => formRef.current?.requestSubmit()}>
            {t('Delete file', '删除文件')}
          </Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <WriteAlert res={res} onReload={() => { setRes(null); onClose(); reload(); }} />
        <Field required>
          <Label>{t('Commit message', '提交说明')}</Label>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd} onKeyDown={ime.onKeyDown} maxLength={300} autoComplete="off" />
        </Field>
      </form>
    </Dialog>
  );
}

