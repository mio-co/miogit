import { UI_VER } from "./mio";
const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;",
};

export function esc(s: string): string {
  return s.replace(/[&<>"'`]/g, (c) => ESCAPES[c]);
}

/** repo name as a URL path — a namespaced name's slash stays a separator */
export function repoUrl(repo: string): string {
  return repo.split("/").map(encodeURIComponent).join("/");
}

/** repo name as a filename stem: the last segment of a namespaced name */
export function repoBase(repo: string): string {
  return repo.slice(repo.lastIndexOf("/") + 1);
}

/** cgit-style relative age with its color class, e.g. "3 days" / age-days. */
export function age(unixSecs: number): string {
  if (!unixSecs) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - unixSecs);
  const fmt = (n: number, unit: string, cls: string) =>
    `<span class='age-${cls}'>${n} ${unit}${n === 1 ? "" : unit.endsWith(".") ? "" : "s"}</span>`;
  if (secs < 3600) return fmt(Math.max(1, Math.floor(secs / 60)), "min.", "mins");
  if (secs < 24 * 3600) return fmt(Math.floor(secs / 3600), "hour", "hours");
  if (secs < 7 * 24 * 3600) return fmt(Math.floor(secs / (24 * 3600)), "day", "days");
  if (secs < 31 * 24 * 3600) return fmt(Math.floor(secs / (7 * 24 * 3600)), "week", "weeks");
  if (secs < 365 * 24 * 3600) return fmt(Math.floor(secs / (30 * 24 * 3600)), "month", "months");
  return fmt(Math.floor(secs / (365 * 24 * 3600)), "year", "years");
}

export function fmtDate(unixSecs: number, tz: string): string {
  const d = new Date(unixSecs * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${tz}`
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** RFC 2822 date in the person's own timezone (for patch/atom output). */
export function fmtDate2822(unixSecs: number, tz: string): string {
  const offMin = (parseInt(tz.slice(0, 3), 10) || 0) * 60 + (parseInt(tz.slice(0, 1) + tz.slice(3), 10) || 0);
  const d = new Date((unixSecs + offMin * 60) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${tz}`
  );
}

export interface LayoutOpts {
  site: string;
  siteDesc: string;
  title: string;
  /** repo name when rendering a repo page */
  repo?: string;
  /** description line under the title */
  sub: string;
  /** rendered after <main>, outside every transformed container (modal dialogs) */
  overlay?: string;
  /** active tab id */
  tab?: string;
  /** current ref for tab links */
  ref?: string;
  /** breadcrumb path html (tree pages) */
  pathBar?: string;
  /** show the about tab (repo has a README) */
  hasAbout?: boolean;
  /** branch names for the switcher dropdown */
  branches?: string[];
  /** form action for the branch switcher (current page path) */
  formAction?: string;
  body: string;
}

const ICON_SUN = `<svg viewBox='0 0 256 256' aria-hidden='true'><circle cx='128' cy='128' r='48' fill='none' stroke='currentColor' stroke-width='16'/><path d='M128 24v20M128 212v20M54.5 54.5l14.1 14.1M187.4 187.4l14.1 14.1M24 128h20M212 128h20M54.5 201.5l14.1-14.1M187.4 68.6l14.1-14.1' stroke='currentColor' stroke-width='16' stroke-linecap='round'/></svg>`;
const ICON_MOON = `<svg viewBox='0 0 256 256' aria-hidden='true'><path d='M216.7 152.6A91.9 91.9 0 0 1 103.4 39.3a92 92 0 1 0 113.3 113.3Z' fill='none' stroke='currentColor' stroke-width='16' stroke-linejoin='round'/></svg>`;
const ICON_AUTO = `<svg viewBox='0 0 256 256' aria-hidden='true'><rect x='32' y='48' width='192' height='136' rx='12' fill='none' stroke='currentColor' stroke-width='16'/><path d='M96 216h64M128 184v32' stroke='currentColor' stroke-width='16' stroke-linecap='round'/></svg>`;

/** bilingual inline text: English in the HTML, Chinese swapped in client-side */
export function t(en: string, zh: string): string {
  return `<span data-zh='${esc(zh)}'>${esc(en)}</span>`;
}

export function layout(o: LayoutOpts): string {
  const r = o.repo ? `/${repoUrl(o.repo)}` : "";
  const q = o.ref ? `?h=${encodeURIComponent(o.ref)}` : "";
  const tabs: [string, string][] = o.repo
    ? [
        ["summary", `${r}/${q}`],
        ["tree", `${r}/tree/${q}`],
        ["log", `${r}/log/${q}`],
        ["refs", `${r}/refs/${q}`],
        ["commit", `${r}/commit/${q}`],
        ["diff", `${r}/diff/${q}`],
        ["stats", `${r}/stats/${q}`],
        ...(o.hasAbout ? [["about", `${r}/about/${q}`] as [string, string]] : []),
      ]
    : [];
  const tabHtml = tabs
    .map(([id, href]) => `<a${id === o.tab ? " class='active' aria-current='page'" : ""} href='${href}'>${id}</a>`)
    .join("");
  const switcher =
    o.repo && o.branches && o.branches.length > 1
      ? `<form method='get' action='${esc(o.formAction ?? `${r}/`)}'>` +
        `<select name='h' aria-label='branch'>` +
        o.branches
          .map((b) => `<option value='${esc(b)}'${b === o.ref ? " selected='selected'" : ""}>${esc(b)}</option>`)
          .join("") +
        `</select> <input type='submit' value='switch'/></form>`
      : "";
  const atom = o.repo
    ? `<link rel='alternate' title='Atom feed' href='${r}/atom/${q}' type='application/atom+xml'/>`
    : "";
  const crumb = o.repo
    ? `<span class='sep'>/</span><a href='${r}/'>${esc(o.repo)}</a>`
    : "";
  const head = o.tab === "login" ? "" : o.repo
    ? `<div class='mio-head'><h1>${esc(o.repo)}</h1>${o.ref ? `<span class='mio-badge mono'>${esc(o.ref)}</span>` : ""}</div>` +
      `<p class='mio-sub'>${o.sub ? esc(o.sub) : t("No description", "暂无描述")}</p>`
    : `<div class='mio-head'><h1>${t("Repositories", "仓库")}</h1></div>` +
      (o.siteDesc || o.sub ? `<p class='mio-sub'>${esc(o.siteDesc || o.sub)}</p>` : `<div style='height:14px'></div>`);
  return `<!DOCTYPE html>
<html lang='en' data-accent='clay'>
<head>
<meta charset='utf-8'/>
<title>${esc(o.title)}</title>
<meta name='generator' content='MioGit'/>
<meta name='viewport' content='width=device-width, initial-scale=1'/>
<meta name='color-scheme' content='light dark'/>
<script src='/app.js?v=${UI_VER}'></script>
<link rel='icon' type='image/svg+xml' href='/favicon.svg'/>
<link rel='stylesheet' type='text/css' href='/cgit.css?v=${UI_VER}'/>
${atom}
</head>
<body>
<header class='mio-top'><div class='mio-wrap'>
<a class='mio-brand' href='/'><svg class='mio-logo' viewBox='0 0 64 64' aria-hidden='true'><path d='M8 50V15l18 19 18-19v35' fill='none' stroke='currentColor' stroke-width='7.5' stroke-linecap='round' stroke-linejoin='round'/><circle cx='56.5' cy='50' r='5' fill='#d97757'/></svg><span class='site'>${esc(o.site)}</span></a>
<nav class='mio-crumb' aria-label='breadcrumb'>${crumb}</nav>
<div class='mio-actions'>
<span id='mh-auth'></span>
<div class='mio-seg' role='group' aria-label='Language'><button type='button' data-set-lang='zh'>中</button><button type='button' data-set-lang='en'>EN</button></div>
<div class='mio-seg' role='group' aria-label='Theme'><button type='button' data-set-theme='light' title='Light' aria-label='Light' data-zh-title='浅色'>${ICON_SUN}</button><button type='button' data-set-theme='system' title='System' aria-label='System' data-zh-title='跟随系统'>${ICON_AUTO}</button><button type='button' data-set-theme='dark' title='Dark' aria-label='Dark' data-zh-title='深色'>${ICON_MOON}</button></div>
</div>
</div></header>
<main id='cgit'>
${head}
${tabHtml || switcher ? `<nav class='mio-tabs'>${tabHtml}${switcher}</nav>` : ""}
${o.pathBar ? `<div class='path'>${o.pathBar}</div>` : ""}
<div class='content'>
${o.body}
</div>
</main>
<footer class='mio-foot'><div class='mio-wrap mio-foot-in'><div class='mio-copy'>&copy; ${new Date().getUTCFullYear()} Mio</div><nav class='mio-friends' aria-label='Friends'><a href='https://mio.300031.xyz' target='_blank' rel='noopener'>MioCore</a><a href='https://overlord.300031.xyz/#top' target='_blank' rel='noopener'>OVERLORD</a><a href='https://cee.edu.pl' target='_blank' rel='noopener'>CeeMail</a><a href='https://nats.300031.xyz/' target='_blank' rel='noopener'>Amaeru Connect</a></nav></div></footer>
${o.overlay ?? ""}
</body>
</html>
`;
}

const CSP =
  "default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}

export function errorPage(o: Omit<LayoutOpts, "body">, msg: string, status = 404): Response {
  return htmlResponse(layout({ ...o, body: `<div class='error'>${esc(msg)}</div>` }), status);
}
