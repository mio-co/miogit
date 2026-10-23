import { Outlet, ScrollRestoration, useNavigation, useRouteError, isRouteErrorResponse } from 'react-router';
import { TopLoadingBar } from '@/components/ui/feedback';
import { Toaster } from '@/components/ui/toast';
import { Footer, TopBar } from '@/components/app/top-bar';
import { PasswordDialog, TokensDialog } from '@/components/app/dialogs';
import { ErrorView } from '@/components/app/repo-views';
import { useI18n } from './i18n';
import { useSession } from './session';

function AccountDialogs() {
  const { dialog, setDialog } = useSession();
  return (
    <>
      <TokensDialog open={dialog === 'tokens'} onClose={() => setDialog(null)} />
      <PasswordDialog open={dialog === 'password'} onClose={() => setDialog(null)} />
    </>
  );
}

export function Shell() {
  const nav = useNavigation();
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <TopLoadingBar loading={nav.state === 'loading'} label={t('Loading', '加载中')} />
      <TopBar />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
      <Footer />
      <AccountDialogs />
      <Toaster position="bottom-center" label={t('Notifications', '通知')} closeLabel={t('Dismiss', '关闭')} />
      <ScrollRestoration />
    </div>
  );
}

export function RouteError() {
  const err = useRouteError();
  const { t } = useI18n();
  const status = isRouteErrorResponse(err) ? err.status : 500;
  const msg = isRouteErrorResponse(err) ? err.statusText : err instanceof Error ? err.message : String(err);
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-8 sm:px-6">
        <ErrorView status={status} error={msg} back={{ href: '/', label: t('All repositories', '全部仓库') }} />
      </main>
      <Footer />
    </div>
  );
}
