// <AppLink>: client-side navigation for frontend pages, with the target's data
// prefetched on hover / focus / touch / press; a plain <a> (full page load) for
// server-rendered pages and for crossing the /~mio/ boundary (Cloudflare Access
// must see that request).
import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { prefetch } from './api';
import { apiFor, inConsolePath } from './paths';

export type AppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; noPrefetch?: boolean };

export function isClientRoute(href: string, here: string): { ok: boolean; api: string | null } {
  if (typeof window === 'undefined') return { ok: false, api: null };
  let u: URL;
  try {
    u = new URL(href, window.location.href);
  } catch {
    return { ok: false, api: null };
  }
  if (u.origin !== window.location.origin) return { ok: false, api: null };
  const api = apiFor(u.pathname, u.search);
  return { ok: api !== null && inConsolePath(u.pathname) === inConsolePath(here), api };
}

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink({ href, noPrefetch, onPointerEnter, onFocus, onTouchStart, onPointerDown, ...rest }, ref) {
  const loc = useLocation();
  const { ok, api } = isClientRoute(href, loc.pathname);
  if (!ok || href.startsWith('#') || rest.target === '_blank' || rest.download !== undefined) return <a ref={ref} href={href} {...rest} />;
  const pf = () => {
    if (!noPrefetch && api) prefetch(api);
  };
  return (
    <Link
      ref={ref}
      to={href}
      onPointerEnter={(e) => {
        onPointerEnter?.(e);
        pf();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        pf();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        pf();
      }}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        pf();
      }}
      {...rest}
    />
  );
});

/** for components that take a render-link callback (Tabs, Breadcrumb) */
export function linkClick(e: MouseEvent) {
  return e;
}
