// Index (public list), console home (storage + every repository), and the
// console's sign-in / account-dialog deep links (/~mio/login, /~mio/tokens, /~mio/password).
import { useLoaderData, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '@/components/ui/alert';
import type { Res } from '@/app/api';
import type { RepoItem, Storage } from '@/app/types';
import { boot } from '@/app/boot';
import { useI18n } from '@/app/i18n';
import { useSession } from '@/app/session';
import { RepoList } from '@/components/app/repo-list';
import { StorageCard } from '@/components/app/storage-card';
import { LoginDialog, PasswordDialog, TokensDialog } from '@/components/app/dialogs';

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-title2 font-semibold">{title}</h1>
      {sub && <p className="text-body text-text-secondary">{sub}</p>}
    </div>
  );
}

export function IndexPage() {
  const { t } = useI18n();
  const res = useLoaderData() as Res<{ repos: RepoItem[] }>;
  document.title = boot.site;
  return (
    <div className="mio-page-in flex flex-col gap-5">
      <Heading title={t('Repositories', '仓库')} />
      <RepoList repos={res?.body?.repos ?? []} />
    </div>
  );
}

/** safe "next" for the account dialogs: console paths only, never another dialog */
function dialogNext(n: string | null): string {
  const v = n && n.startsWith('/~mio/') && !n.startsWith('//') && !n.includes('\\') ? n : '/~mio/';
  return /^\/~mio\/(tokens|password|login|logout)(\/|\?|$)/.test(v) ? '/~mio/' : v;
}

export function ConsoleHome({ dialog }: { dialog?: 'tokens' | 'password' }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const res = useLoaderData() as Res<{ repos: RepoItem[]; storage: Storage }>;
  const done = sp.get('done');
  const dn = sp.get('name') ?? '';
  const notice =
    done === 'password'
      ? t('Password changed.', '密码已修改。')
      : done === 'settings'
        ? t('Settings saved.', '设置已保存。')
        : done === 'deleted' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dn) && dn.length <= 100
          ? t(`Repository “${dn}” deleted.`, `已删除仓库「${dn}」。`)
          : '';
  document.title = `${boot.site} · console`;
  const close = () => nav(dialogNext(sp.get('next')));
  return (
    <div className="mio-page-in flex flex-col gap-5">
      <Heading title={t('Repositories', '仓库')} />
      {notice && <Alert variant="success">{notice}</Alert>}
      {res?.status === 200 && (
        <>
          {res.body.repos.length > 0 && <StorageCard s={res.body.storage} />}
          <RepoList repos={res.body.repos} linkBase="/~mio/r" signedIn />
        </>
      )}
      {dialog === 'tokens' && <TokensDialog open onClose={close} />}
      {dialog === 'password' && <PasswordDialog open onClose={close} />}
    </div>
  );
}

export function LoginPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { session } = useSession();
  const res = useLoaderData() as Res<{ repos: RepoItem[] }>;
  document.title = `${t('Sign in', '登录')} · ${boot.site}`;
  return (
    <div className="flex flex-col gap-5">
      <div inert aria-hidden className="flex flex-col gap-5">
        <Heading title={t('Repositories', '仓库')} />
        <RepoList repos={res?.body?.repos ?? []} />
      </div>
      {/* × leaves the console (full load so the public pages see the cookies as they are) */}
      <LoginDialog open={!session} onClose={() => location.assign('/')} onSignedIn={(next) => nav(next, { replace: true })} />
    </div>
  );
}
