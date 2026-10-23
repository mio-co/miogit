// Render smoke test (no real browser in the sandbox): bundle the app as an IIFE,
// boot it in jsdom at a given URL with the boot block a running Worker returns,
// and report React errors / empty roots. Usage:
//   node scripts/smoke-render.mjs <origin> <path> [cookie] [extra headers JSON]
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [origin, pagePath, cookie = '', extra = '{}'] = process.argv.slice(2);
const out = await build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  alias: { '@': path.join(root, 'src') },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'error',
});
const res = await fetch(origin + pagePath, { headers: { cookie, ...JSON.parse(extra) }, redirect: 'manual' });
const html = await res.text();
const errors = [];
const vc = new VirtualConsole();
vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
vc.on('jsdomError', (e) => errors.push('jsdom: ' + (e.stack || e.message)));
const dom = new JSDOM(html.replace(/<script type="module"[^>]*><\/script>/g, '').replace(/<script src="\/~static\/prefs.js"><\/script>/, ''), {
  url: origin + pagePath,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;
for (const k of ['Request', 'Response', 'Headers', 'AbortController', 'AbortSignal', 'TextEncoder', 'TextDecoder', 'FormData', 'URL', 'URLSearchParams']) w[k] = globalThis[k];
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};
w.fetch = (u, o = {}) => fetch(new URL(u, origin), { ...o, headers: { ...(o.headers || {}), cookie, ...JSON.parse(extra) } });
w.eval(out.outputFiles[0].text);
await new Promise((r) => setTimeout(r, 1500));
const rootEl = w.document.getElementById('root');
const text = rootEl.textContent.replace(/\s+/g, ' ').trim();
console.log(JSON.stringify({ status: res.status, path: pagePath, title: w.document.title, chars: text.length, sample: text.slice(0, 260), dialog: [...w.document.querySelectorAll('[role=dialog],[role=alertdialog]')].map((d) => d.textContent.replace(/\s+/g, ' ').slice(0, 300)), errors: errors.filter((e) => !/act\(|ReactDOMTestUtils|Not implemented: (navigation|HTMLCanvas)/.test(e)).slice(0, 5) }, null, 1));
process.exit(0);
