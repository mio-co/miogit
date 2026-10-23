// Which URLs the frontend renders, and the API URL behind each one. Mirrors
// src/spa.ts isSpaSub() and the Worker's data keys (src/mod.ts / src/admin.ts).

const SPA_SUBS = ['/log', '/branches', '/tags', '/commit', '/tag'];

export function isSpaSub(sub: string): boolean {
  if (sub === '/' || sub === '') return true;
  if (sub === '/tree' || sub.startsWith('/tree/')) return true;
  return SPA_SUBS.some((p) => sub === p || sub === `${p}/`);
}

/** null = not a frontend page (server-rendered: blame, stats, raw files, archives, the editor …) */
export function apiFor(pathname: string, search: string): string | null {
  if (pathname === '/') return '/api/repos';
  if (pathname === '/~mio' || pathname === '/~mio/' || pathname === '/~mio/tokens' || pathname === '/~mio/password') return '/~mio/api/repos';
  if (pathname === '/~mio/login') return '/api/repos';
  let m = /^\/~mio\/repos\/([^/]+)$/.exec(pathname);
  if (m) return `/~mio/api/repos/${m[1]}`;
  m = /^\/~mio\/r\/([^/]+)(\/.*)$/.exec(pathname);
  if (m) return isSpaSub(m[2]) ? `/~mio/api/r/${m[1]}/view${m[2]}${search}` : null;
  if (pathname.startsWith('/~') || pathname.startsWith('/api/')) return null;
  m = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (m) {
    const sub = m[2] ?? '/';
    return isSpaSub(sub) ? `/${m[1]}/api/view${sub}${search}` : null;
  }
  return null;
}

export const inConsolePath = (p: string) => p === '/~mio' || p.startsWith('/~mio/');
