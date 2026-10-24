// Console account dialogs: sign-in, change password, access tokens.
// MioUI Dialog / ConfirmDialog / Field / Input / PasswordInput / Select / Checkbox /
// Button / CopyField / Badge + ShakeError from the auth block parts.
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Field, HelperText, Label } from '@/components/ui/field';
import { CopyField, Input, PasswordInput } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/feedback';
import { toast } from '@/components/ui/toast';
import { ShakeError } from '@/components/blocks/auth-parts';
import { invalidate, load, post } from '@/app/api';
import { useI18n } from '@/app/i18n';
import { useSession } from '@/app/session';
import type { TokenRow } from '@/app/types';
import { fmtTime } from '@/app/format';
import { cn } from '@/lib/cn';

export function LoginDialog({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn: (next: string) => void }) {
  const { t } = useI18n();
  const { setSession } = useSession();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const next = new URLSearchParams(location.search).get('next') ?? '';
    const r = await post<{ user?: string; csrf?: string; next?: string; error?: string; minutes?: number }>('/~mio/api/login', { username: user, password: pass, remember, next });
    setBusy(false);
    if (r.status === 200 && r.body.user && r.body.csrf) {
      setSession({ user: r.body.user, csrf: r.body.csrf });
      invalidate();
      onSignedIn(r.body.next || '/~mio/');
      return;
    }
    setPass('');
    setShake((n) => n + 1);
    setErr(
      r.status === 429
        ? t(`Too many failed attempts. Try again in ${r.body.minutes ?? 15} min.`, `失败次数过多，请 ${r.body.minutes ?? 15} 分钟后再试。`)
        : r.status === 401
          ? t('Wrong username or password.', '用户名或密码不正确。')
          : r.body.error || t('Something went wrong.', '出错了，请稍后再试。'),
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      closeOnOverlay={false}
      closeLabel={t('Close', '关闭')}
      title={t('Sign in to the MioGit console', '登录 MioGit 管理台')}
      description={t('Use the console account. Git access tokens cannot sign in here.', '使用管理台账号登录。git 访问令牌不能用于登录网页。')}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <ShakeError message={err} shakeKey={shake} />
        <Field required>
          <Label>{t('Username', '用户名')}</Label>
          <Input size="lg" name="username" autoComplete="username" autoCapitalize="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} data-autofocus required />
        </Field>
        <Field required invalid={!!err}>
          <Label>{t('Password', '密码')}</Label>
          <PasswordInput
            size="lg"
            name="password"
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            showLabel={t('Show password', '显示密码')}
            hideLabel={t('Hide password', '隐藏密码')}
            required
          />
        </Field>
        <Checkbox name="remember" checked={remember} onCheckedChange={setRemember} label={t('Keep me signed in for 30 days', '记住我（30 天内免登录）')} />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {t('Sign in', '登录')}
        </Button>
      </form>
    </Dialog>
  );
}

export function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { session, setSession } = useSession();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) {
      setCur('');
      setNext('');
      setConfirm('');
      setErr('');
    }
  }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !session) return;
    if (next.length < 12) return fail(t('The new password needs 12–256 characters.', '新密码需为 12–256 位。'));
    if (next !== confirm) return fail(t('The two new passwords differ.', '两次输入的新密码不一致。'));
    setBusy(true);
    const r = await post<{ csrf?: string; error?: string }>('/~mio/api/password', { current: cur, next, confirm }, session.csrf);
    setBusy(false);
    if (r.status === 200 && r.body.csrf) {
      setSession({ ...session, csrf: r.body.csrf });
      toast.success(t('Password changed.', '密码已修改。'));
      onClose();
      return;
    }
    fail(r.body.error || t('Something went wrong.', '出错了，请稍后再试。'));
  };
  function fail(m: string) {
    setErr(m);
    setShake((n) => n + 1);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      closeOnOverlay={false}
      closeLabel={t('Close', '关闭')}
      title={t('Change console password', '修改管理台密码')}
      description={t('Other signed-in browsers are signed out.', '修改后，其他已登录的浏览器会退出登录。')}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <ShakeError message={err} shakeKey={shake} />
        <input type="text" name="username" value={session?.user ?? ''} autoComplete="username" hidden readOnly tabIndex={-1} aria-hidden />
        <Field required>
          <Label>{t('Current password', '当前密码')}</Label>
          <PasswordInput size="lg" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} data-autofocus required showLabel={t('Show password', '显示密码')} hideLabel={t('Hide password', '隐藏密码')} />
        </Field>
        <Field required>
          <Label>{t('New password (at least 12 characters)', '新密码（至少 12 位）')}</Label>
          <PasswordInput size="lg" autoComplete="new-password" minLength={12} value={next} onChange={(e) => setNext(e.target.value)} required showLabel={t('Show password', '显示密码')} hideLabel={t('Hide password', '隐藏密码')} />
        </Field>
        <Field required>
          <Label>{t('Repeat new password', '再次输入新密码')}</Label>
          <PasswordInput size="lg" autoComplete="new-password" minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} required showLabel={t('Show password', '显示密码')} hideLabel={t('Hide password', '隐藏密码')} />
        </Field>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={busy}>
          {t('Change password', '修改密码')}
        </Button>
      </form>
    </Dialog>
  );
}

