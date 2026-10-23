// Top bar: logo, account slot, language + theme. Built from MioUI Button/LinkButton,
// DropdownMenu, Segmented and ThemeToggle (no new primitives).
import { CaretDown, Key, LockKey, SignIn, SignOut, UserCircle } from '@phosphor-icons/react';
import { useLocation, useNavigate } from 'react-router';
import { Button, LinkButton } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Segmented } from '@/components/ui/segmented';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { boot } from '@/app/boot';
import { post } from '@/app/api';
import { useI18n } from '@/app/i18n';
import { AppLink } from '@/app/link';
import { inConsolePath } from '@/app/paths';
import { useSession } from '@/app/session';

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className="size-[22px] shrink-0">
      <path d="M8 50V15l18 19 18-19v35" fill="none" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="56.5" cy="50" r="5" className="fill-clay" />
    </svg>
  );
}

function AccountMenu() {
  const { t } = useI18n();
  const { session, setDialog } = useSession();
  if (!session) return null;
  const signOut = async () => {
    await post('/~mio/api/logout', {}, session.csrf);
    location.assign('/');
  };
  return (
    <DropdownMenu
      align="end"
      aria-label={t('Account', '账户')}
      // [phone ≤640px] the panel is pinned 12px from the viewport's right edge, under the bar
      className="w-56 max-sm:!right-3"
      trigger={
        <Button variant="ghost" size="sm" aria-label={t('Account', '账户')} startIcon={<UserCircle />} endIcon={<CaretDown className="opacity-60" />}>
          <span className="max-[420px]:sr-only">{session.user}</span>
        </Button>
      }
    >
      <DropdownMenuLabel>
        {t('Signed in as', '已登录：')} <b className="font-semibold text-text-primary">{session.user}</b>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<Key />} onSelect={() => setDialog('tokens')}>
        {t('Access tokens', '访问令牌')}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<LockKey />} onSelect={() => setDialog('password')}>
        {t('Change password', '修改密码')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<SignOut />} onSelect={signOut}>
        {t('Sign out', '退出')}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

export function TopBar() {
  const { t, lang, setLang, theme, setTheme } = useI18n();
  const loc = useLocation();
  const { session } = useSession();
  const consolePage = inConsolePath(loc.pathname);
  const signed = consolePage ? !!session : boot.signed;
  const home = signed ? '/~mio/' : '/';
  const loginPage = loc.pathname === '/~mio/login';
  return (
    <header className="sticky top-0 z-40 bg-surface-1/85 shadow-[inset_0_-1px_0_var(--cds-border)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
        <AppLink href={home} className="cds-focus flex min-w-0 items-center gap-2 rounded-md text-[15px] font-semibold text-text-primary">
          <Logo />
          <span className="truncate">{boot.site}</span>
        </AppLink>
        <div className="ms-auto flex items-center gap-2">
          {consolePage ? (
            <AccountMenu />
          ) : signed ? (
            <LinkButton href="/~mio/" rel="nofollow" variant="ghost" size="sm" startIcon={<UserCircle />} title={t('Manage', '管理')} data-auth="in">
              <span className="max-[420px]:sr-only">{t('Manage', '管理')}</span>
            </LinkButton>
          ) : (
            <LinkButton href="/~mio/login" rel="nofollow" variant="ghost" size="sm" startIcon={<SignIn />} title={t('Sign in', '登录')} data-auth="out">
              <span className="max-[420px]:sr-only">{t('Sign in', '登录')}</span>
            </LinkButton>
          )}
          {loginPage && null}
          <Segmented
            ariaLabel={t('Language', '语言')}
            value={lang}
            onChange={setLang}
            layoutId="topbar-lang"
            options={[
              { value: 'zh', label: '中' },
              { value: 'en', label: 'EN' },
            ]}
          />
          <ThemeToggle
            value={theme}
            onValueChange={setTheme}
            iconOnly
            label={t('Theme', '主题')}
            labels={{ light: t('Light', '浅色'), dark: t('Dark', '深色'), system: t('System', '跟随系统') }}
            className="max-sm:hidden"
          />
          <ThemeToggle
            variant="icon"
            value={theme}
            onValueChange={setTheme}
            label={t('Theme', '主题')}
            labels={{ light: t('Light', '浅色'), dark: t('Dark', '深色'), system: t('System', '跟随系统') }}
            iconLabel={(c, n) => t(`Theme: ${c}, switch to ${n}`, `主题：${c}，点击切换到${n}`)}
            className="sm:hidden"
          />
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const links: [string, string][] = [
    ['MioCore', 'https://mio.300031.xyz'],
    ['OVERLORD', 'https://overlord.300031.xyz/#top'],
    ['CeeMail', 'https://cee.edu.pl'],
    ['Amaeru Connect', 'https://nats.300031.xyz/'],
  ];
  return (
    <footer className="mt-auto shadow-[inset_0_1px_0_var(--cds-border)]">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-footnote text-text-secondary sm:px-6">
        <div>&copy; {new Date().getUTCFullYear()} Mio</div>
        <nav aria-label="Friends" className="flex flex-wrap gap-4">
          {links.map(([n, h]) => (
            <a key={n} href={h} target="_blank" rel="noopener" className="cds-focus rounded-sm transition-colors duration-(--cds-dur-snap) hover:text-text-primary">
              {n}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function useNav() {
  return useNavigate();
}
