// Tiny request cache: one promise per URL, seeded from the boot block, shared by
// route loaders and hover/press prefetch. Fresh for 30 s; mutations invalidate.
import { boot } from './boot';

export interface Res<T = unknown> { status: number; body: T }

const FRESH_MS = 30_000;
const cache = new Map<string, { at: number; p: Promise<Res> }>();

for (const [url, v] of Object.entries(boot.data ?? {})) cache.set(url, { at: Date.now(), p: Promise.resolve(v) });

function onAuthLost(url: string, status: number) {
  // console session gone (signed out elsewhere / expired): back through the login dialog
  if (url.startsWith('/~mio/api/') && status === 401) {
    location.assign(`/~mio/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
}

async function fetchJson(url: string): Promise<Res> {
  let r: Response;
  try {
    r = await fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' }, redirect: 'manual' });
  } catch {
    cache.delete(url);
    return { status: 0, body: { kind: 'error', error: 'network' } };
  }
  // an opaque redirect here means Cloudflare Access wants to re-authenticate: reload the page through it
  if (r.type === 'opaqueredirect' || r.status === 0) {
    cache.delete(url);
    if (url.startsWith('/~mio/')) location.reload();
    return { status: 0, body: { kind: 'error', error: 'redirect' } };
  }
  onAuthLost(url, r.status);
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    body = { kind: 'error', error: `HTTP ${r.status}` };
  }
  if (r.status >= 500) cache.delete(url);
  return { status: r.status, body };
}

export function load<T = unknown>(url: string, maxAge = FRESH_MS): Promise<Res<T>> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < maxAge) return hit.p as Promise<Res<T>>;
  const p = fetchJson(url);
  cache.set(url, { at: Date.now(), p });
  return p as Promise<Res<T>>;
}

export function prefetch(url: string) {
  void load(url);
}

/** drop cached entries (all, or those whose URL starts with prefix) */
export function invalidate(prefix?: string) {
  if (!prefix) return cache.clear();
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
}

/** JSON POST to the console API with the CSRF header */
export async function post<T = Record<string, unknown>>(url: string, body: unknown, csrf?: string): Promise<Res<T>> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { status: 0, body: { error: 'network' } as T };
  }
  if (r.type === 'opaqueredirect') {
    location.reload();
    return { status: 0, body: { error: 'redirect' } as T };
  }
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    data = { error: `HTTP ${r.status}` };
  }
  return { status: r.status, body: data as T };
}