const ROLE: Record<TokenRow['role'], [string, string]> = { owner: ['Owner', '超级管理员'], admin: ['Admin', '管理员'], writer: ['Writer', '写入'], reader: ['Reader', '只读'] };

interface TokensData { tokens: TokenRow[]; now: number; expiry: { id: string; en: string; zh: string }[]; expiryDefault: string }

export function TokensDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const [data, setData] = useState<TokensData | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('writer');
  const [expires, setExpires] = useState('30');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ row: TokenRow; secret: string } | null>(null);
  const [revoke, setRevoke] = useState<TokenRow | null>(null);

  const refresh = async () => {
    invalidate('/~mio/api/tokens');
    const r = await load<TokensData>('/~mio/api/tokens', 0);
    if (r.status === 200) {
      setData(r.body);
      setExpires((e) => e || r.body.expiryDefault);
    }
  };
  useEffect(() => {
    if (open) void refresh();
    else {
      setCreated(null);
      setErr('');
      setName('');
    }
  }, [open]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || busy) return;
    if (!name.trim()) {
      setErr(t('Name must be 1–64 characters.', '名称需为 1–64 个字符。'));
      setShake((n) => n + 1);
      return;
    }
    setBusy(true);
    const r = await post<{ token?: TokenRow; secret?: string; error?: string }>('/~mio/api/tokens', { name, role, expires }, session.csrf);
    setBusy(false);
    if (r.status === 200 && r.body.token && r.body.secret) {
      setCreated({ row: r.body.token, secret: r.body.secret });
      setName('');
      setErr('');
      void refresh();
    } else {
      setErr(r.body.error || t('Something went wrong.', '出错了，请稍后再试。'));
      setShake((n) => n + 1);
    }
  };

  const doRevoke = async () => {
    if (!session || !revoke) return;
    const r = await post(`/~mio/api/tokens/${encodeURIComponent(revoke.id)}/revoke`, {}, session.csrf);
    if (r.status !== 200 && r.status !== 404) throw new Error(t('Could not revoke the token.', '吊销失败。'));
    if (created?.row.id === revoke.id) setCreated(null);
    await refresh();
  };

  const now = data?.now ?? Date.now();
  const expiryCell = (r: TokenRow) =>
    !r.expires_at ? (
      t('Never', '永不过期')
    ) : now >= r.expires_at ? (
      <Badge variant="danger" title={fmtTime(r.expires_at) + ' UTC'}>
        {t('Expired', '已过期')}
      </Badge>
    ) : (
      <span title={fmtTime(r.expires_at) + ' UTC'}>{new Date(r.expires_at).toISOString().slice(0, 10)}</span>
    );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        closeLabel={t('Close', '关闭')}
        title={t('Access tokens', '访问令牌')}
        description={t('One token per assistant. Revoking takes effect immediately; an expired token stops working at once.', '每个助手一个令牌。吊销立即生效，过期的令牌也会立刻失效。')}
        footer={
          <Button variant="secondary" size="md" onClick={onClose}>
            {t('Done', '完成')}
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          {created && (
            <section role="status" className="flex flex-col gap-2 rounded-panel bg-accent-soft p-4">
              <h3 className="text-heading font-semibold">{t('Copy your new token', '复制新令牌')}</h3>
              <p className="text-footnote text-text-secondary">
                {t(`Token “${created.row.name}” (${ROLE[created.row.role][0]}) created.`, `已创建令牌「${created.row.name}」（${ROLE[created.row.role][1]}）。`)}{' '}
                {created.row.expires_at
                  ? t(`Expires ${new Date(created.row.expires_at).toISOString().slice(0, 10)}.`, `到期：${new Date(created.row.expires_at).toISOString().slice(0, 10)}。`)
                  : t('Never expires.', '永不过期。')}{' '}
                {t('It will not be shown again.', '离开后不会再显示。')}
              </p>
              <CopyField value={created.secret} size="lg" aria-label="token" copyLabel={t('Copy', '复制')} copiedLabel={t('Copied', '已复制')} />
              <p className="text-footnote text-text-secondary">
                {t('Use it as the HTTP password for git (any username). Only its SHA-256 hash is stored.', '在 git 里作为 HTTP 密码使用（用户名随意）。服务器只保存它的 SHA-256 哈希。')}
              </p>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-heading font-semibold">{t('Your tokens', '已有令牌')}</h3>
            {!data ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : data.tokens.length === 0 ? (
              <p className="rounded-panel bg-fill-secondary px-4 py-3 text-footnote text-text-secondary">
                {t('No tokens yet. The original push password keeps working as an admin token.', '还没有令牌。原来的推送密码继续作为管理员令牌有效。')}
              </p>
            ) : (
              <div className="cds-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Name', '名称')}</th>
                      <th>{t('Role', '角色')}</th>
                      <th className="max-sm:hidden">{t('Created', '创建时间')}</th>
                      <th className="max-sm:hidden">{t('Expires', '到期')}</th>
                      <th className="max-md:hidden">{t('Last used', '最近使用')}</th>
                      <th>
                        <span className="sr-only">{t('Actions', '操作')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tokens.map((r) => {
                      const expired = r.expires_at > 0 && now >= r.expires_at;
                      return (
                        <tr key={r.id} className={cn(expired && 'opacity-70')}>
                          <td className="min-w-0">
                            <span className="font-medium text-text-primary">{r.name}</span>
                            <span className="mt-0.5 block text-[11.5px] sm:hidden">
                              {t('Expires', '到期')} {expiryCell(r)} · {t('Last used', '最近使用')} {r.last_used ? fmtTime(r.last_used) : t('never', '从未')}
                            </span>
                          </td>
                          <td>
                            <Badge variant={r.role === 'admin' || r.role === 'owner' ? 'accent' : 'neutral'}>{lang === 'zh' ? ROLE[r.role][1] : ROLE[r.role][0]}</Badge>
                          </td>
                          <td className="tabular-nums max-sm:hidden">{fmtTime(r.created)}</td>
                          <td className="tabular-nums max-sm:hidden">{expiryCell(r)}</td>
                          <td className="tabular-nums max-md:hidden">{r.last_used ? fmtTime(r.last_used) : t('Never', '从未')}</td>
                          <td className="text-end">
                            <Button variant="ghost" size="xs" className="text-danger" onClick={() => setRevoke(r)}>
                              {expired ? t('Delete', '删除') : t('Revoke', '吊销')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <form onSubmit={create} className="flex flex-col gap-2" noValidate>
            <h3 className="text-heading font-semibold">{t('New token', '新建令牌')}</h3>
            <ShakeError message={err} shakeKey={shake} />
            {/* one row: name + role + expiry + create, all 40px high (stacks on phones) */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field className="min-w-0 flex-1">
                <Label>{t('Name', '名称')}</Label>
                <Input size="lg" maxLength={64} placeholder="hark6" autoComplete="off" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field className="sm:w-36">
                <Label>{t('Role', '角色')}</Label>
                <Select
                  size="lg"
                  value={role}
                  onValueChange={setRole}
                  options={[
                    { value: 'writer', label: `${ROLE.writer[1]} writer` },
                    { value: 'reader', label: `${ROLE.reader[1]} reader` },
                    { value: 'admin', label: `${ROLE.admin[1]} admin` },
                    { value: 'owner', label: `${ROLE.owner[1]} owner` },
                  ]}
                />
              </Field>
              <Field className="sm:w-36">
                <Label>{t('Expiration', '过期时间')}</Label>
                <Select size="lg" value={expires} onValueChange={setExpires} options={(data?.expiry ?? [{ id: '30', en: '30 days', zh: '30 天' }]).map((x) => ({ value: x.id, label: lang === 'zh' ? x.zh : x.en }))} />
              </Field>
              <Button type="submit" variant="primary" size="lg" loading={busy} className="shrink-0">
                {t('Create token', '创建令牌')}
              </Button>
            </div>
            <HelperText>
              {t(
                'Writer: read everything, push branches other than main; no tags, no new repositories. Reader: read only. The token is shown once.',
                '写入：可读全部仓库，可推送 main 以外的分支，不能推标签、不能建仓库。只读：只能拉取。令牌明文只显示一次。',
              )}
            </HelperText>
          </form>
        </div>
        <ConfirmDialog
          open={!!revoke}
          onOpenChange={(o) => !o && setRevoke(null)}
          title={revoke ? t(`Revoke “${revoke.name}”?`, `吊销「${revoke.name}」？`) : ''}
          description={t('Every git request with this token fails from now on. This cannot be undone; create a new token instead.', '之后所有使用这个令牌的 git 请求都会失败。不能撤销，需要时请新建令牌。')}
          confirmLabel={t('Revoke', '吊销')}
          cancelLabel={t('Cancel', '取消')}
          onConfirm={doRevoke}
        />
      </Dialog>
    </>
  );
}
